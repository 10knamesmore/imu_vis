#!/usr/bin/env python3
"""
视频轨迹手动标注工具

从侧面拍摄的视频中逐帧标注 IMU 安装点（拍颈位置），导出 2D 轨迹 CSV，
格式与 validate_trajectory.py --video 兼容（time_ms, x_m, y_m）。

用法:
  # 基本用法
  python scripts/video_tracker.py --video path/to/video.mp4

  # 指定输出和参考长度
  python scripts/video_tracker.py --video video.mp4 --output ref.csv --ref-length 0.675

流程:
  1. 标定：在首帧上点击参考物两端（默认球拍 0.675m），确定像素/米比例
  2. 标注：逐帧点击跟踪点，支持前进/后退/跳过
  3. 导出：自动插值未标注帧，输出 CSV

键位:
  标定阶段: 左键点击两端 → Enter 确认
  标注阶段:
    左键      标记当前帧
    d / →     下一帧（不标记）
    a / ←     上一帧
    空格      连续播放（再按停止）
    z         撤销当前帧标注
    q         结束标注并导出

依赖: opencv-python numpy pandas
"""

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np
import pandas as pd

WINDOW_NAME = "Video Tracker"
MAX_DISPLAY_WIDTH = 1280


def parse_args():
    parser = argparse.ArgumentParser(
        description="视频轨迹手动标注工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--video", required=True, help="输入视频路径")
    parser.add_argument("--output", default=None, help="输出 CSV 路径（默认与视频同名 .csv）")
    parser.add_argument(
        "--ref-length",
        type=float,
        default=0.675,
        help="标定参考物实际长度（米），默认 0.675（标准羽毛球拍）",
    )
    return parser.parse_args()


