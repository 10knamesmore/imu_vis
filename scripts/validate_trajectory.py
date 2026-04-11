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
import matplotlib
matplotlib.use('Agg')  # 非交互后端，保存图片后不阻塞
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
    args = parser.parse_args()

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

    imu_path = Path(args.imu)
    if args.video is None:
        out = imu_path.with_suffix(".png")
        plot_imu_only(imu, out, title=f"IMU 轨迹分析（{imu_path.name}）")
        return

    video = load_video(args.video)
    # 参考轨迹起点归零，与 IMU 起点对齐到同一原点
    video["x_m"] -= video["x_m"].iloc[0]
    video["y_m"] -= video["y_m"].iloc[0]

    # 根据投影平面选取 IMU 的两个坐标轴，**不做时间插值**
    # NPD 指标时间无关：直接用 IMU 原始点云和参考点云计算最近点距离
    plane = args.plane
    if plane == "xz":
        imu_pts = np.column_stack([
            imu["calc_position_x"].values,
            imu["calc_position_z"].values,
        ])
    elif plane == "xy":
        imu_pts = np.column_stack([
            imu["calc_position_x"].values,
            imu["calc_position_y"].values,
        ])
    else:  # yz
        imu_pts = np.column_stack([
            imu["calc_position_y"].values,
            imu["calc_position_z"].values,
        ])

    ref_pts = np.column_stack([video["x_m"].values, video["y_m"].values])
    metrics = compute_metrics(imu_pts, ref_pts)

    print(f"{'═' * 40}")
    print(f"形状精度（NPD vs 参考，IMU {plane.upper()} 平面）")
    print(f"{'─' * 40}")
    print(f"Mean NPD:  {metrics['mean_npd_m'] * 100:.2f} cm")
    print(f"RMSE NPD:  {metrics['rmse_npd_m'] * 100:.2f} cm")
    print(f"Max NPD:   {metrics['max_npd_m'] * 100:.2f} cm")
    print(f"{'═' * 40}\n")

    out = imu_path.with_suffix(".png")
    plot_comparison(imu, video, imu_pts, metrics, out, plane=plane)


if __name__ == "__main__":
    main()
