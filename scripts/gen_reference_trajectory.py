#!/usr/bin/env python3
"""
参考轨迹生成脚本

根据实验类型生成理想参考轨迹 CSV，格式与 validate_trajectory.py 的 --video 参数相同：
  time_ms, x_m, y_m

用法:
  python scripts/gen_reference_trajectory.py static  --duration 60
  python scripts/gen_reference_trajectory.py linear  --distance 1.0 --duration 15 --pause 3
  python scripts/gen_reference_trajectory.py rect    --width 1.0 --height 0.5 --duration 20 --pause 3
  python scripts/gen_reference_trajectory.py circle  --radius 0.5 --duration 10
  python scripts/gen_reference_trajectory.py figure8 --radius 0.5 --duration 20 --pause 2

输出文件: reference_<experiment>.csv（当前目录），采样率 50 Hz（20 ms/点）

依赖: numpy pandas
  pip install numpy pandas
"""

import argparse
import sys
import math
import numpy as np
import pandas as pd

SAMPLE_RATE_HZ = 50
DT_MS = 1000 // SAMPLE_RATE_HZ  # 20 ms


# ─────────────────────────────────────────────
# 各实验轨迹生成器
# ─────────────────────────────────────────────

def gen_static(duration: float) -> pd.DataFrame:
    """
    静置真值：全零轨迹。
    duration: 录制时长（秒）
    """
    n = int(duration * SAMPLE_RATE_HZ)
    t_ms = np.arange(n) * DT_MS
    x = np.zeros(n)
    y = np.zeros(n)
    return pd.DataFrame({"time_ms": t_ms, "x_m": x, "y_m": y})


def gen_linear(distance: float, duration: float, pause: float) -> pd.DataFrame:
    """
    直线往返：0 → distance → 0，沿 x 轴，y 恒为 0。
    三段：去程（梯形加速）/ 停顿 / 回程（梯形减速）。
    pause: 到达终点后停顿时长（秒），回程后也停顿同样时长。
    """
    # 时间分配：去程占 (duration - 2*pause) / 2，回程相同
    move_time = (duration - 2 * pause) / 2
    if move_time <= 0:
        sys.exit(f"错误：duration({duration}s) 减去两端停顿({2*pause}s)后不足运动时间，请增大 --duration")

    segments = []

    # 去程：线性插值 0 → distance
    n_move = max(2, int(move_time * SAMPLE_RATE_HZ))
    segments.append(np.linspace(0.0, distance, n_move))

    # 终点停顿
    n_pause = max(1, int(pause * SAMPLE_RATE_HZ))
    segments.append(np.full(n_pause, distance))

    # 回程：线性插值 distance → 0
    segments.append(np.linspace(distance, 0.0, n_move))

    # 起点停顿（收尾）
    segments.append(np.full(n_pause, 0.0))

    x = np.concatenate(segments)
    n = len(x)
    t_ms = np.arange(n) * DT_MS
    y = np.zeros(n)
    return pd.DataFrame({"time_ms": t_ms, "x_m": x, "y_m": y})


def gen_rect(width: float, height: float, duration: float, pause: float) -> pd.DataFrame:
    """
    矩形折线：按四条边顺序行走，每个角落停顿 pause 秒。
    坐标：x_m 横向，y_m 纵向。

    width / height 支持**负值**：负值表示对应方向翻转。例如 width=-0.5 则路径起
    点仍在 (0,0)，但先向 -x 方向移动（适用于和实际录制方向匹配的场景）。
    """
    # 四条边的起点和终点
    corners = [
        (0.0,    0.0),
        (width,  0.0),
        (width,  height),
        (0.0,    height),
        (0.0,    0.0),   # 闭合回起点
    ]

    # 各边长度（取绝对值，避免负 width/height 导致周长为负）
    perimeter = 2 * (abs(width) + abs(height))
    side_lengths = [abs(width), abs(height), abs(width), abs(height)]

    # 计算各边运动时间（按边长比例分配，总时间减去四次停顿）
    n_pauses = 4  # 四个角落各停一次（回到起点后的停顿已含在 duration 内）
    total_move = duration - n_pauses * pause
    if total_move <= 0:
        sys.exit(f"错误：duration({duration}s) 减去角落停顿({n_pauses*pause}s)后不足运动时间，请增大 --duration")

    segments_x = []
    segments_y = []

    for i, (p0, p1) in enumerate(zip(corners[:-1], corners[1:])):
        side_len = side_lengths[i]
        side_time = total_move * (side_len / perimeter)
        n_move = max(2, int(side_time * SAMPLE_RATE_HZ))

        segments_x.append(np.linspace(p0[0], p1[0], n_move))
        segments_y.append(np.linspace(p0[1], p1[1], n_move))

        # 角落停顿（最后一段回起点后不再加停顿，由循环自然结束）
        n_pause_pts = max(1, int(pause * SAMPLE_RATE_HZ))
        segments_x.append(np.full(n_pause_pts, p1[0]))
        segments_y.append(np.full(n_pause_pts, p1[1]))

    x = np.concatenate(segments_x)
    y = np.concatenate(segments_y)
    n = len(x)
    t_ms = np.arange(n) * DT_MS
    return pd.DataFrame({"time_ms": t_ms, "x_m": x, "y_m": y})


