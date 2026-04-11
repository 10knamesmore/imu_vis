//! 离线 replay 工具。
//!
//! 从 SQLite 读取已录制的原始 IMU 样本，用当前 `processor.toml` 重新跑
//! `ProcessorPipeline`，导出轨迹 CSV + 诊断 CSV，并可选地调用
//! `scripts/report.py` 生成紧凑 Markdown 报告供 Claude Code 消费。
//!
//! 用途：让参数/算法的调整不必重新采集真实硬件数据。同一 session + 同一
//! `processor.toml` ⇒ 逐位一致的输出，便于回归对比。
//!
//! CLI：
//! ```bash
//! cargo run --release --bin replay -- \
//!     --session 正方形2 \
//!     --reference ../scripts/reference_正方形.csv
//! ```

use std::{
    path::{Path, PathBuf},
    process::Command,
    sync::{atomic::AtomicBool, Arc},
};

use anyhow::{anyhow, Context, Result};
use math_f64::{DQuat, DVec3};
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, QueryOrder};

use tauri_app_lib::processor::{
    parser::ImuSampleRaw,
    pipeline::{
        diagnostics::{PipelineDiagnostics, QueueProbe},
        ProcessorPipeline, ProcessorPipelineConfig,
    },
    RawImuData,
};
use tauri_app_lib::recorder::{db, models};

/// 解析过的 CLI 参数。
struct Args {
    session: String,
    reference: Option<PathBuf>,
    traj_out: Option<PathBuf>,
    diag_out: Option<PathBuf>,
    no_report: bool,
    db_path: Option<PathBuf>,
    /// 把管线产出的 calc_* 字段写回 SQLite，覆盖录制时存储的值。破坏性操作。
    write_back: bool,
}

fn parse_args() -> Result<Args> {
    let mut session: Option<String> = None;
    let mut reference: Option<PathBuf> = None;
    let mut traj_out: Option<PathBuf> = None;
    let mut diag_out: Option<PathBuf> = None;
    let mut db_path: Option<PathBuf> = None;
    let mut no_report = false;
    let mut write_back = false;

    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "--session" | "-s" => session = Some(it.next().context("--session 缺少值")?),
            "--reference" | "-r" => reference = Some(PathBuf::from(it.next().context("--reference 缺少值")?)),
            "--traj-out" => traj_out = Some(PathBuf::from(it.next().context("--traj-out 缺少值")?)),
            "--diag-out" => diag_out = Some(PathBuf::from(it.next().context("--diag-out 缺少值")?)),
            "--db" => db_path = Some(PathBuf::from(it.next().context("--db 缺少值")?)),
            "--no-report" => no_report = true,
            "--write-back" => write_back = true,
            "-h" | "--help" => {
                print_help();
                std::process::exit(0);
            }
            other => return Err(anyhow!("未知参数: {other}")),
        }
    }

    let session = session.ok_or_else(|| anyhow!("必须提供 --session <name_or_id>"))?;
    Ok(Args {
        session,
        reference,
        traj_out,
        diag_out,
        no_report,
        db_path,
        write_back,
    })
}

