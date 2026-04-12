#!/usr/bin/env python3
"""
IMU 轨迹准确性验证脚本

用法:
  # 仅分析 IMU 静置漂移 / 闭环误差：
  python validate_trajectory.py --imu trajectory.csv

  # 与视频真值对比：
  python validate_trajectory.py --imu imu_trajectory.csv --video video_trajectory.csv

IMU CSV 格式（由应用"导出 CSV"按钮生成）：
  timestamp_ms, calc_position_x, calc_position_y, calc_position_z,
  calc_velocity_x, calc_velocity_y, calc_velocity_z,
  calc_attitude_w, calc_attitude_x, calc_attitude_y, calc_attitude_z

视频真值 CSV 格式（由 Tracker 软件导出，需手动换算帧号→ms）：
  time_ms, x_m, y_m
  （time_ms = frame_number / fps * 1000）

依赖: numpy pandas matplotlib
  pip install numpy pandas matplotlib
"""

import argparse
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from matplotlib import rcParams

# 配置中文字体，避免 CJK 字形缺失警告
rcParams['font.sans-serif'] = ['PingFang SC', 'Heiti SC', 'STHeiti', 'Arial Unicode MS',
                               'Noto Sans CJK JP', 'DejaVu Sans', 'sans-serif']
rcParams['font.monospace'] = ['Menlo', 'DejaVu Sans Mono', 'monospace']
rcParams['axes.unicode_minus'] = False  # 正常显示负号


# ─────────────────────────────────────────────
# 辅助函数
# ─────────────────────────────────────────────

def load_imu(path: str) -> pd.DataFrame:
    df = pd.read_csv(path, skipinitialspace=True)
    df.columns = [c.strip() for c in df.columns]

    # 兼容参考轨迹格式（time_ms, x_m, y_m）：映射为 IMU 列名
    if {"time_ms", "x_m", "y_m"}.issubset(df.columns):
        df = df.rename(columns={
            "time_ms": "timestamp_ms",
            "x_m": "calc_position_x",
            "y_m": "calc_position_y",
        })
        df["calc_position_z"] = 0.0

    required = {"timestamp_ms", "calc_position_x", "calc_position_y", "calc_position_z"}
    missing = required - set(df.columns)
    if missing:
        sys.exit(f"IMU CSV 缺少列: {missing}\n实际列名: {list(df.columns)}")
    df = df.sort_values("timestamp_ms").reset_index(drop=True)
    return df


def load_video(path: str) -> pd.DataFrame:
    df = pd.read_csv(path, skipinitialspace=True)
    df.columns = [c.strip() for c in df.columns]
    required = {"time_ms", "x_m", "y_m"}
    missing = required - set(df.columns)
    if missing:
        sys.exit(
            f"视频 CSV 缺少列: {missing}\n"
            f"实际列名: {list(df.columns)}\n"
            f"期望格式: time_ms, x_m, y_m"
        )
    df = df.sort_values("time_ms").reset_index(drop=True)
    return df


def nearest_point_distances(pts_a: np.ndarray, pts_b: np.ndarray, chunk: int = 512) -> np.ndarray:
    """
    对 A 中的每个点，计算到 B 中最近点的欧氏距离。

    用分块广播避免 (N, M) 巨矩阵 OOM：每个 chunk 的峰值内存约 chunk × M × 16 bytes。
    chunk=512, M=3000 时约 24 MB/chunk，14917 × 3000 全量 < 1 秒。

    参数:
      pts_a: (N, 2) IMU 轨迹点（已投影到选定平面）
      pts_b: (M, 2) 参考轨迹点
    返回:
      (N,) 每个 IMU 点到参考轨迹上最近点的欧氏距离
    """
    n = pts_a.shape[0]
    out = np.empty(n, dtype=np.float64)
    for i in range(0, n, chunk):
        diff = pts_a[i:i + chunk, None, :] - pts_b[None, :, :]   # (chunk, M, 2)
        d2 = (diff * diff).sum(axis=-1)                          # (chunk, M)
        out[i:i + chunk] = np.sqrt(d2.min(axis=-1))
    return out


