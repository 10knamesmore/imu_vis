# 视频真值对比验证

> 本文件记录使用侧面视频标注作为 ground truth 对 IMU 轨迹重建结果进行验证的完整过程、数据和结论。对应论文 §3.2 "算法效果验证" 的视频对比部分。

## 1. 实验设计

### 1.1 数据采集

在采集 IMU 数据的同时，使用智能手机从侧面拍摄羽毛球拍挥拍过程的视频。视频与 IMU 录制**非同步启停**（手动分别操作），需要在后处理阶段进行时间对齐。

采集覆盖三种强度的挥拍动作（与 IMU 的 tag 1/2/3 录制对应）：

| Tag | 动作类型 | 视频文件 | 对应 session | 视频帧率 | 视频时长 |
|---|---|---|---|---|---|
| 1 | 轻强度（推球/切球） | `1_1.MOV` | session 39 | 30 fps | 3.6 s |
| 2 | 中强度（平抽/挑球） | `2_4.MOV` | session 47 | 30 fps | 3.8 s |
| 3 | 高强度（杀球级） | `3_1.MOV` | session 49 | 30 fps | 3.1 s |

### 1.2 视频标注方法

使用本研究自行开发的 `scripts/video_tracker.py` 工具进行逐帧手动标注：

1. **像素→米标定**：在首帧画面中点击球拍全长两端（拍头顶端和拍柄底端），以标准羽毛球拍长度 0.675 m 作为参考，计算像素/米比例。
2. **逐帧标注**：在每一帧上用鼠标点击 IMU 安装位置（拍颈处），记录像素坐标。关键帧标注后，中间帧由线性插值填充。
3. **坐标转换**：像素坐标按标定比例转换为米制坐标，y 轴翻转（视频 y 向下 → 物理 y 向上），起点归零。
4. **导出**：输出 `time_ms, x_m, y_m` 格式 CSV，与 `validate_trajectory.py` 兼容。

手动标注是在运动分析领域公认的 ground truth 获取方法，对于少量短视频（每段 3–4 秒）的工作量可控。

### 1.3 视频-IMU 对齐方法

由于视频与 IMU 非同步启停，采用以下对齐流程：

1. **速度轮廓互相关**：分别计算视频标注轨迹和 IMU 重建轨迹的速度模长时序，通过互相关寻找最佳时间偏移。挥拍动作在两个信号中都会产生清晰的速度峰，是天然的同步标记。
2. **时间截取**：按找到的偏移量截取 IMU 数据中与视频重叠的时间段，丢弃视频范围之外的 IMU 数据。
3. **投影平面选择**：侧面视频捕捉的是 IMU 三维运动的某个二维投影。通过尝试 XZ/XY/YZ 三种投影平面并比较 NPD 指标，自动选择最匹配的投影平面。
4. **旋转对齐**：相机视角与 IMU 世界坐标系之间存在固定的旋转偏差，通过交互式 Procrustes 旋转或手动指定角度进行补偿。

### 1.4 评估指标

采用与标准轨迹实验相同的 NPD（Nearest-Point Distance）指标族，以及闭环误差（Loop Closure Error）。

---

## 2. 实验结果

### 2.1 Tag 1：轻强度动作（推球/切球）

| 指标 | 值 |
|---|---|
| 对应 session | 39 |
| 视频文件 | `1_1.MOV` |
| 对齐参数 | `--plane xz --rotate -20` |
| IMU 时长 | 6.7 s |
| 视频重叠段 | ~3.5 s |
| 闭环误差 | 101.60 cm |
| **Mean NPD** | **7.80 cm** |
| RMSE NPD | 9.95 cm |
| Max NPD | 17.46 cm |

**分析**：轻强度动作下，前 1.5 秒视频与 IMU 轨迹高度吻合（NPD < 3 cm），后段因持续运动无 ZUPT 触发机会而出现漂移。加速度峰值 4.3g，远低于 ±16g 量程上限，**无饱和截断**。

对比图见 `figures/video_comparison_tag1.png`。

### 2.2 Tag 2：中强度动作（平抽/挑球）

| 指标 | 值 |
|---|---|
| 对应 session | 47 |
| 视频文件 | `2_4.MOV` |
| 对齐参数 | `--plane yz --rotate -15 --ref-offset 0.5` |
| IMU 时长 | 3.9 s |
| 视频重叠段 | ~3.3 s |
| 闭环误差 | 80.22 cm |
| **Mean NPD** | **6.26 cm** |
| RMSE NPD | 9.92 cm |
| Max NPD | 39.08 cm |

**分析**：中强度动作下，前 1 秒轨迹形状贴合，加速度峰值 2.9g，**无饱和截断**。投影平面从 tag 1 的 XZ 变为 YZ，原因是用户每次启动 IMU 时的持握姿势不同，导致世界坐标系定义变化。这一观察提示了在实际应用中需要考虑坐标系标定的一致性。

对比图见 `figures/video_comparison_tag2.png`。

### 2.3 Tag 3：高强度动作（杀球级）

| 指标 | 值 |
|---|---|
| 对应 session | 49 |
| 视频文件 | `3_1.MOV` |
| 对齐参数 | `--plane xz --rotate 374` |
| IMU 时长 | 3.7 s |
| 视频重叠段 | ~3.0 s |
| 闭环误差 | **3862.71 cm (38.6 m)** |
| **Mean NPD** | **210.50 cm** |
| RMSE NPD | 413.48 cm |
| Max NPD | 1233.73 cm |
| 饱和帧数 | **29/761 (3.8%)** |