fn print_help() {
    eprintln!(
        "replay — 离线重跑 IMU 处理管线

用法:
  replay --session <name_or_id> [--reference <csv>] [选项]

选项:
  --session, -s <name_or_id>  录制会话名（模糊匹配）或数字 id
  --reference, -r <csv>       参考轨迹 CSV（传给报告脚本）
  --traj-out <path>           轨迹 CSV 输出路径（默认 exports/replay_<session>_trajectory.csv）
  --diag-out <path>           诊断 CSV 输出路径（默认 exports/replay_<session>_diag.csv）
  --db <path>                 SQLite 路径（默认 imu_recordings.sqlite）
  --no-report                 只落盘 CSV，不调 scripts/report.py
  --write-back                破坏性：用新算法产出的 calc_* 字段覆盖 SQLite 原值
  -h, --help                  显示帮助"
    );
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = parse_args()?;

    // —— 1. 读 processor.toml ——
    let snapshot = ProcessorPipelineConfig::load_from_default_paths_with_modified()
        .context("读取 processor.toml 失败")?;
    let config = snapshot.config.clone();
    eprintln!("[replay] 使用配置: {}", snapshot.source.display());

    // —— 2. 打开 DB，定位 session ——
    let db_path = match args.db_path {
        Some(p) => p,
        None => db::recording_db_path()?,
    };
    eprintln!("[replay] 打开数据库: {}", db_path.display());
    let conn = db::connect(&db_path).await?;
    db::ensure_schema(&conn).await?;

    let session = locate_session(&conn, &args.session).await?;
    let session_id = session.id;
    let session_label = session
        .name
        .clone()
        .unwrap_or_else(|| format!("session_{session_id}"));
    eprintln!(
        "[replay] 命中 session id={} name={:?} started_at_ms={}",
        session_id, session.name, session.started_at_ms
    );

    // —— 3. 读原始样本 ——
    let rows = models::imu_samples::Entity::find()
        .filter(models::imu_samples::Column::SessionId.eq(session_id))
        .order_by_asc(models::imu_samples::Column::TimestampMs)
        .all(&conn)
        .await
        .context("查询原始样本失败")?;
    eprintln!("[replay] 样本数: {}", rows.len());
    if rows.is_empty() {
        return Err(anyhow!("session {} 没有任何样本", session_id));
    }

    // —— 4. 构造 pipeline（诊断常开） ——
    let (diag_tx, diag_rx) = flume::unbounded::<PipelineDiagnostics>();
    // Stub 通道：replay 不走真实上下游，用本地 unbounded 句柄占位即可。
    let (upstream_tx, upstream_rx) = flume::unbounded::<RawImuData>();
    std::mem::forget(upstream_tx); // 保持发送端存活，避免队列探针误报断连
    let (downstream_tx, _downstream_rx) = flume::unbounded();
    let (record_tx, _record_rx) = flume::unbounded();
    let queue_probe = QueueProbe::new(upstream_rx, downstream_tx, record_tx);
    let diag_flag = Arc::new(AtomicBool::new(true));
    let mut pipeline = ProcessorPipeline::new(config.clone(), diag_flag, diag_tx, queue_probe);

    // —— 5. 跑管线，收集输出帧和诊断 ——
    let mut frames: Vec<TrajectoryRow> = Vec::with_capacity(rows.len());
    let mut diags: Vec<PipelineDiagnostics> = Vec::with_capacity(rows.len());
    // 用于 write-back 模式：保留每个输出 frame 对应的原始行 id，便于按主键回写。
    let mut frame_row_ids: Vec<i64> = Vec::with_capacity(rows.len());
    for row in &rows {
        let raw = row_to_raw(row);
        if let Some(frame) = pipeline.process_sample_raw(raw) {
            frames.push(TrajectoryRow {
                timestamp_ms: frame.nav.timestamp_ms,
                pos: frame.nav.position,
                vel: frame.nav.velocity,
                att: frame.nav.attitude,
            });
            frame_row_ids.push(row.id);
        }
        while let Ok(diag) = diag_rx.try_recv() {
            diags.push(diag);
        }
    }
    // 收尾：把残留诊断抽干
    while let Ok(diag) = diag_rx.try_recv() {
        diags.push(diag);
    }
    eprintln!("[replay] 产出帧: {} 诊断: {}", frames.len(), diags.len());

    // —— 6. 写 CSV ——
    let exports_dir = db_path
        .parent()
        .context("db path 无父目录")?
        .join("exports");
    std::fs::create_dir_all(&exports_dir).context("创建 exports 目录失败")?;

    let traj_path = args
        .traj_out
        .unwrap_or_else(|| exports_dir.join(format!("replay_{session_label}_trajectory.csv")));
    let diag_path = args
        .diag_out
        .unwrap_or_else(|| exports_dir.join(format!("replay_{session_label}_diag.csv")));

    write_trajectory_csv(&traj_path, &frames).context("写 trajectory.csv 失败")?;
    write_diagnostics_csv(&diag_path, &diags).context("写 diag.csv 失败")?;
    eprintln!("[replay] 写入: {}", traj_path.display());
    eprintln!("[replay] 写入: {}", diag_path.display());

    // —— 6.5 可选：把 calc_* 字段写回 SQLite ——
    if args.write_back {
        if frames.len() != frame_row_ids.len() {
            return Err(anyhow!(
                "write-back: 帧数 ({}) 与原始行 id 数 ({}) 不一致",
                frames.len(),
                frame_row_ids.len()
            ));
        }
        eprintln!(
            "[replay] ⚠ write-back: 用新算法产出覆盖 session {} 的 {} 行 calc_* 字段",
            session_id,
            frames.len()
        );
        write_back_calc_columns(&conn, &frame_row_ids, &frames).await?;
        eprintln!("[replay] ✓ 已写回 {} 行", frames.len());
    }

    // —— 7. 调用报告脚本 ——
    if args.no_report {
        return Ok(());
    }
    let script = find_report_script(&db_path)?;
    let scripts_dir = script.parent().context("report script 无父目录")?;
    eprintln!("[replay] 运行报告: {}", script.display());
    // 优先 `uv run --project scripts python report.py`（scripts/pyproject.toml 管理依赖）,
    // 否则退化到系统 python3。
    let uv_available = Command::new("uv")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    let mut cmd = if uv_available {
        let mut c = Command::new("uv");
        c.arg("run")
            .arg("--project")
            .arg(scripts_dir)
            .arg("python")
            .arg(&script);
        c
    } else {
        let mut c = Command::new("python3");
        c.arg(&script);
        c
    };
    cmd.arg("--trajectory")
        .arg(&traj_path)
        .arg("--diag")
        .arg(&diag_path)
        .arg("--session-label")
        .arg(&session_label)
        .arg("--navigator")
        .arg(format!("{:?}", config.navigator_impl).to_lowercase())
        .arg("--integrator")
        .arg(format!("{:?}", config.trajectory.integrator).to_lowercase());
    if let Some(ref r) = args.reference {
        cmd.arg("--reference").arg(r);
    }
    let status = cmd.status().context("调用 python3 scripts/report.py 失败")?;
    if !status.success() {
        return Err(anyhow!("report.py 非零退出: {status}"));
    }
    Ok(())
}