def compute_speed_profile(pts: np.ndarray, time_s: np.ndarray) -> np.ndarray:
    """从位置序列计算速度模长序列（有限差分）。"""
    dt = np.diff(time_s)
    dt[dt < 1e-9] = 1e-9
    dp = np.diff(pts, axis=0)
    speed = np.sqrt((dp ** 2).sum(axis=1)) / dt
    return np.append(speed, speed[-1])


def auto_time_align(
    imu_pts: np.ndarray,
    imu_time_s: np.ndarray,
    ref_pts: np.ndarray,
    ref_time_s: np.ndarray,
) -> tuple[int, int, float]:
    """
    用速度轮廓互相关自动对齐 IMU 和视频参考的时间轴。

    挥拍动作在两个信号里都会产生清晰的速度峰，通过互相关找到最佳时间偏移。

    返回:
      (imu_start_idx, imu_end_idx, offset_s)
      表示 IMU 数据中 [start, end) 的范围与视频参考在时间上对齐。
    """
    # 计算速度轮廓
    imu_speed = compute_speed_profile(imu_pts, imu_time_s)
    ref_speed = compute_speed_profile(ref_pts, ref_time_s)

    # 将参考速度插值到统一时间网格（IMU 的采样率）
    ref_duration = ref_time_s[-1] - ref_time_s[0]
    imu_dt = np.median(np.diff(imu_time_s))
    common_time = np.arange(0, ref_duration, imu_dt)
    ref_speed_resampled = np.interp(common_time, ref_time_s - ref_time_s[0], ref_speed)

    # 归一化
    def normalize(s):
        s = s - s.mean()
        std = s.std()
        return s / std if std > 1e-9 else s

    imu_norm = normalize(imu_speed)
    ref_norm = normalize(ref_speed_resampled)

    # 互相关：在 IMU 信号中滑动参考窗口
    n_imu = len(imu_norm)
    n_ref = len(ref_norm)
    if n_ref > n_imu:
        return 0, n_imu, 0.0

    corr = np.correlate(imu_norm, ref_norm, mode="valid")
    best_lag = int(np.argmax(corr))
    offset_s = best_lag * imu_dt

    # 确定 IMU 的截取范围
    imu_start = best_lag
    imu_end = min(imu_start + n_ref, n_imu)

    return imu_start, imu_end, offset_s