**分析**：高强度动作中 Y 轴加速度峰值达 156.73 m/s²（15.98g），**精确触及 IM948 的 ±16g 满量程上限**，导致 29 帧信号被 ADC 硬截断。截断后的加速度被双重积分，位置在 3.7 秒内发散至 38.6 米——这是一个纯粹的硬件问题，而非算法缺陷。

在对比图（`figures/video_comparison_tag3_saturated.png`）中，IMU 轨迹的饱和段以红色标注，视觉上清晰展示了截断发生的位置及其对后续轨迹的影响。

**该结果构成本研究关于 IM948 ±16g 量程局限性的实测证据**（详见 §3.3）。

---

## 3. 视频标注的可视化验证

为确认视频标注本身的质量，`video_tracker.py` 在导出轨迹 CSV 的同时生成了**视频帧叠加图**：将最后一帧视频作为背景，叠加标注轨迹线（绿色）、关键帧标记点（黄色）、起点（绿圈）和终点（红圈），以及标定参考线（青色）。

- Tag 1 叠加图：`figures/video_overlay_tag1.png`
- Tag 2 叠加图：`figures/video_overlay_tag2.png`
- Tag 3 叠加图：`figures/video_overlay_tag3.png`

这些叠加图可用于论文中展示"视频标注方法示例"，证明 ground truth 的获取过程是可靠的。

---

## 4. 综合讨论

### 4.1 视频对比结果汇总

| 指标 | Tag 1 (轻) | Tag 2 (中) | Tag 3 (高) |
|---|---|---|---|
| 加速度峰值 (g) | 4.3 | 2.9 | 15.98 (饱和) |
| 饱和帧数 | 0 | 0 | 29 |
| Mean NPD (cm) | 7.80 | 6.26 | 210.50 |
| 闭环误差 (cm) | 101.60 | 80.22 | 3862.71 |
| 投影平面 | XZ | YZ | XZ |

### 4.2 关键发现

1. **轻/中强度动作下 IMU 轨迹与视频真值的形状吻合度良好**（Mean NPD 6–8 cm），尤其在动作起始阶段（前 1–2 秒）偏差 < 3 cm。

2. **闭环误差与 NPD 不成正比**：tag 2 的闭环误差（80 cm）高于 tag 1（102 cm），但 Mean NPD（6.26 cm）反而更低。说明闭环误差反映的是端点漂移方向，而 NPD 反映的是平均形状偏离——二者互补。

3. **高强度（杀球级）动作因硬件量程饱和导致轨迹完全失效**：Mean NPD 超过 2 m，定量分析不可用。但加速度截断发生的时刻和影响可通过饱和检测机制明确标识，这在实际使用中为用户提供了可靠的"数据不可信"警告。

4. **不同 session 的最优投影平面可能不同**（tag 1 为 XZ，tag 2 为 YZ）。这是因为 IMU 世界坐标系在每次开机时根据初始姿态定义，若用户持握方式有微小差异，坐标轴朝向会随之变化。

### 4.3 对应用场景的启示

羽毛球单次挥拍动作在低至中强度下（推球、吊球、挑球、平抽）的轨迹重建精度为 **6–8 cm Mean NPD**，已能满足动作形态对比和特征提取的需求。杀球级高强度动作的定量分析受限于 ±16g 加速度计量程，需更换硬件方可支持（详见 `docs/imu_saturation_research.md`）。

---

## 5. 复现命令

### 5.1 视频标注

```bash
QT_QPA_PLATFORM=xcb uv run --project scripts python scripts/video_tracker.py --video vids/<tag>_<n>.MOV
```

### 5.2 对比图生成（交互模式调参）

```bash
QT_QPA_PLATFORM=xcb uv run --project scripts python scripts/validate_trajectory.py \
  --imu exports/replay_session_<id>_trajectory.csv \
  --video vids/<tag>_<n>.csv \
  --interactive
```

### 5.3 对比图生成（固定参数复用）

```bash
# Tag 1
uv run --project scripts python scripts/validate_trajectory.py \
  --imu exports/replay_session_39_trajectory.csv \
  --video vids/1_1.csv --plane xz --rotate -20

# Tag 2
uv run --project scripts python scripts/validate_trajectory.py \
  --imu exports/replay_session_47_trajectory.csv \
  --video vids/2_4.csv --plane yz --rotate -15 --ref-offset 0.5

# Tag 3
uv run --project scripts python scripts/validate_trajectory.py \
  --imu exports/replay_session_49_trajectory.csv \
  --video vids/3_1.csv --plane xz --rotate 374
```

---

## 附：图表清单

| 文件 | 用途 | 论文位置 |
|---|---|---|
| `video_overlay_tag1.png` | Tag 1 视频帧 + 标注轨迹 | §3.2 方法展示 |
| `video_overlay_tag2.png` | Tag 2 视频帧 + 标注轨迹 | §3.2 方法展示 |
| `video_overlay_tag3.png` | Tag 3 视频帧 + 标注轨迹 | §3.2 方法展示 |
| `video_comparison_tag1.png` | Tag 1 IMU vs 视频对比 | §3.2 结果 |
| `video_comparison_tag2.png` | Tag 2 IMU vs 视频对比 | §3.2 结果 |
| `video_comparison_tag3_saturated.png` | Tag 3 IMU vs 视频对比（含饱和标注） | §3.3 硬件局限性 |