/// 按 name（模糊）或 id 定位 session。
async fn locate_session(
    conn: &sea_orm::DatabaseConnection,
    query: &str,
) -> Result<models::recording_sessions::Model> {
    use models::recording_sessions::{Column, Entity};

    if let Ok(id) = query.parse::<i64>() {
        if let Some(s) = Entity::find()
            .filter(Column::Id.eq(id))
            .one(conn)
            .await
            .context("按 id 查询失败")?
        {
            return Ok(s);
        }
    }

    let like = format!("%{query}%");
    let mut matches = Entity::find()
        .filter(Column::Name.like(like))
        .order_by_desc(Column::StartedAtMs)
        .all(conn)
        .await
        .context("按 name 模糊查询失败")?;
    match matches.len() {
        0 => Err(anyhow!("没有匹配 session: {query}")),
        1 => Ok(matches.remove(0)),
        n => {
            let names: Vec<_> = matches
                .iter()
                .take(5)
                .map(|s| format!("{}({:?})", s.id, s.name))
                .collect();
            eprintln!(
                "[replay] 模糊命中 {n} 条，取最新一条。前几条: {}",
                names.join(", ")
            );
            Ok(matches.remove(0))
        }
    }
}

/// 把 frame 产出的 calc_* 字段按主键写回 imu_samples 表。
///
/// 破坏性操作：覆盖原有 calc_attitude_*、calc_velocity_*、calc_position_*、calc_timestamp_ms。
/// 用单个事务保证原子性；出错时回滚。
async fn write_back_calc_columns(
    conn: &sea_orm::DatabaseConnection,
    row_ids: &[i64],
    frames: &[TrajectoryRow],
) -> Result<()> {
    use sea_orm::{ConnectionTrait, Statement, TransactionTrait};

    let txn = conn.begin().await.context("开启写回事务失败")?;

    // 用参数化 SQL 更新，避免逐行构造 ActiveModel 的开销。
    const UPDATE_SQL: &str = "UPDATE imu_samples SET \
        calc_attitude_w = ?, calc_attitude_x = ?, calc_attitude_y = ?, calc_attitude_z = ?, \
        calc_velocity_x = ?, calc_velocity_y = ?, calc_velocity_z = ?, \
        calc_position_x = ?, calc_position_y = ?, calc_position_z = ?, \
        calc_timestamp_ms = ? \
        WHERE id = ?";

    for (row_id, frame) in row_ids.iter().zip(frames.iter()) {
        let stmt = Statement::from_sql_and_values(
            sea_orm::DatabaseBackend::Sqlite,
            UPDATE_SQL,
            [
                frame.att.w.into(),
                frame.att.x.into(),
                frame.att.y.into(),
                frame.att.z.into(),
                frame.vel.x.into(),
                frame.vel.y.into(),
                frame.vel.z.into(),
                frame.pos.x.into(),
                frame.pos.y.into(),
                frame.pos.z.into(),
                (frame.timestamp_ms as i64).into(),
                (*row_id).into(),
            ],
        );
        txn.execute(stmt).await.with_context(|| {
            format!("UPDATE imu_samples id={row_id} 失败（事务已中止）")
        })?;
    }

    txn.commit().await.context("提交写回事务失败")?;
    Ok(())
}