class VideoTracker:
    def __init__(self, video_path: str, ref_length: float):
        self.cap = cv2.VideoCapture(video_path)
        if not self.cap.isOpened():
            sys.exit(f"无法打开视频: {video_path}")

        self.fps = self.cap.get(cv2.CAP_PROP_FPS)
        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.ref_length = ref_length

        # 显示缩放（大分辨率视频缩放显示，标注坐标保持原始分辨率）
        if self.width > MAX_DISPLAY_WIDTH:
            self.scale = MAX_DISPLAY_WIDTH / self.width
        else:
            self.scale = 1.0

        # 标定
        self.pixels_per_meter: float | None = None
        self.calib_points: list[tuple[int, int]] = []

        # 标注数据：frame_index → (px_x, px_y)
        self.annotations: dict[int, tuple[int, int]] = {}

        # 当前状态
        self.current_frame = 0
        self.click_pos: tuple[int, int] | None = None
        self.frames_cache: dict[int, np.ndarray] = {}

        print(f"视频: {video_path}")
        print(f"分辨率: {self.width}x{self.height}, 帧率: {self.fps:.1f} fps, 总帧数: {self.total_frames}")
        print(f"时长: {self.total_frames / self.fps:.1f} s")

    def _mouse_callback(self, event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            # 将显示坐标转换回原始分辨率坐标
            orig_x = int(x / self.scale)
            orig_y = int(y / self.scale)
            self.click_pos = (orig_x, orig_y)

    def _read_frame(self, idx: int) -> np.ndarray | None:
        if idx in self.frames_cache:
            return self.frames_cache[idx].copy()
        self.cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = self.cap.read()
        if not ret:
            return None
        if len(self.frames_cache) < 300:
            self.frames_cache[idx] = frame.copy()
        return frame

    def _display_frame(self, frame: np.ndarray) -> np.ndarray:
        if self.scale != 1.0:
            h = int(frame.shape[0] * self.scale)
            w = int(frame.shape[1] * self.scale)
            return cv2.resize(frame, (w, h))
        return frame.copy()

    def _draw_overlay(self, frame: np.ndarray):
        """在帧上叠加标注参考：只画当前帧的标注点和上一个标注点，不画完整轨迹。"""
        # 当前帧有标注 → 红点
        if self.current_frame in self.annotations:
            pt = self.annotations[self.current_frame]
            sx, sy = int(pt[0] * self.scale), int(pt[1] * self.scale)
            cv2.circle(frame, (sx, sy), 6, (0, 0, 255), -1)
            cv2.circle(frame, (sx, sy), 8, (0, 0, 255), 2)
            return

        # 当前帧无标注 → 画上一个已标注帧的位置（小绿点，做定位参考）
        prev_frame = None
        for fi in sorted(self.annotations.keys(), reverse=True):
            if fi < self.current_frame:
                prev_frame = fi
                break
        if prev_frame is not None:
            pt = self.annotations[prev_frame]
            sx, sy = int(pt[0] * self.scale), int(pt[1] * self.scale)
            cv2.circle(frame, (sx, sy), 4, (0, 200, 0), -1)
            cv2.putText(frame, f"prev @{prev_frame}", (sx + 8, sy - 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 200, 0), 1)

    def _draw_hud(self, frame: np.ndarray):
        """在帧上叠加状态信息。"""
        h, w = frame.shape[:2]
        info_lines = [
            f"Frame: {self.current_frame}/{self.total_frames - 1}",
            f"Annotated: {len(self.annotations)}/{self.total_frames}",
            f"t = {self.current_frame / self.fps:.3f} s",
        ]
        if self.current_frame in self.annotations:
            info_lines.append("[MARKED]")

        y_offset = 20
        for line in info_lines:
            cv2.putText(frame, line, (10, y_offset), cv2.FONT_HERSHEY_SIMPLEX,
                        0.5, (255, 255, 255), 1, cv2.LINE_AA)
            y_offset += 20

        # 底部操作提示（黑底白字）
        cv2.rectangle(frame, (0, h - 25), (w, h), (40, 40, 40), -1)
        hint = "Click=mark racket neck  d/Right=next  a/Left=prev  Space=play  z=undo  q=done"
        cv2.putText(frame, hint, (10, h - 8), cv2.FONT_HERSHEY_SIMPLEX,
                    0.4, (220, 220, 220), 1, cv2.LINE_AA)

    def calibrate(self):
        """标定阶段：用户在首帧上点击参考物两端，计算像素/米比例。"""
        frame = self._read_frame(0)
        if frame is None:
            sys.exit("无法读取首帧")

        self.calib_points = []
        self.click_pos = None

        cv2.namedWindow(WINDOW_NAME, cv2.WINDOW_AUTOSIZE)
        cv2.setMouseCallback(WINDOW_NAME, self._mouse_callback)

        print(f"\n=== 标定阶段 ===")
        print(f"请在画面中依次点击球拍的【拍头顶端】和【拍柄底端】")
        print(f"  → 两点之间的距离将被视为 {self.ref_length} m（标准羽毛球拍全长）")
        print(f"  → 点击两次后按 Enter 确认，按 r 重新点击")

        calib_instructions = [
            "Step 1/2: Click the TOP of the racket head",
            "Step 2/2: Click the BOTTOM of the racket handle",
            "Press Enter to confirm, r to redo",
        ]

        while True:
            display = self._display_frame(frame)
            h_disp, w_disp = display.shape[:2]

            # 顶部标定说明（醒目黄色背景条）
            step = min(len(self.calib_points), 2)
            instruction = calib_instructions[step]
            cv2.rectangle(display, (0, 0), (w_disp, 50), (40, 40, 40), -1)
            cv2.putText(display, f"CALIBRATION: {instruction}",
                        (10, 20), cv2.FONT_HERSHEY_SIMPLEX,
                        0.55, (0, 255, 255), 2, cv2.LINE_AA)
            cv2.putText(display, f"Ref length = {self.ref_length} m  |  Points: {step}/2",
                        (10, 42), cv2.FONT_HERSHEY_SIMPLEX,
                        0.45, (200, 200, 200), 1, cv2.LINE_AA)

            # 画已点击的标定点
            labels = ["HEAD", "GRIP"]
            for i, pt in enumerate(self.calib_points):
                sx, sy = int(pt[0] * self.scale), int(pt[1] * self.scale)
                cv2.circle(display, (sx, sy), 8, (0, 255, 255), 2)
                cv2.circle(display, (sx, sy), 3, (0, 255, 255), -1)
                cv2.putText(display, labels[i], (sx + 12, sy + 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)

            if len(self.calib_points) == 2:
                p1, p2 = self.calib_points
                sp1 = (int(p1[0] * self.scale), int(p1[1] * self.scale))
                sp2 = (int(p2[0] * self.scale), int(p2[1] * self.scale))
                cv2.line(display, sp1, sp2, (0, 255, 255), 2)
                px_dist = np.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2)
                ppm = px_dist / self.ref_length
                mid = ((sp1[0] + sp2[0]) // 2, (sp1[1] + sp2[1]) // 2 - 15)
                cv2.putText(display, f"{px_dist:.0f}px = {self.ref_length}m ({ppm:.1f} px/m)",
                            mid, cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

            cv2.imshow(WINDOW_NAME, display)

            # 处理点击
            if self.click_pos is not None and len(self.calib_points) < 2:
                self.calib_points.append(self.click_pos)
                print(f"  标定点 {len(self.calib_points)}: ({self.click_pos[0]}, {self.click_pos[1]})")
                self.click_pos = None

            key = cv2.waitKey(30) & 0xFF
            if key == 13 and len(self.calib_points) == 2:  # Enter
                break
            elif key == ord("r"):
                self.calib_points = []
                self.click_pos = None
                print("  重新标定...")
            elif key == ord("q"):
                sys.exit("用户取消")

        p1, p2 = self.calib_points
        px_dist = np.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2)
        self.pixels_per_meter = px_dist / self.ref_length
        print(f"标定完成: {self.pixels_per_meter:.1f} pixels/meter")

    def annotate(self):
        """标注阶段：逐帧标注跟踪点。"""
        self.current_frame = 0
        self.click_pos = None
        playing = False
        pending_advance = False

        print(f"\n=== 标注阶段 ===")
        print(f"逐帧点击拍颈位置。按 d/→ 下一帧，a/← 上一帧，空格连续播放，z 撤销，q 结束")

        while True:
            # 1. 处理上一轮的待前进（点击标注后延迟一帧前进，让用户先看到红点）
            if pending_advance:
                pending_advance = False
                if self.current_frame < self.total_frames - 1:
                    self.current_frame += 1

            # 2. 处理新的点击
            if self.click_pos is not None:
                self.annotations[self.current_frame] = self.click_pos
                self.click_pos = None
                pending_advance = True  # 下一轮循环再前进

            # 3. 画帧 + overlay + HUD
            frame = self._read_frame(self.current_frame)
            if frame is None:
                print(f"帧 {self.current_frame} 读取失败，跳过")
                break

            display = self._display_frame(frame)
            self._draw_overlay(display)
            self._draw_hud(display)
            cv2.imshow(WINDOW_NAME, display)

            # 4. 等按键
            wait_ms = 30 if (playing or pending_advance) else 0
            key = cv2.waitKey(wait_ms) & 0xFF

            if key == ord("q"):
                break
            elif key == ord("d") or key == 83:  # d or →
                playing = False
                if self.current_frame < self.total_frames - 1:
                    self.current_frame += 1
            elif key == ord("a") or key == 81:  # a or ←
                playing = False
                if self.current_frame > 0:
                    self.current_frame -= 1
            elif key == ord(" "):
                playing = not playing
            elif key == ord("z"):
                if self.current_frame in self.annotations:
                    del self.annotations[self.current_frame]
                    print(f"  撤销帧 {self.current_frame} 的标注")

            if playing and self.current_frame < self.total_frames - 1:
                self.current_frame += 1
            elif playing and self.current_frame >= self.total_frames - 1:
                playing = False

        cv2.destroyAllWindows()
        print(f"标注完成: {len(self.annotations)} 帧已标注（共 {self.total_frames} 帧）")

    def export(self, output_path: str):
        """插值 + 坐标转换 + 导出 CSV。"""
        if len(self.annotations) < 2:
            sys.exit("标注点不足 2 个，无法导出")
        if self.pixels_per_meter is None:
            sys.exit("未完成标定")

        sorted_frames = sorted(self.annotations.keys())
        first_frame = sorted_frames[0]
        last_frame = sorted_frames[-1]

        # 对标注范围内的所有帧做线性插值
        all_frames = list(range(first_frame, last_frame + 1))
        ann_indices = np.array(sorted_frames, dtype=np.float64)
        ann_x = np.array([self.annotations[f][0] for f in sorted_frames], dtype=np.float64)
        ann_y = np.array([self.annotations[f][1] for f in sorted_frames], dtype=np.float64)

        interp_x = np.interp(all_frames, ann_indices, ann_x)
        interp_y = np.interp(all_frames, ann_indices, ann_y)

        # 像素 → 米，起点归零，y 轴翻转（视频 y 向下 → 物理 y 向上）
        ppm = self.pixels_per_meter
        x_m = (interp_x - interp_x[0]) / ppm
        y_m = -(interp_y - interp_y[0]) / ppm  # 翻转 y

        # 时间戳
        time_ms = np.array(all_frames, dtype=np.float64) / self.fps * 1000.0
        time_ms -= time_ms[0]

        df = pd.DataFrame({"time_ms": time_ms.astype(int), "x_m": x_m, "y_m": y_m})
        df.to_csv(output_path, index=False)
        print(f"\n已导出: {output_path}")
        print(f"  帧范围: {first_frame}–{last_frame} ({len(all_frames)} 帧)")
        print(f"  时长: {time_ms[-1] / 1000:.2f} s")
        print(f"  X 范围: [{x_m.min():.4f}, {x_m.max():.4f}] m")
        print(f"  Y 范围: [{y_m.min():.4f}, {y_m.max():.4f}] m")
        print(f"\n用法:")
        print(f"  python scripts/validate_trajectory.py --imu <replay.csv> --video {output_path} --plane xz")

        # 生成视频帧 + 轨迹叠加图
        overlay_path = str(Path(output_path).with_suffix(".overlay.png"))
        self._export_overlay(overlay_path, sorted_frames, interp_x, interp_y, first_frame, last_frame)

    def _export_overlay(
        self,
        output_path: str,
        keyframes: list[int],
        all_x: np.ndarray,
        all_y: np.ndarray,
        first_frame: int,
        last_frame: int,
    ):
        """在视频末帧上叠加标注轨迹，保存为 PNG。"""
        # 用最后一个标注帧作为背景
        bg = self._read_frame(last_frame)
        if bg is None:
            bg = self._read_frame(first_frame)
        if bg is None:
            print("无法读取视频帧，跳过 overlay 生成")
            return

        overlay = bg.copy()

        # 画插值后的完整轨迹线（绿色）
        pts = np.column_stack([all_x.astype(np.int32), all_y.astype(np.int32)])
        for i in range(len(pts) - 1):
            cv2.line(overlay, tuple(pts[i]), tuple(pts[i + 1]), (0, 220, 0), 2)

        # 画关键帧标注点（黄色小圆）
        for fi in keyframes:
            if fi in self.annotations:
                px, py = self.annotations[fi]
                cv2.circle(overlay, (px, py), 4, (0, 255, 255), -1)

        # 起点（绿色大圆）和终点（红色大圆）
        cv2.circle(overlay, (int(all_x[0]), int(all_y[0])), 8, (0, 255, 0), 3)
        cv2.circle(overlay, (int(all_x[-1]), int(all_y[-1])), 8, (0, 0, 255), 3)

        # 标定参考线（青色虚线）
        if len(self.calib_points) == 2:
            p1, p2 = self.calib_points
            cv2.line(overlay, p1, p2, (255, 255, 0), 1, cv2.LINE_AA)
            mid = ((p1[0] + p2[0]) // 2, (p1[1] + p2[1]) // 2 - 10)
            cv2.putText(overlay, f"{self.ref_length}m", mid,
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)

        # 图例
        h, w = overlay.shape[:2]
        cv2.putText(overlay, "Green=start  Red=end  Yellow=keyframes",
                    (10, h - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)

        cv2.imwrite(output_path, overlay)
        print(f"轨迹叠加图: {output_path}")


def main():
    args = parse_args()
    output = args.output or str(Path(args.video).with_suffix(".csv"))

    tracker = VideoTracker(args.video, args.ref_length)
    tracker.calibrate()
    tracker.annotate()
    tracker.export(output)


if __name__ == "__main__":
    main()