def procrustes_align_2d(
    pts_imu: np.ndarray,
    pts_ref: np.ndarray,
    imu_time_s: np.ndarray | None = None,
    ref_time_s: np.ndarray | None = None,
    early_s: float = 1.0,
) -> tuple[np.ndarray, float]:
    """
    2D Early Procrustes 旋转对齐（不缩放）。

    **只用前 early_s 秒的数据**计算最优旋转角，然后将旋转应用到全部 IMU 点。
    这样可以避免后段漂移数据拉偏旋转估计。

    若未提供时间轴，则按前 25% 的点做对齐。

    返回: (旋转后的 imu_pts, 旋转角度 degrees)
    """
    n_imu, n_ref = len(pts_imu), len(pts_ref)

    # 确定用于对齐的"前 early_s 秒"子集
    if imu_time_s is not None and len(imu_time_s) == n_imu:
        n_early_imu = int(np.searchsorted(imu_time_s, imu_time_s[0] + early_s))
    else:
        n_early_imu = max(2, n_imu // 4)
    if ref_time_s is not None and len(ref_time_s) == n_ref:
        n_early_ref = int(np.searchsorted(ref_time_s, ref_time_s[0] + early_s))
    else:
        n_early_ref = max(2, n_ref // 4)

    n_early_imu = max(2, min(n_early_imu, n_imu))
    n_early_ref = max(2, min(n_early_ref, n_ref))

    n_sample = min(n_early_imu, n_early_ref, 300)
    idx_imu = np.linspace(0, n_early_imu - 1, n_sample, dtype=int)
    idx_ref = np.linspace(0, n_early_ref - 1, n_sample, dtype=int)
    a = pts_imu[idx_imu]
    b = pts_ref[idx_ref]

    # 去质心
    ca, cb = a.mean(axis=0), b.mean(axis=0)
    a_c, b_c = a - ca, b - cb

    # SVD 求最优旋转
    H = a_c.T @ b_c  # (2, 2)
    U, _, Vt = np.linalg.svd(H)
    R = Vt.T @ U.T
    if np.linalg.det(R) < 0:
        Vt[-1, :] *= -1
        R = Vt.T @ U.T

    angle_deg = float(np.degrees(np.arctan2(R[1, 0], R[0, 0])))

    # 对全部 IMU 点应用旋转（围绕 early 子集的质心旋转）
    imu_centered = pts_imu - ca
    rotated = (R @ imu_centered.T).T + ca

    return rotated, angle_deg


def compute_metrics(imu_pts: np.ndarray, ref_pts: np.ndarray) -> dict:
    """
    用 NPD（Nearest-Point Distance）族计算 IMU 相对参考的形状精度。

    **时间无关**：只看形状贴合度，不受节奏差异影响。因为参考轨迹是由
    `gen_reference_trajectory.py` 生成的理想路径（人造时间戳），
    和手绘的实际节奏做时间对齐会放大误差，所以用 NPD 而非 temporal RMSE。

    参数:
      imu_pts: (N, 2) IMU 在投影平面的点
      ref_pts: (M, 2) 参考点
    返回:
      dict 含: mean_npd_m, rmse_npd_m, max_npd_m, npd_series (N,)
    """
    npd = nearest_point_distances(imu_pts, ref_pts)
    return {
        "mean_npd_m": float(npd.mean()),
        "rmse_npd_m": float(np.sqrt((npd ** 2).mean())),
        "max_npd_m": float(npd.max()),
        "npd_series": npd,
    }


def loop_closure_error(imu: pd.DataFrame) -> float:
    """计算 IMU 轨迹闭环误差（终点相对起点的三维位移）。"""
    dx = imu["calc_position_x"].iloc[-1] - imu["calc_position_x"].iloc[0]
    dy = imu["calc_position_y"].iloc[-1] - imu["calc_position_y"].iloc[0]
    dz = imu["calc_position_z"].iloc[-1] - imu["calc_position_z"].iloc[0]
    return float(np.sqrt(dx**2 + dy**2 + dz**2))


def drift_rate(imu: pd.DataFrame) -> float:
    """漂移速率 (m/s)，适用于静置漂移测试。"""
    duration_s = (imu["timestamp_ms"].iloc[-1] - imu["timestamp_ms"].iloc[0]) / 1000.0
    final_dist = loop_closure_error(imu)
    return final_dist / duration_s if duration_s > 0 else 0.0


# ─────────────────────────────────────────────
# 绘图
# ─────────────────────────────────────────────

def plot_imu_only(imu: pd.DataFrame, out_path: Path, title: str = "IMU 轨迹"):
    fig, axes = plt.subplots(1, 2, figsize=(14, 6))
    fig.suptitle(title)

    # 自动选平面：Y 轴有运动则用 XY（参考轨迹），否则用 XZ（IMU 输出）
    use_xy = imu["calc_position_y"].abs().max() > imu["calc_position_z"].abs().max()
    h_col = "calc_position_y" if use_xy else "calc_position_z"
    h_label = "Y (m)" if use_xy else "Z (m)"
    plane_title = "XY 平面（俯视）" if use_xy else "XZ 平面（俯视）"

    ax = axes[0]
    ax.plot(imu["calc_position_x"], imu[h_col], color="steelblue", linewidth=1.5)
    ax.scatter(
        [imu["calc_position_x"].iloc[0]], [imu[h_col].iloc[0]],
        color="green", s=80, zorder=5, label="起点"
    )
    ax.scatter(
        [imu["calc_position_x"].iloc[-1]], [imu[h_col].iloc[-1]],
        color="red", s=80, zorder=5, label="终点"
    )
    ax.set_xlabel("X (m)")
    ax.set_ylabel(h_label)
    ax.set_title(plane_title)
    ax.axis("equal")
    ax.legend()
    ax.grid(True, alpha=0.4)

    # 时序位移模（随时间的位置漂移）
    t = (imu["timestamp_ms"] - imu["timestamp_ms"].iloc[0]) / 1000.0
    dist = np.sqrt(
        (imu["calc_position_x"] - imu["calc_position_x"].iloc[0]) ** 2 +
        (imu["calc_position_y"] - imu["calc_position_y"].iloc[0]) ** 2 +
        (imu["calc_position_z"] - imu["calc_position_z"].iloc[0]) ** 2
    )
    axes[1].plot(t, dist, color="darkorange")
    axes[1].set_xlabel("时间 (s)")
    axes[1].set_ylabel("距起点距离 (m)")
    axes[1].set_title("位移-时间曲线")
    axes[1].grid(True, alpha=0.4)

    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    plt.close()
    print(f"图表已保存到 {out_path}")


def plot_comparison(
    imu: pd.DataFrame,
    video: pd.DataFrame,
    imu_proj: np.ndarray,
    metrics: dict,
    out_path: Path,
    plane: str = "xz",
):
    """
    绘制 IMU 轨迹 vs 参考轨迹的形状对比图。

    布局:
      左子图 : 两条轨迹叠加（俯视），起点绿点
      中子图 : NPD 时序（每帧到参考最近点的距离），mean 虚线
      右子图 : 形状精度文字摘要框（3 行 NPD 指标）
    """
    plane_cols = {
        "xz": ("calc_position_x", "calc_position_z", "X (m)", "Z (m)"),
        "xy": ("calc_position_x", "calc_position_y", "X (m)", "Y (m)"),
        "yz": ("calc_position_y", "calc_position_z", "Y (m)", "Z (m)"),
    }
    col_a, col_b, xlabel, ylabel = plane_cols[plane]

    fig = plt.figure(figsize=(16, 7))
    gs = gridspec.GridSpec(1, 3, figure=fig, width_ratios=[2, 2, 1.2])
    fig.suptitle("IMU 轨迹 vs 参考轨迹形状对比")

    # —— 左: 轨迹叠加 ——
    ax0 = fig.add_subplot(gs[0])
    ax0.plot(
        imu[col_a], imu[col_b],
        color="steelblue", linewidth=1.5, label=f"IMU 轨迹（{plane.upper()}）"
    )
    ax0.plot(
        video["x_m"], video["y_m"],
        color="crimson", linewidth=1.5, linestyle="--", label="参考轨迹"
    )
    ax0.scatter(
        [imu[col_a].iloc[0]], [imu[col_b].iloc[0]],
        color="green", s=80, zorder=5
    )
    ax0.set_xlabel(xlabel)
    ax0.set_ylabel(ylabel)
    ax0.set_title("轨迹投影叠加")
    ax0.axis("equal")
    ax0.legend(fontsize=8)
    ax0.grid(True, alpha=0.4)

    # —— 中: NPD 时序 ——
    # 每个 IMU 点到参考轨迹最近点的距离，随时间变化。时间无关指标在时序上的可视化。
    ax1 = fig.add_subplot(gs[1])
    t_imu = (imu["timestamp_ms"].values - imu["timestamp_ms"].iloc[0]) / 1000.0
    npd = metrics["npd_series"]
    ax1.plot(t_imu, npd, color="forestgreen", linewidth=1.2, label="NPD")
    ax1.axhline(
        metrics["mean_npd_m"],
        color="darkorange",
        linestyle="--",
        linewidth=1,
        label=f'Mean={metrics["mean_npd_m"] * 100:.1f} cm',
    )
    ax1.set_xlabel("时间 (s)")
    ax1.set_ylabel("NPD (m)")
    ax1.set_title("Nearest-Point Distance 时序")
    ax1.legend(fontsize=8)
    ax1.grid(True, alpha=0.4)

    # —— 右: 形状精度摘要 ——
    ax2 = fig.add_subplot(gs[2])
    ax2.axis("off")
    summary = (
        f"形状精度 (NPD)\n"
        f"{'─' * 22}\n"
        f"Mean NPD:  {metrics['mean_npd_m'] * 100:6.2f} cm\n"
        f"RMSE NPD:  {metrics['rmse_npd_m'] * 100:6.2f} cm\n"
        f"Max NPD:   {metrics['max_npd_m'] * 100:6.2f} cm\n"
    )
    ax2.text(
        0.1, 0.6, summary,
        transform=ax2.transAxes,
        fontsize=11,
        verticalalignment="top",
        fontfamily="sans-serif",
        bbox={"boxstyle": "round", "facecolor": "#f0f4ff", "alpha": 0.8},
    )

    plt.tight_layout()
    plt.savefig(out_path, dpi=150)
    plt.close()
    print(f"图表已保存到 {out_path}")


# ─────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="IMU 轨迹准确性验证脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--imu", required=True, help="IMU 导出 CSV 路径")
    parser.add_argument("--video", default=None, help="视频真值 CSV 路径（可选）")
    parser.add_argument(
        "--plane",
        choices=["xz", "xy", "yz"],
        default="xz",
        help="IMU 投影平面（默认 xz，对应俯视 / 正视图）",
    )
    parser.add_argument(
        "--negate-h",
        action="store_true",
        help="翻转投影平面的水平轴（第一轴取负）。侧面拍摄常需此选项",
    )
    parser.add_argument(
        "--negate-v",
        action="store_true",
        help="翻转投影平面的垂直轴（第二轴取负）",
    )
    parser.add_argument(
        "--rotate",
        type=float,
        default=None,
        help="固定旋转角度（度），跳过 Procrustes 自动对齐。相机不动时所有视频用同一角度",
    )
    parser.add_argument(
        "--ref-offset",
        type=float,
        default=0.0,
        help="截掉参考轨迹开头 N 秒（视频比 IMU 早开始录制时使用）",
    )
    parser.add_argument(
        "--ref-flip-v",
        action="store_true",
        help="上下翻转参考轨迹（y_m 取负）",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="交互式预览模式：用键盘实时调整投影平面、旋转角度、翻转等参数",
    )
    args = parser.parse_args()

    # matplotlib 后端：交互模式用系统默认，非交互用 Agg
    import matplotlib
    if not args.interactive:
        matplotlib.use("Agg")

    imu = load_imu(args.imu)

    # 将起点归零
    imu["calc_position_x"] -= imu["calc_position_x"].iloc[0]
    imu["calc_position_y"] -= imu["calc_position_y"].iloc[0]
    imu["calc_position_z"] -= imu["calc_position_z"].iloc[0]

    duration_s = (imu["timestamp_ms"].iloc[-1] - imu["timestamp_ms"].iloc[0]) / 1000.0
    closure = loop_closure_error(imu)
    rate = closure / duration_s if duration_s > 0 else 0.0

    print(f"\n{'═'*40}")
    print(f"IMU 轨迹统计")
    print(f"{'─'*40}")
    print(f"样本数:   {len(imu)}")
    print(f"时长:     {duration_s:.1f} s")
    print(f"闭环误差: {closure*100:.2f} cm")
    print(f"漂移速率: {rate*100:.4f} cm/s")
    print(f"{'═'*40}\n")

    # 加载饱和标记（从对应的 _diag.csv 自动推断路径）
    imu_path = Path(args.imu)
    diag_path = Path(str(imu_path).replace("_trajectory.csv", "_diag.csv"))
    sat_flags = None
    if diag_path.exists() and diag_path != imu_path:
        try:
            diag_df = pd.read_csv(diag_path, skipinitialspace=True)
            diag_df.columns = [c.strip() for c in diag_df.columns]
            if "accel_saturated" in diag_df.columns:
                sat_flags = diag_df["accel_saturated"].values.astype(bool)
                n_sat = sat_flags.sum()
                if n_sat > 0:
                    print(f"检测到 {n_sat}/{len(sat_flags)} 帧加速度饱和（将以红色标注）")
        except Exception:
            pass

    if args.video is None:
        out = imu_path.with_suffix(".png")
        plot_imu_only(imu, out, title=f"IMU 轨迹分析（{imu_path.name}）")
        return

    video_raw = load_video(args.video)

    if args.interactive:
        interactive_mode(imu, video_raw, imu_path, args, sat_flags)
    else:
        static_mode(imu, video_raw, imu_path, args, sat_flags)


def prepare_comparison(imu_orig, video_raw, plane, negate_h, negate_v,
                       rotate_deg, ref_offset, ref_flip_v, ref_scale=1.0):
    """从原始数据 + 参数计算投影后的 imu_pts, ref_pts, metrics。"""
    imu = imu_orig.copy()
    video = video_raw.copy()

    # 参考轨迹截取
    if ref_offset > 0:
        t_col = "time_ms" if "time_ms" in video.columns else "timestamp_ms"
        t0 = video[t_col].iloc[0]
        video = video[video[t_col] >= t0 + ref_offset * 1000].reset_index(drop=True)
    # 上下翻转
    if ref_flip_v:
        video["y_m"] = -video["y_m"]
    # 起点归零 + 缩放
    video["x_m"] -= video["x_m"].iloc[0]
    video["y_m"] -= video["y_m"].iloc[0]
    if ref_scale != 1.0:
        video["x_m"] *= ref_scale
        video["y_m"] *= ref_scale

    # IMU 投影
    sign_h = -1.0 if negate_h else 1.0
    sign_v = -1.0 if negate_v else 1.0
    if plane == "xz":
        imu_pts = np.column_stack([sign_h * imu["calc_position_x"].values,
                                   sign_v * imu["calc_position_z"].values])
    elif plane == "xy":
        imu_pts = np.column_stack([sign_h * imu["calc_position_x"].values,
                                   sign_v * imu["calc_position_y"].values])
    else:
        imu_pts = np.column_stack([sign_h * imu["calc_position_y"].values,
                                   sign_v * imu["calc_position_z"].values])

    ref_pts = np.column_stack([video["x_m"].values, video["y_m"].values])

    # 时间对齐
    imu_time_s = (imu["timestamp_ms"].values - imu["timestamp_ms"].iloc[0]) / 1000.0
    ref_time_s = video["time_ms"].values / 1000.0 if "time_ms" in video.columns else np.arange(len(ref_pts)) / 30.0
    imu_start, imu_end, _ = auto_time_align(imu_pts, imu_time_s, ref_pts, ref_time_s)

    imu_pts = imu_pts[imu_start:imu_end] - imu_pts[imu_start]
    ref_pts = ref_pts - ref_pts[0]
    imu_crop = imu.iloc[imu_start:imu_end].reset_index(drop=True)

    # 旋转（围绕原点，保持起点在 (0,0)）
    if rotate_deg is not None:
        theta = np.radians(rotate_deg)
        R = np.array([[np.cos(theta), -np.sin(theta)],
                       [np.sin(theta),  np.cos(theta)]])
        imu_pts = (R @ imu_pts.T).T
    else:
        imu_time_crop = (imu_crop["timestamp_ms"].values - imu_crop["timestamp_ms"].iloc[0]) / 1000.0
        ref_time_crop = video["time_ms"].values / 1000.0 if "time_ms" in video.columns else None
        imu_pts, rotate_deg = procrustes_align_2d(
            imu_pts, ref_pts, imu_time_s=imu_time_crop, ref_time_s=ref_time_crop
        )
        imu_pts = imu_pts - imu_pts[0]

    metrics = compute_metrics(imu_pts, ref_pts)
    return imu_pts, ref_pts, imu_crop, video, metrics, rotate_deg, imu_start


def _draw_imu_trajectory(ax, imu_pts, sat_cropped):
    """绘制 IMU 轨迹，饱和段用红色标注。"""
    if sat_cropped is None or not sat_cropped.any():
        ax.plot(imu_pts[:, 0], imu_pts[:, 1], color="steelblue", lw=1.5, label="IMU")
        return

    # 逐段绘制：正常蓝色，饱和红色
    n = len(imu_pts)
    i = 0
    first_normal = True
    first_sat = True
    while i < n - 1:
        is_sat = sat_cropped[i] or sat_cropped[i + 1]
        j = i + 1
        while j < n - 1 and (sat_cropped[j] or sat_cropped[j + 1]) == is_sat:
            j += 1
        seg = imu_pts[i:j + 1]
        if is_sat:
            label = "IMU (saturated)" if first_sat else None
            ax.plot(seg[:, 0], seg[:, 1], color="red", lw=2.0, label=label)
            first_sat = False
        else:
            label = "IMU" if first_normal else None
            ax.plot(seg[:, 0], seg[:, 1], color="steelblue", lw=1.5, label=label)
            first_normal = False
        i = j


def interactive_mode(imu, video_raw, imu_path, args, sat_flags=None):
    """交互式预览模式：键盘实时调参。"""
    import matplotlib.pyplot as plt

    planes = ["xz", "xy", "yz"]
    state = {
        "plane": args.plane,
        "negate_h": args.negate_h,
        "negate_v": args.negate_v,
        "rotate": args.rotate if args.rotate is not None else 0.0,
        "ref_offset": args.ref_offset,
        "ref_flip_v": args.ref_flip_v,
        "ref_scale": 1.0,
    }

    fig, ax = plt.subplots(1, 1, figsize=(9, 8))

    def redraw():
        imu_pts, ref_pts, _, _, metrics, rot, imu_start = prepare_comparison(
            imu, video_raw,
            state["plane"], state["negate_h"], state["negate_v"],
            state["rotate"], state["ref_offset"], state["ref_flip_v"],
            state["ref_scale"],
        )
        ax.clear()
        # 截取对应时间段的饱和标记
        sat_cropped = None
        if sat_flags is not None:
            sat_cropped = sat_flags[imu_start:imu_start + len(imu_pts)]
        _draw_imu_trajectory(ax, imu_pts, sat_cropped)
        ax.plot(ref_pts[:, 0], ref_pts[:, 1], color="crimson", lw=1.5, ls="--", label="Video")
        ax.scatter([0], [0], color="green", s=80, zorder=5)
        ax.axis("equal")
        ax.legend(fontsize=8)
        ax.grid(True, alpha=0.4)

        flip_str = "flip-v" if state["ref_flip_v"] else ""
        neg_str = ""
        if state["negate_h"]:
            neg_str += " -H"
        if state["negate_v"]:
            neg_str += " -V"
        scale_str = f"  scale={state['ref_scale']:.2f}" if state["ref_scale"] != 1.0 else ""
        ax.set_title(
            f"plane={state['plane']}  rot={state['rotate']:.0f}°  "
            f"offset={state['ref_offset']:.1f}s  {flip_str}{neg_str}{scale_str}\n"
            f"Mean NPD: {metrics['mean_npd_m'] * 100:.2f} cm  |  "
            f"Max: {metrics['max_npd_m'] * 100:.2f} cm",
            fontsize=10,
        )
        fig.canvas.draw_idle()

    def on_key(event):
        k = event.key
        if k == "right":
            state["rotate"] += 5
        elif k == "left":
            state["rotate"] -= 5
        elif k == "up":
            state["rotate"] += 1
        elif k == "down":
            state["rotate"] -= 1
        elif k == "r":
            state["ref_flip_v"] = not state["ref_flip_v"]
        elif k == "h":
            state["negate_h"] = not state["negate_h"]
        elif k == "v":
            state["negate_v"] = not state["negate_v"]
        elif k == "1":
            state["plane"] = "xz"
        elif k == "2":
            state["plane"] = "xy"
        elif k == "3":
            state["plane"] = "yz"
        elif k == "]" or k == "+":
            state["ref_offset"] += 0.1
        elif k == "[" or k == "-":
            state["ref_offset"] = max(0, state["ref_offset"] - 0.1)
        elif k == "w":
            state["ref_scale"] *= 1.1  # 参考轨迹放大 10%
        elif k == "e":
            state["ref_scale"] /= 1.1  # 参考轨迹缩小 10%
        elif k == "enter":
            flags = f"--plane {state['plane']} --rotate {state['rotate']:.0f}"
            if state["negate_h"]:
                flags += " --negate-h"
            if state["negate_v"]:
                flags += " --negate-v"
            if state["ref_offset"] > 0:
                flags += f" --ref-offset {state['ref_offset']:.1f}"
            if state["ref_flip_v"]:
                flags += " --ref-flip-v"
            print(f"\n当前参数:\n  {flags}\n")
            return
        elif k == "q":
            plt.close(fig)
            # 用当前参数生成完整的三栏对比图（和 static_mode 输出一致）
            import matplotlib
            matplotlib.use("Agg")
            imu_pts, ref_pts, imu_crop, video_proc, metrics, rot, _ = prepare_comparison(
                imu, video_raw,
                state["plane"], state["negate_h"], state["negate_v"],
                state["rotate"], state["ref_offset"], state["ref_flip_v"],
            )
            plane = state["plane"]
            if plane == "xz":
                imu_crop["calc_position_x"] = imu_pts[:, 0]
                imu_crop["calc_position_z"] = imu_pts[:, 1]
            elif plane == "xy":
                imu_crop["calc_position_x"] = imu_pts[:, 0]
                imu_crop["calc_position_y"] = imu_pts[:, 1]
            else:
                imu_crop["calc_position_y"] = imu_pts[:, 0]
                imu_crop["calc_position_z"] = imu_pts[:, 1]

            out = imu_path.with_suffix(".png")
            plot_comparison(imu_crop, video_proc, imu_pts, metrics, out, plane=plane)

            print(f"\n{'═' * 40}")
            print(f"形状精度（NPD vs 参考，IMU {plane.upper()} 平面，已对齐）")
            print(f"{'─' * 40}")
            print(f"Mean NPD:  {metrics['mean_npd_m'] * 100:.2f} cm")
            print(f"RMSE NPD:  {metrics['rmse_npd_m'] * 100:.2f} cm")
            print(f"Max NPD:   {metrics['max_npd_m'] * 100:.2f} cm")
            print(f"{'═' * 40}")

            flags = f"--plane {state['plane']} --rotate {state['rotate']:.0f}"
            if state["negate_h"]:
                flags += " --negate-h"
            if state["negate_v"]:
                flags += " --negate-v"
            if state["ref_offset"] > 0:
                flags += f" --ref-offset {state['ref_offset']:.1f}"
            if state["ref_flip_v"]:
                flags += " --ref-flip-v"
            print(f"\n复用参数:\n  {flags}")
            return
        else:
            return
        redraw()

    fig.canvas.mpl_connect("key_press_event", on_key)

    print("\n=== 交互模式 ===")
    print("←/→ 旋转±5°  ↑/↓ ±1°  r=翻转参考  h/v=翻转IMU轴  w/e=缩放参考±10%")
    print("1/2/3=切换平面(xz/xy/yz)  ]/[=偏移±0.1s  Enter=打印参数  q=保存退出")

    redraw()
    plt.show()


def static_mode(imu, video_raw, imu_path, args, sat_flags=None):
    """非交互模式：生成 PNG 并打印指标。"""
    import matplotlib.pyplot as plt

    imu_pts, ref_pts, imu_crop, video_proc, metrics, align_angle, _ = prepare_comparison(
        imu, video_raw,
        args.plane, args.negate_h, args.negate_v,
        args.rotate, args.ref_offset, args.ref_flip_v,
    )

    plane = args.plane
    if plane == "xz":
        imu_crop["calc_position_x"] = imu_pts[:, 0]
        imu_crop["calc_position_z"] = imu_pts[:, 1]
    elif plane == "xy":
        imu_crop["calc_position_x"] = imu_pts[:, 0]
        imu_crop["calc_position_y"] = imu_pts[:, 1]
    else:
        imu_crop["calc_position_y"] = imu_pts[:, 0]
        imu_crop["calc_position_z"] = imu_pts[:, 1]
    print(f"Procrustes 对齐: 旋转 {align_angle:.1f}°")

    print(f"{'═' * 40}")
    print(f"形状精度（NPD vs 参考，IMU {plane.upper()} 平面，已对齐）")
    print(f"{'─' * 40}")
    print(f"Mean NPD:  {metrics['mean_npd_m'] * 100:.2f} cm")
    print(f"RMSE NPD:  {metrics['rmse_npd_m'] * 100:.2f} cm")
    print(f"Max NPD:   {metrics['max_npd_m'] * 100:.2f} cm")
    print(f"{'═' * 40}\n")

    out = imu_path.with_suffix(".png")
    plot_comparison(imu_crop, video_proc, imu_pts, metrics, out, plane=plane)


if __name__ == "__main__":
    main()