fn row_to_raw(r: &models::imu_samples::Model) -> ImuSampleRaw {
    ImuSampleRaw {
        timestamp_ms: r.timestamp_ms as u64,
        accel_no_g: DVec3::new(r.accel_no_g_x, r.accel_no_g_y, r.accel_no_g_z),
        accel_with_g: DVec3::new(r.accel_with_g_x, r.accel_with_g_y, r.accel_with_g_z),
        gyro: DVec3::new(r.gyro_x, r.gyro_y, r.gyro_z),
        quat: DQuat::from_xyzw(r.quat_x, r.quat_y, r.quat_z, r.quat_w),
        angle: DVec3::new(r.angle_x, r.angle_y, r.angle_z),
        offset: DVec3::new(r.offset_x, r.offset_y, r.offset_z),
        accel_nav: DVec3::new(r.accel_nav_x, r.accel_nav_y, r.accel_nav_z),
    }
}

struct TrajectoryRow {
    timestamp_ms: u64,
    pos: DVec3,
    vel: DVec3,
    att: DQuat,
}

fn write_trajectory_csv(path: &Path, rows: &[TrajectoryRow]) -> Result<()> {
    use std::io::Write;
    let mut f = std::io::BufWriter::new(std::fs::File::create(path)?);
    // 沿用 recorder::service::export_session_csv 的表头，保证与现有工具兼容
    writeln!(
        f,
        "timestamp_ms,calc_position_x,calc_position_y,calc_position_z,\
         calc_velocity_x,calc_velocity_y,calc_velocity_z,\
         calc_attitude_w,calc_attitude_x,calc_attitude_y,calc_attitude_z"
    )?;
    for r in rows {
        writeln!(
            f,
            "{},{},{},{},{},{},{},{},{},{},{}",
            r.timestamp_ms,
            r.pos.x,
            r.pos.y,
            r.pos.z,
            r.vel.x,
            r.vel.y,
            r.vel.z,
            r.att.w,
            r.att.x,
            r.att.y,
            r.att.z,
        )?;
    }
    Ok(())
}