def gen_circle(
    radius: float,
    duration: float,
    center_angle_deg: float = 180.0,
    clockwise: bool = False,
) -> pd.DataFrame:
    """
    圆形轨迹：起点恒在原点 (0,0)，圆上一点。

    参数:
      radius: 圆半径（米）
      duration: 完整绕一圈的时长（秒）
      center_angle_deg: 圆心相对于起点的方向角度（度，+x 为 0°，逆时针为正）
        - 180°（默认）表示圆心在起点左侧，轨迹从右侧切线方向出发
        - 0° 表示圆心在起点右侧
        - 90° 表示圆心在起点上方
      clockwise: 是否顺时针行走（默认 False = 逆时针）

    返回的 DataFrame 的第一行必为 (x=0, y=0)。
    """
    n = int(duration * SAMPLE_RATE_HZ)
    t_ms = np.arange(n) * DT_MS
    t_s = t_ms / 1000.0

    # 圆心位置（以原点为参考）
    ca = math.radians(center_angle_deg)
    cx = radius * math.cos(ca)
    cy = radius * math.sin(ca)

    # 起点 (0,0) 相对圆心的角度 = 圆心方向 + 180°
    start_theta = ca + math.pi
    # 角度推进方向：逆时针为 +，顺时针为 -
    direction = -1.0 if clockwise else 1.0
    theta = start_theta + direction * 2 * math.pi * t_s / duration

    x = cx + radius * np.cos(theta)
    y = cy + radius * np.sin(theta)
    # 强制首点归零，消除浮点误差
    x = x - x[0]
    y = y - y[0]
    return pd.DataFrame({"time_ms": t_ms, "x_m": x, "y_m": y})


def gen_figure8(radius: float, duration: float, pause: float) -> pd.DataFrame:
    """
    8 字形轨迹：右圆顺时针 + 左圆逆时针拼接，共用切点 (0,0)。
    右圆圆心 (R, 0)，左圆圆心 (-R, 0)。
    中间在切点停顿 pause 秒。
    """
    # 右圆：从 (0,0) 出发，顺时针（角度从 π 到 -π，即减少）
    # 左圆：从 (0,0) 出发，逆时针（角度从 0 到 2π，即增加）
    half_move = (duration - 2 * pause) / 2
    if half_move <= 0:
        sys.exit(f"错误：duration({duration}s) 减去停顿({2*pause}s)后不足运动时间，请增大 --duration")

    segments_x = []
    segments_y = []

    # 右圆：圆心 (R, 0)，从角度 π（即坐标 (0,0)）顺时针走一圈回到 π
    n_circle = max(4, int(half_move * SAMPLE_RATE_HZ))
    theta_right = np.linspace(math.pi, -math.pi, n_circle)  # 顺时针
    rx = radius + radius * np.cos(theta_right)
    ry = radius * np.sin(theta_right)
    segments_x.append(rx)
    segments_y.append(ry)

    # 切点停顿
    n_pause = max(1, int(pause * SAMPLE_RATE_HZ))
    segments_x.append(np.full(n_pause, 0.0))
    segments_y.append(np.full(n_pause, 0.0))

    # 左圆：圆心 (-R, 0)，从角度 0（即坐标 (0,0)）逆时针走一圈
    theta_left = np.linspace(0, 2 * math.pi, n_circle)
    lx = -radius + radius * np.cos(theta_left)
    ly = radius * np.sin(theta_left)
    segments_x.append(lx)
    segments_y.append(ly)

    # 终点停顿
    segments_x.append(np.full(n_pause, 0.0))
    segments_y.append(np.full(n_pause, 0.0))

    x = np.concatenate(segments_x)
    y = np.concatenate(segments_y)
    n = len(x)
    t_ms = np.arange(n) * DT_MS
    return pd.DataFrame({"time_ms": t_ms, "x_m": x, "y_m": y})


