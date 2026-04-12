# 本次 Session 工作总结

> 记录 2026-04-12 会话的所有产出，便于后续复核。

## 一、算法改动

| 改动 | 文件 | 说明 |
|---|---|---|
| recorder 线程隔离 | `src-tauri/src/recorder/service.rs` | `spawn_recorder` 从 `tauri::async_runtime::spawn` 改为独立 OS 线程 + 专属 tokio runtime，与 Tauri IPC 解耦 |
| 饱和检测共享常量 | `src-tauri/src/processor/output/logic.rs` | `ACCEL_SATURATION_THRESHOLD_MS2 = 152.0`，`is_accel_saturated()` helper |
| ResponseData 加 accel_saturated | `src-tauri/src/types/outputs.rs` | 实时路径和回放路径都填充该字段 |
| 诊断 accel_saturated | `src-tauri/src/processor/pipeline/diagnostics.rs`, `logic.rs` | 诊断结构体 + 管线诊断块 |
| replay --write-back | `src-tauri/src/bin/replay.rs` | 新增 `--write-back` flag，单事务回写 SQLite calc_* 列 |
| replay diag CSV 加 accel_saturated 列 | `src-tauri/src/bin/replay.rs` | CSV header 和数据行补列 |
| 回放路径饱和检测 | `src-tauri/src/recorder/service.rs` | `sample_to_response_data` 调用共享 `is_accel_saturated` |
| 前端 3D 轨迹分段上色 | `src/components/.../ImuTrajectoryView.tsx` | Line 加 vertex colors，饱和段红色 |
| 前端 Chart 饱和背景条 | `src/components/ImuChartsCanvas/ImuChartsCanvas.tsx` | 半透明红色背景条 |
| 前端诊断面板饱和卡片 | `src/components/DiagnosticsPanel/DiagnosticsPanel.tsx` | 饱和率 EMA + 当前帧标记 |
| 前端类型同步 | `src/types.ts`, `src/utils/ImuHistoryBuffer.ts`, `src/utils/DiagnosticsHistoryBuffer.ts` | `accel_saturated` 全链路 |

## 二、工具链改动

| 工具 | 改动 |
|---|---|
| `scripts/validate_trajectory.py` | 指标从 temporal RMSE → NPD；加 Procrustes 旋转对齐；加时间自动对齐（速度互相关）；加 `--interactive` 交互模式；加 `--rotate/--negate-h/--negate-v/--ref-offset/--ref-flip-v/--ref-scale` 参数；饱和段红色标注 |
| `scripts/gen_reference_trajectory.py` | `gen_rect` 支持负 width/height（方向翻转）；`gen_circle` 新增 `--center-angle-deg`/`--clockwise` 参数 |
| `scripts/video_tracker.py` | **新建**。视频逐帧手动标注工具，含像素→米标定、关键帧插值、overlay PNG 生成 |
| `scripts/pyproject.toml` | 新增 `opencv-python` 依赖 |

## 三、数据产出

### 3.1 SQLite 写回

所有 25 个 session 的 `calc_*` 列已用当前算法（含 gravity_ref 三阶段初始化、ZUPT 调优、ESKF 等）重新计算并写回。备份：`imu_recordings.sqlite.bak.before_writeback_20260412_005021`。

### 3.2 标准轨迹基线指标

| 场景 | 时长 | 闭环误差 | Mean NPD | RMSE NPD | Max NPD |
|---|---|---|---|---|---|
| 静止 | 60.3 s | 0.07 cm | 0.05 cm | 0.05 cm | 0.07 cm |
| 直线往返 | 19.0 s | 8.95 cm | 8.79 cm | 10.92 cm | 25.87 cm |
| 正方形（快） | 12.0 s | 3.71 cm | 2.01 cm | 3.24 cm | 12.55 cm |
| 正方形（慢） | 17.9 s | 1.45 cm | 3.63 cm | 4.85 cm | 16.73 cm |
| 圆形 | 10.6 s | 33.51 cm | 9.10 cm | 11.44 cm | 21.95 cm |

### 3.3 视频对比指标

| Tag | 强度 | Session | Mean NPD | 饱和帧 |
|---|---|---|---|---|
| 1 | 轻 | 39 | 7.80 cm | 0 |
| 2 | 中 | 47 | 6.26 cm | 0 |
| 3 | 高（杀球） | 49 | 210.50 cm | 29/761 (3.8%) |

### 3.4 饱和检测实测

| 强度分组 | 峰值 (g) | 饱和帧数（5 段合计） |
|---|---|---|
| 轻强度 Tag 1 | 4.3 | 0 |
| 中强度 Tag 2 | 2.9 | 0 |
| 高强度 Tag 3 | 15.98 (满量程) | 161 |

## 四、论文文档产出

| 文件 | 内容 | 字数 |
|---|---|---|
| `docs/paper/results_and_discussion.md` | 第 3 章完整稿（系统功能 + 算法验证 + 硬件局限） | ~6000 |
| `docs/paper/methods_supplement.md` | 第 2 章补充（ESKF、gravity_ref、ZUPT 工程细节、系统架构） | ~6500 |
| `docs/paper/video_comparison_results.md` | 视频真值对比分析（3 组 tag 的对比过程和数据） | ~2500 |
| `docs/imu_saturation_research.md` | IM948 量程局限性文献综述 + 实测（含 10 条参考文献） | ~3000 |

## 五、图表清单

### 标准轨迹对比（§3.2.1）

| 文件 | 内容 |
|---|---|
| `figures/trajectory_static.png` | 静止 60s 基线 |
| `figures/trajectory_line.png` | 直线往返 |
| `figures/trajectory_square_01.png` | 正方形（快节奏 12s） |
| `figures/trajectory_square_02.png` | 正方形（慢节奏 18s） |
| `figures/trajectory_circle.png` | 圆形连续运动 |

### 视频真值对比（§3.2.2）

| 文件 | 内容 |
|---|---|
| `figures/video_overlay_tag1.png` | Tag 1 视频帧 + 标注轨迹叠加 |
| `figures/video_overlay_tag2.png` | Tag 2 视频帧 + 标注轨迹叠加 |
| `figures/video_overlay_tag3.png` | Tag 3 视频帧 + 标注轨迹叠加 |
| `figures/video_comparison_tag1.png` | Tag 1 IMU vs 视频真值对比图 |
| `figures/video_comparison_tag2.png` | Tag 2 IMU vs 视频真值对比图 |
| `figures/video_comparison_tag3_saturated.png` | Tag 3 IMU vs 视频对比（含饱和红色标注） |

## 六、BLE 吞吐问题结论

在 Linux（Arch，BlueZ）上实测 BLE 吞吐稳定 250 Hz，与 macOS Core Bluetooth 的不稳定（70-220 Hz 波动）形成对比。通过在 Linux 上还原 recorder 隔离修改后吞吐仍保持 250 Hz，确认该问题为 **macOS Core Bluetooth 特有**（动态调低 connection interval），与 recorder 隔离改动无关。

## 七、待后续处理

1. **git 清理**：exports/ 生成物、旧 dev 文档、备份文件等需要整理（本 session 未完成）
2. **更多视频标注**：14 段视频中仅标注了 3 段（每 tag 一段），可根据论文需要补充
3. **论文 Word 转写**：`docs/paper/` 下的 4 篇 md 文档需要人工转写到 Word 毕业论文
4. **CLAUDE.md / HANDOFF.md 更新**：本 session 新增的基线表（含 NPD 指标）需要更新到 CLAUDE.md
