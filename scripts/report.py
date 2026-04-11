#!/usr/bin/env python3
"""Replay 紧凑报告生成器。

读 replay 产出的 trajectory.csv + diag.csv（+ 可选 reference.csv），
聚合为 Markdown 报告打到 stdout。目标字符数 < 12 KB，以便 Claude Code
每次迭代的 token 成本控制在 ~3K。

约定：
- 不输出任何原始时序数组
- 只聚合/分位数/分箱
- 长 run 自动调整分箱粒度使行数 ≤ 60

用法:
  python3 scripts/report.py \\
      --trajectory exports/replay_<session>_trajectory.csv \\
      --diag exports/replay_<session>_diag.csv \\
      [--reference scripts/reference_正方形.csv] \\
      [--session-label 正方形2] \\
      [--navigator eskf] [--integrator trapezoid]
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd


# ─────────────────────────────────────────────
# CSV 加载
# ─────────────────────────────────────────────

def load_trajectory(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df = df.sort_values("timestamp_ms").reset_index(drop=True)
    df["t_s"] = (df["timestamp_ms"] - df["timestamp_ms"].iloc[0]) / 1000.0
    return df


def load_diag(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df = df.sort_values("timestamp_ms").reset_index(drop=True)
    df["t_s"] = (df["timestamp_ms"] - df["timestamp_ms"].iloc[0]) / 1000.0
    return df


def load_reference(path: Path) -> pd.DataFrame | None:
    if path is None:
        return None
    df = pd.read_csv(path)
    df.columns = [c.strip() for c in df.columns]
    # 兼容两种格式: (time_ms, x_m, y_m) 或 (timestamp_ms, calc_position_*)
    if "x_m" in df.columns:
        df = df.rename(columns={"time_ms": "timestamp_ms", "x_m": "pos_x", "y_m": "pos_y"})
        df["pos_z"] = 0.0
    elif "calc_position_x" in df.columns:
        df = df.rename(
            columns={
                "calc_position_x": "pos_x",
                "calc_position_y": "pos_y",
                "calc_position_z": "pos_z",
            }
        )
    else:
        return None
    df = df.sort_values("timestamp_ms").reset_index(drop=True)
    df["t_s"] = (df["timestamp_ms"] - df["timestamp_ms"].iloc[0]) / 1000.0
    # 起点归零
    for col in ("pos_x", "pos_y", "pos_z"):
        if col in df.columns:
            df[col] -= df[col].iloc[0]
    return df


# ─────────────────────────────────────────────
# 指标计算
# ─────────────────────────────────────────────

def trajectory_origin_shift(traj: pd.DataFrame) -> pd.DataFrame:
    out = traj.copy()
    for col in ("calc_position_x", "calc_position_y", "calc_position_z"):
        out[col] -= out[col].iloc[0]
    return out


def trajectory_vs_reference(traj: pd.DataFrame, ref: pd.DataFrame) -> dict | None:
    if ref is None:
        return None
    # 自动挑选平面：比较 Y/Z 方差
    y_var = traj["calc_position_y"].var()
    z_var = traj["calc_position_z"].var()
    if y_var >= z_var:
        a_col, b_col = "calc_position_x", "calc_position_y"
    else:
        a_col, b_col = "calc_position_x", "calc_position_z"

    ref_t = ref["t_s"].values
    ref_x = ref["pos_x"].values
    ref_y = ref["pos_y"].values

    imu_a = np.interp(ref_t, traj["t_s"].values, traj[a_col].values)
    imu_b = np.interp(ref_t, traj["t_s"].values, traj[b_col].values)
    diff = np.column_stack([imu_a - ref_x, imu_b - ref_y])
    dist = np.linalg.norm(diff, axis=1)
    return {
        "plane": f"{a_col[-1]}{b_col[-1]}".upper(),
        "rmse_m": float(np.sqrt(np.mean(dist**2))),
        "max_m": float(np.max(dist)),
        "mean_m": float(np.mean(dist)),
    }


def loop_closure(traj: pd.DataFrame) -> float:
    dx = traj["calc_position_x"].iloc[-1] - traj["calc_position_x"].iloc[0]
    dy = traj["calc_position_y"].iloc[-1] - traj["calc_position_y"].iloc[0]
    dz = traj["calc_position_z"].iloc[-1] - traj["calc_position_z"].iloc[0]
    return float(math.sqrt(dx * dx + dy * dy + dz * dz))


def count_edges(series: pd.Series) -> tuple[int, int]:
    """返回 (进入 True 的次数, 退出 True 的次数)。"""
    arr = series.astype(int).values
    diff = np.diff(arr, prepend=arr[0])
    enters = int(np.sum(diff == 1))
    exits = int(np.sum(diff == -1))
    return enters, exits


def pct(x: float) -> str:
    return f"{x * 100:5.1f}%"


def fmt_v3(v) -> str:
    return f"[{v[0]:+.4f}, {v[1]:+.4f}, {v[2]:+.4f}]"


def percentile(arr: np.ndarray, p: float) -> float:
    if arr.size == 0:
        return float("nan")
    return float(np.nanpercentile(arr, p))


# ─────────────────────────────────────────────
# 报告拼装
# ─────────────────────────────────────────────

def render_report(
    traj: pd.DataFrame,
    diag: pd.DataFrame,
    ref: pd.DataFrame | None,
    session_label: str,
    navigator: str,
    integrator: str,
) -> str:
    traj = trajectory_origin_shift(traj)
    duration_s = float(traj["t_s"].iloc[-1])
    n_samples = len(traj)
    has_eskf = navigator.lower() == "eskf" and not diag["eskf_cov_vel_max"].isna().all()

    lines: list[str] = []
    lines.append(f"## Replay Report — {session_label}")
    lines.append("")
    lines.append(
        f"**Meta**: {duration_s:.1f}s · {n_samples} samples · navigator={navigator} · integrator={integrator}"
    )
    lines.append("")

    # ── 轨迹 vs 参考 ──
    if ref is not None:
        metrics = trajectory_vs_reference(traj, ref)
        if metrics is not None:
            lines.append("### Trajectory vs reference")
            lines.append(f"- Plane:       {metrics['plane']}")
            lines.append(f"- RMSE:        {metrics['rmse_m'] * 100:6.2f} cm")
            lines.append(f"- Max dev:     {metrics['max_m'] * 100:6.2f} cm")
            lines.append(f"- Mean dev:    {metrics['mean_m'] * 100:6.2f} cm")
    closure = loop_closure(traj)
    drift_rate_cm_s = closure / duration_s * 100 if duration_s > 0 else 0.0
    lines.append("### Loop closure / drift")
    lines.append(f"- Loop close:  {closure * 100:6.2f} cm (end − start)")
    lines.append(f"- Drift rate:  {drift_rate_cm_s:6.3f} cm/s")
    lines.append("")

    # ── ZUPT ──
    is_static = diag["is_static"].astype(bool)
    enters, exits = count_edges(is_static)
    static_frames = int(is_static.sum())
    # 平均静止段长度（秒）
    if enters > 0:
        # 用时间戳差分累加静止段
        static_span_s = float(diag["nav_dt"][is_static].sum())
        avg_span = static_span_s / max(enters, 1)
    else:
        static_span_s = 0.0
        avg_span = 0.0
    lines.append("### ZUPT")
    lines.append(
        f"- Static frames: {pct(static_frames / n_samples)} ({static_frames}/{n_samples})"
    )
    lines.append(f"- Enter events:  {enters}    Exit events: {exits}")
    lines.append(f"- Total static:  {static_span_s:.2f} s    Avg span: {avg_span:.2f} s")
    lines.append("")

    # ── 标定/偏差收敛 ──
    lines.append("### Bias estimation")
    ca_final = diag[["cal_accel_bias_x", "cal_accel_bias_y", "cal_accel_bias_z"]].iloc[-1].values
    cg_final = diag[["cal_gyro_bias_x", "cal_gyro_bias_y", "cal_gyro_bias_z"]].iloc[-1].values
    lines.append(f"- cal.bias_accel (final): {fmt_v3(ca_final)} m/s²")
    lines.append(f"- cal.bias_gyro  (final): {fmt_v3(cg_final)} rad/s")
    if has_eskf:
        ba_final = diag[["eskf_bias_accel_x", "eskf_bias_accel_y", "eskf_bias_accel_z"]].iloc[-1].values
        bg_final = diag[["eskf_bias_gyro_x", "eskf_bias_gyro_y", "eskf_bias_gyro_z"]].iloc[-1].values
        lines.append(f"- eskf.bias_accel (final): {fmt_v3(ba_final)} m/s²")
        lines.append(f"- eskf.bias_gyro  (final): {fmt_v3(bg_final)} rad/s")
    lines.append("")

    # ── ESKF 专属：协方差 / 创新 ──
    if has_eskf:
        lines.append("### ESKF covariance / innovation")
        cov_vel = diag["eskf_cov_vel_max"].dropna().values
        cov_ba = diag["eskf_cov_ba_max"].dropna().values
        cov_bg = diag["eskf_cov_bg_max"].dropna().values
        lines.append(
            f"- vel  cov max:  init {cov_vel[0]:9.2e} → final {cov_vel[-1]:9.2e}   p95 {percentile(cov_vel, 95):9.2e}"
        )
        lines.append(
            f"- ba   cov max:  init {cov_ba[0]:9.2e} → final {cov_ba[-1]:9.2e}   p95 {percentile(cov_ba, 95):9.2e}"
        )
        lines.append(
            f"- bg   cov max:  init {cov_bg[0]:9.2e} → final {cov_bg[-1]:9.2e}   p95 {percentile(cov_bg, 95):9.2e}"
        )
        innov = diag["eskf_innovation_norm"].dropna().values
        if innov.size > 0:
            lines.append(
                f"- |innovation|:  mean {innov.mean():.4f}   p95 {percentile(innov, 95):.4f}   max {innov.max():.4f}   n={innov.size}"
            )
        lines.append("")

    # ── 静止段完整性（关键） ──
    lines.append("### Static-phase integrity")
    if static_frames > 0:
        # 在静止段内速度的最大模
        vel_mag = np.linalg.norm(
            traj[["calc_velocity_x", "calc_velocity_y", "calc_velocity_z"]].values,
            axis=1,
        )
        # 对齐：traj 与 diag 同长
        n = min(len(vel_mag), len(is_static))
        static_mask = is_static.values[:n]
        static_vel = vel_mag[:n][static_mask]
        # 位置在静止段首尾的漂移
        pos_xyz = traj[["calc_position_x", "calc_position_y", "calc_position_z"]].values[:n]
        static_pos = pos_xyz[static_mask]
        if static_pos.shape[0] > 1:
            drift_m = float(np.linalg.norm(static_pos[-1] - static_pos[0]))
        else:
            drift_m = 0.0
        lines.append(f"- |v| during static:  max {static_vel.max():.4f} m/s   mean {static_vel.mean():.4f} m/s   (应≈0)")
        lines.append(f"- Pos drift in static: {drift_m * 100:.2f} cm over {static_span_s:.1f}s")
    else:
        lines.append("- 无静止帧")
    lines.append("")

    # ── 运动段幅值 ──
    accel_norm = np.linalg.norm(
        diag[["nav_linear_accel_x", "nav_linear_accel_y", "nav_linear_accel_z"]].values,
        axis=1,
    )
    gyro_norm = diag["zupt_gyro_norm"].values
    lines.append("### Signal ranges")
    lines.append(
        f"- |linear accel|:  min {accel_norm.min():.3f}   mean {accel_norm.mean():.3f}   p95 {percentile(accel_norm, 95):.3f}   max {accel_norm.max():.3f} m/s²"
    )
    lines.append(
        f"- |gyro|:          min {gyro_norm.min():.3f}   mean {gyro_norm.mean():.3f}   p95 {percentile(gyro_norm, 95):.3f}   max {gyro_norm.max():.3f} rad/s"
    )
    lines.append("")

    # ── 性能 ──
    proc_us = diag["perf_process_us"].values
    ble_ms = diag["perf_ble_interval_ms"].values
    ble_ms_valid = ble_ms[ble_ms > 0]
    lines.append("### Performance")
    lines.append(
        f"- process_us:  p50 {percentile(proc_us, 50):5.0f}   p95 {percentile(proc_us, 95):5.0f}   p99 {percentile(proc_us, 99):5.0f}   max {proc_us.max():.0f}"
    )
    if ble_ms_valid.size > 0:
        lines.append(
            f"- BLE gap ms:  p50 {percentile(ble_ms_valid, 50):5.2f}   p95 {percentile(ble_ms_valid, 95):5.2f}   max {ble_ms_valid.max():5.2f}"
        )
    lines.append("")

    # ── 每 N 秒分箱 ──
    lines.append("### Per-bin summary")
    lines.append(_render_bins(traj, diag, has_eskf))
    lines.append("")

    return "\n".join(lines)


def _render_bins(traj: pd.DataFrame, diag: pd.DataFrame, has_eskf: bool) -> str:
    duration = float(traj["t_s"].iloc[-1])
    # 目标行数 ≤ 60
    target_rows = 30
    bin_sec = max(1.0, math.ceil(duration / target_rows))
    diag = diag.copy()
    traj = traj.copy()
    diag["bin"] = (diag["t_s"] // bin_sec).astype(int)
    traj["bin"] = (traj["t_s"] // bin_sec).astype(int)

    vel_mag = np.linalg.norm(
        traj[["calc_velocity_x", "calc_velocity_y", "calc_velocity_z"]].values, axis=1
    )
    traj["vel_mag"] = vel_mag
    pos_mag = np.linalg.norm(
        traj[["calc_position_x", "calc_position_y", "calc_position_z"]].values - \
        traj[["calc_position_x", "calc_position_y", "calc_position_z"]].iloc[0].values,
        axis=1,
    )
    traj["pos_mag"] = pos_mag

    rows = []
    # 表头
    if has_eskf:
        rows.append(" t |static%| |v| m/s| |p-p0| m|cov_v_max|cov_ba_max|ba_norm")
    else:
        rows.append(" t |static%| |v| m/s| |p-p0| m| accel_n | gyro_n ")
    for b, grp in diag.groupby("bin"):
        t_label = int(b * bin_sec)
        static_pct = grp["is_static"].astype(int).mean() * 100
        tgrp = traj[traj["bin"] == b]
        if tgrp.empty:
            continue
        v = tgrp["vel_mag"].mean()
        p = tgrp["pos_mag"].iloc[-1]
        if has_eskf:
            cov_v = grp["eskf_cov_vel_max"].mean()
            cov_ba = grp["eskf_cov_ba_max"].mean()
            ba_norm = math.sqrt(
                grp["eskf_bias_accel_x"].iloc[-1] ** 2
                + grp["eskf_bias_accel_y"].iloc[-1] ** 2
                + grp["eskf_bias_accel_z"].iloc[-1] ** 2
            )
            rows.append(
                f"{t_label:3d}|{static_pct:5.0f} |{v:7.4f}|{p:7.3f}|{cov_v:9.2e}|{cov_ba:9.2e}|{ba_norm:.4f}"
            )
        else:
            accel_n = np.linalg.norm(
                grp[["nav_linear_accel_x", "nav_linear_accel_y", "nav_linear_accel_z"]].mean().values
            )
            gyro_n = grp["zupt_gyro_norm"].mean()
            rows.append(
                f"{t_label:3d}|{static_pct:5.0f} |{v:7.4f}|{p:7.3f}|{accel_n:7.3f}|{gyro_n:7.3f}"
            )
    rows.insert(1, f"(bin = {bin_sec:.0f}s, {len(rows) - 1} rows)")
    return "\n".join(rows)


# ─────────────────────────────────────────────
# 主函数
# ─────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="Replay 紧凑报告生成器")
    parser.add_argument("--trajectory", required=True, type=Path)
    parser.add_argument("--diag", required=True, type=Path)
    parser.add_argument("--reference", type=Path, default=None)
    parser.add_argument("--session-label", type=str, default="")
    parser.add_argument("--navigator", type=str, default="?")
    parser.add_argument("--integrator", type=str, default="?")
    args = parser.parse_args()

    traj = load_trajectory(args.trajectory)
    diag = load_diag(args.diag)
    ref = load_reference(args.reference) if args.reference else None

    label = args.session_label or args.trajectory.stem
    out = render_report(traj, diag, ref, label, args.navigator, args.integrator)
    sys.stdout.write(out)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