fn write_diagnostics_csv(path: &Path, diags: &[PipelineDiagnostics]) -> Result<()> {
    use std::io::Write;
    let mut f = std::io::BufWriter::new(std::fs::File::create(path)?);
    writeln!(
        f,
        "timestamp_ms,is_static,zupt_gyro_norm,zupt_accel_norm,zupt_enter_count,zupt_exit_count,\
         nav_dt,nav_linear_accel_x,nav_linear_accel_y,nav_linear_accel_z,\
         cal_accel_bias_x,cal_accel_bias_y,cal_accel_bias_z,\
         cal_gyro_bias_x,cal_gyro_bias_y,cal_gyro_bias_z,\
         eskf_bias_accel_x,eskf_bias_accel_y,eskf_bias_accel_z,\
         eskf_bias_gyro_x,eskf_bias_gyro_y,eskf_bias_gyro_z,\
         eskf_cov_att_max,eskf_cov_vel_max,eskf_cov_pos_max,eskf_cov_bg_max,eskf_cov_ba_max,\
         eskf_innovation_norm,\
         backward_triggered,backward_correction_mag,\
         accel_saturated,\
         perf_process_us,perf_ble_interval_ms,\
         perf_upstream_len,perf_downstream_len,perf_record_len"
    )?;
    for d in diags {
        let (ba, bg) = (
            d.eskf_bias_accel.unwrap_or(DVec3::ZERO),
            d.eskf_bias_gyro.unwrap_or(DVec3::ZERO),
        );
        let (cov_att, cov_vel, cov_pos, cov_bg, cov_ba) = split_cov(d.eskf_cov_diag.as_ref());
        let innov_norm = d.eskf_innovation.map(|v| v.length()).unwrap_or(f64::NAN);
        writeln!(
            f,
            "{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}",
            d.timestamp_ms,
            d.zupt_is_static as u8,
            d.zupt_gyro_norm,
            d.zupt_accel_norm,
            d.zupt_enter_count,
            d.zupt_exit_count,
            d.nav_dt,
            d.nav_linear_accel.x,
            d.nav_linear_accel.y,
            d.nav_linear_accel.z,
            d.cal_accel_bias.x,
            d.cal_accel_bias.y,
            d.cal_accel_bias.z,
            d.cal_gyro_bias.x,
            d.cal_gyro_bias.y,
            d.cal_gyro_bias.z,
            ba.x,
            ba.y,
            ba.z,
            bg.x,
            bg.y,
            bg.z,
            cov_att,
            cov_vel,
            cov_pos,
            cov_bg,
            cov_ba,
            innov_norm,
            d.backward_triggered as u8,
            d.backward_correction_mag,
            d.accel_saturated as u8,
            d.perf_process_us,
            d.perf_ble_interval_ms,
            d.perf_upstream_queue_len,
            d.perf_downstream_queue_len,
            d.perf_record_queue_len,
        )?;
    }
    Ok(())
}

fn split_cov(cov: Option<&[f64; 15]>) -> (f64, f64, f64, f64, f64) {
    match cov {
        None => (f64::NAN, f64::NAN, f64::NAN, f64::NAN, f64::NAN),
        Some(c) => {
            let max3 = |s: usize| c[s].max(c[s + 1]).max(c[s + 2]);
            (max3(0), max3(3), max3(6), max3(9), max3(12))
        }
    }
}

fn find_report_script(db_path: &Path) -> Result<PathBuf> {
    // 项目根目录（db 文件所在目录）
    let root = db_path
        .parent()
        .context("db path 无父目录")?
        .to_path_buf();
    let candidate = root.join("scripts").join("report.py");
    if candidate.exists() {
        return Ok(candidate);
    }
    Err(anyhow!(
        "找不到 scripts/report.py（期望位于 {}）",
        candidate.display()
    ))
}
