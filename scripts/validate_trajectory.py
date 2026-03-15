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
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec


# ─────────────────────────────────────────────
# 辅助函数
# ─────────────────────────────────────────────

def load_imu(path: str) -> pd.DataFrame:
    df = pd.read_csv(path, skipinitialspace=True)
    df.columns = [c.strip() for c in df.columns]
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


def align_time(imu: pd.DataFrame, video: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    时间对齐：两条轨迹各自的时间轴归零（从 t=0 开始）。
    如需基于冲击峰对齐，请手动在 CSV 中裁剪到冲击帧后的数据。
    """
    imu = imu.copy()
    video = video.copy()
    imu["t"] = imu["timestamp_ms"] - imu["timestamp_ms"].iloc[0]
    video["t"] = video["time_ms"] - video["time_ms"].iloc[0]
    return imu, video


def origin_shift(imu: pd.DataFrame, video: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """将两条轨迹的起点平移到原点。"""
    imu = imu.copy()
    video = video.copy()
    imu["calc_position_x"] -= imu["calc_position_x"].iloc[0]
    imu["calc_position_y"] -= imu["calc_position_y"].iloc[0]
    imu["calc_position_z"] -= imu["calc_position_z"].iloc[0]
    video["x_m"] -= video["x_m"].iloc[0]
    video["y_m"] -= video["y_m"].iloc[0]
    return imu, video


def interp_imu_to_video(imu: pd.DataFrame, video: pd.DataFrame) -> np.ndarray:
    """将 IMU 轨迹插值到视频帧时间点，返回 (N, 2) 数组。"""
    xi = np.interp(video["t"].values, imu["t"].values, imu["calc_position_x"].values)
    # 默认用 XZ 平面（水平面）对应视频正视图 x, y
    zi = np.interp(video["t"].values, imu["t"].values, imu["calc_position_z"].values)
    return np.column_stack([xi, zi])


def compute_metrics(imu_proj: np.ndarray, video_pts: np.ndarray) -> dict:
    """计算误差指标。"""
    diff = imu_proj - video_pts
    dist = np.linalg.norm(diff, axis=1)
    return {
        "rmse_m": float(np.sqrt(np.mean(dist ** 2))),
        "max_dev_m": float(np.max(dist)),
        "mean_dev_m": float(np.mean(dist)),
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

def plot_imu_only(imu: pd.DataFrame, title: str = "IMU 轨迹（XZ 水平面）"):
    fig, axes = plt.subplots(1, 2, figsize=(14, 6))
    fig.suptitle(title)

    # XZ 平面投影（水平面）
    ax = axes[0]
    ax.plot(imu["calc_position_x"], imu["calc_position_z"], color="steelblue", linewidth=1.5)
    ax.scatter(
        [imu["calc_position_x"].iloc[0]], [imu["calc_position_z"].iloc[0]],
        color="green", s=80, zorder=5, label="起点"
    )
    ax.scatter(
        [imu["calc_position_x"].iloc[-1]], [imu["calc_position_z"].iloc[-1]],
        color="red", s=80, zorder=5, label="终点"
    )
    ax.set_xlabel("X (m)")
    ax.set_ylabel("Z (m)")
    ax.set_title("XZ 平面（俯视）")
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
    plt.savefig("imu_trajectory.png", dpi=150)
    print("图表已保存到 imu_trajectory.png")
    plt.show()


def plot_comparison(
    imu: pd.DataFrame,
    video: pd.DataFrame,
    imu_proj: np.ndarray,
    metrics: dict,
):
    fig = plt.figure(figsize=(16, 7))
    gs = gridspec.GridSpec(1, 3, figure=fig, width_ratios=[2, 2, 1.2])
    fig.suptitle("IMU 轨迹 vs 视频真值投影对比")

    # 轨迹叠加
    ax0 = fig.add_subplot(gs[0])
    ax0.plot(
        imu["calc_position_x"], imu["calc_position_z"],
        color="steelblue", linewidth=1.5, label="IMU 轨迹（XZ）"
    )
    ax0.plot(
        video["x_m"], video["y_m"],
        color="crimson", linewidth=1.5, linestyle="--", label="视频真值"
    )
    ax0.scatter(
        [imu["calc_position_x"].iloc[0]], [imu["calc_position_z"].iloc[0]],
        color="green", s=80, zorder=5
    )
    ax0.set_xlabel("水平位移 (m)")
    ax0.set_ylabel("垂直位移 (m)")
    ax0.set_title("轨迹投影叠加")
    ax0.axis("equal")
    ax0.legend(fontsize=8)
    ax0.grid(True, alpha=0.4)

    # 逐点误差随时间变化
    ax1 = fig.add_subplot(gs[1])
    t_vid = video["t"].values / 1000.0
    diff = np.linalg.norm(imu_proj - np.column_stack([video["x_m"], video["y_m"]]), axis=1)
    ax1.plot(t_vid, diff, color="purple")
    ax1.axhline(metrics["rmse_m"], color="darkorange", linestyle="--", label=f'RMSE={metrics["rmse_m"]*100:.1f} cm')
    ax1.set_xlabel("时间 (s)")
    ax1.set_ylabel("偏差 (m)")
    ax1.set_title("逐帧偏差")
    ax1.legend(fontsize=8)
    ax1.grid(True, alpha=0.4)

    # 误差摘要文字框
    ax2 = fig.add_subplot(gs[2])
    ax2.axis("off")
    summary = (
        f"误差摘要\n"
        f"{'─'*22}\n"
        f"RMSE:     {metrics['rmse_m']*100:6.2f} cm\n"
        f"最大偏差: {metrics['max_dev_m']*100:6.2f} cm\n"
        f"平均偏差: {metrics['mean_dev_m']*100:6.2f} cm\n"
    )
    ax2.text(
        0.1, 0.6, summary,
        transform=ax2.transAxes,
        fontsize=11,
        verticalalignment="top",
        fontfamily="monospace",
        bbox={"boxstyle": "round", "facecolor": "#f0f4ff", "alpha": 0.8},
    )

    plt.tight_layout()
    plt.savefig("trajectory_comparison.png", dpi=150)
    print("图表已保存到 trajectory_comparison.png")
    plt.show()


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

    if args.video is None:
        plot_imu_only(imu, title=f"IMU 轨迹分析（{args.imu}）")
        return

    video = load_video(args.video)
    imu, video = align_time(imu, video)
    # 重新归零（align_time 不改变位置，只加时间列）
    video["x_m"] -= video["x_m"].iloc[0]
    video["y_m"] -= video["y_m"].iloc[0]

    # 根据投影平面选择 IMU 的两个轴
    plane = args.plane
    if plane == "xz":
        imu_proj = np.column_stack([
            np.interp(video["t"].values, imu["t"].values, imu["calc_position_x"].values),
            np.interp(video["t"].values, imu["t"].values, imu["calc_position_z"].values),
        ])
    elif plane == "xy":
        imu_proj = np.column_stack([
            np.interp(video["t"].values, imu["t"].values, imu["calc_position_x"].values),
            np.interp(video["t"].values, imu["t"].values, imu["calc_position_y"].values),
        ])
    else:  # yz
        imu_proj = np.column_stack([
            np.interp(video["t"].values, imu["t"].values, imu["calc_position_y"].values),
            np.interp(video["t"].values, imu["t"].values, imu["calc_position_z"].values),
        ])

    video_pts = np.column_stack([video["x_m"].values, video["y_m"].values])
    metrics = compute_metrics(imu_proj, video_pts)

    print(f"{'═'*40}")
    print(f"对比误差摘要（IMU {plane.upper()} 平面 vs 视频）")
    print(f"{'─'*40}")
    print(f"RMSE:     {metrics['rmse_m']*100:.2f} cm")
    print(f"最大偏差: {metrics['max_dev_m']*100:.2f} cm")
    print(f"平均偏差: {metrics['mean_dev_m']*100:.2f} cm")
    print(f"{'═'*40}\n")

    plot_comparison(imu, video, imu_proj, metrics)


if __name__ == "__main__":
    main()