# ─────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="生成标准实验参考轨迹 CSV（与 validate_trajectory.py --video 格式相同）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "experiment",
        choices=["static", "linear", "rect", "circle", "figure8"],
        help="实验类型",
    )
    parser.add_argument("--duration", type=float, default=60.0, help="总时长（秒），默认 60")
    parser.add_argument("--distance", type=float, default=1.0, help="[linear] 往返距离（米），默认 1.0")
    parser.add_argument("--pause", type=float, default=3.0, help="[linear/rect/figure8] 停顿时长（秒），默认 3")
    parser.add_argument("--width", type=float, default=1.0, help="[rect] 矩形宽度（米），默认 1.0")
    parser.add_argument("--height", type=float, default=0.5, help="[rect] 矩形高度（米），默认 0.5")
    parser.add_argument("--radius", type=float, default=0.5, help="[circle/figure8] 半径（米），默认 0.5")
    parser.add_argument("--center-angle-deg", type=float, default=180.0,
                        help="[circle] 圆心相对起点的方向角度（度，+x=0°, 逆时针为正），默认 180")
    parser.add_argument("--clockwise", action="store_true",
                        help="[circle] 顺时针行走（默认逆时针）")
    parser.add_argument("--output", type=str, default=None, help="输出文件路径（默认 reference_<experiment>.csv）")
    args = parser.parse_args()

    exp = args.experiment

    if exp == "static":
        df = gen_static(duration=args.duration)
        print(f"生成静置参考轨迹：{len(df)} 点，时长 {args.duration:.0f}s")

    elif exp == "linear":
        df = gen_linear(distance=args.distance, duration=args.duration, pause=args.pause)
        print(f"生成直线往返参考轨迹：{len(df)} 点，时长约 {len(df)*DT_MS/1000:.1f}s，"
              f"距离 {args.distance}m，停顿 {args.pause}s")

    elif exp == "rect":
        df = gen_rect(width=args.width, height=args.height, duration=args.duration, pause=args.pause)
        print(f"生成矩形参考轨迹：{len(df)} 点，时长约 {len(df)*DT_MS/1000:.1f}s，"
              f"尺寸 {args.width}m×{args.height}m，停顿 {args.pause}s")

    elif exp == "circle":
        df = gen_circle(
            radius=args.radius,
            duration=args.duration,
            center_angle_deg=args.center_angle_deg,
            clockwise=args.clockwise,
        )
        direction_label = "顺时针" if args.clockwise else "逆时针"
        print(
            f"生成圆形参考轨迹：{len(df)} 点，时长 {args.duration:.0f}s，"
            f"半径 {args.radius}m，圆心方向 {args.center_angle_deg}°，{direction_label}"
        )

    elif exp == "figure8":
        df = gen_figure8(radius=args.radius, duration=args.duration, pause=args.pause)
        print(f"生成 8 字形参考轨迹：{len(df)} 点，时长约 {len(df)*DT_MS/1000:.1f}s，"
              f"半径 {args.radius}m，停顿 {args.pause}s")

    output_path = args.output or f"reference_{exp}.csv"
    df.to_csv(output_path, index=False)
    print(f"已写入: {output_path}")
    print(f"  列: time_ms, x_m, y_m")
    print(f"  行数: {len(df)}")
    print(f"  X 范围: [{df['x_m'].min():.3f}, {df['x_m'].max():.3f}] m")
    print(f"  Y 范围: [{df['y_m'].min():.3f}, {df['y_m'].max():.3f}] m")
    print(f"\n用法示例:")
    print(f"  python scripts/validate_trajectory.py --imu exports/xxx.csv --video {output_path}")


if __name__ == "__main__":
    main()
