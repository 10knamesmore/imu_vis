# 论文素材目录

本目录收集可直接转写到 Word / LaTeX 论文中的材料。所有文档均采用学术论文风格撰写，配套图片和数据表格，便于复制粘贴到最终论文稿。

## 目录结构

```
docs/paper/
├── README.md                        本文件（索引）
├── methods_supplement.md            第 2 章「研究对象与方法」补充材料
├── results_and_discussion.md        第 3 章「结果与讨论」完整稿
├── video_comparison_results.md      视频真值对比验证（§3.2 补充）
└── session_summary.md               本次 session 完整工作总结
```

## 文档清单

| 文件 | 论文章节 | 内容 | 字数 | 状态 |
|---|---|---|---|---|
| `methods_supplement.md` | §2.4–§2.7 | ESKF、gravity_ref、ZUPT 工程细节、系统架构、饱和检测 | ~6500 | ✅ |
| `results_and_discussion.md` | §3.1–§3.4 | 系统功能 + 标准轨迹实验(NPD) + 硬件局限性 + 小结 | ~6000 | ✅ |
| `video_comparison_results.md` | §3.2 补充 | 3 组视频真值对比（含方法、数据、结论、复现命令） | ~2500 | ✅ |
| `session_summary.md` | — | 本次 session 全部产出清单（代码/工具/数据/图表） | ~2000 | ✅ |

## 配套图表（`figures/`）

### 标准轨迹实验（§3.2.1）

| 文件 | 内容 |
|---|---|
| `trajectory_static.png` | 静止 60s：IMU vs 零位移参考 |
| `trajectory_line.png` | 直线往返 19s：IMU vs 直线参考 |
| `trajectory_square_01.png` | 正方形（快 12s）：IMU vs 矩形参考 |
| `trajectory_square_02.png` | 正方形（慢 18s）：IMU vs 矩形参考 |
| `trajectory_circle.png` | 圆形 10.6s：IMU vs 圆形参考 |

### 视频真值对比（§3.2.2）

| 文件 | 内容 |
|---|---|
| `video_overlay_tag1.png` | Tag 1 视频帧 + 手动标注轨迹叠加 |
| `video_overlay_tag2.png` | Tag 2 视频帧 + 手动标注轨迹叠加 |
| `video_overlay_tag3.png` | Tag 3 视频帧 + 手动标注轨迹叠加 |
| `video_comparison_tag1.png` | Tag 1 IMU vs 视频：轨迹叠加 + NPD 时序 + 指标 |
| `video_comparison_tag2.png` | Tag 2 IMU vs 视频：轨迹叠加 + NPD 时序 + 指标 |
| `video_comparison_tag3_saturated.png` | Tag 3 IMU vs 视频：含饱和红色标注 |

### 其他

| 文件 | 内容 |
|---|---|
| `../../docs/imu_saturation_research.md` | IM948 ±16g 量程局限性文献综述 + 实测（含 10 条参考文献） |

## 关键数据汇总

### 标准轨迹基线

| 场景 | 闭环误差 | Mean NPD | RMSE NPD | Max NPD |
|---|---|---|---|---|
| 静止 60s | 0.07 cm | 0.05 cm | 0.05 cm | 0.07 cm |
| 直线 19s | 8.95 cm | 8.79 cm | 10.92 cm | 25.87 cm |
| 正方形（快） 12s | 3.71 cm | 2.01 cm | 3.24 cm | 12.55 cm |
| 正方形（慢） 18s | 1.45 cm | 3.63 cm | 4.85 cm | 16.73 cm |
| 圆形 10.6s | 33.51 cm | 9.10 cm | 11.44 cm | 21.95 cm |

### 视频对比

| Tag | 强度 | Mean NPD | 饱和 |
|---|---|---|---|
| 1 | 轻（推球） | 7.80 cm | 无 |
| 2 | 中（平抽） | 6.26 cm | 无 |
| 3 | 高（杀球） | 210.50 cm | 29 帧 (3.8%) |

## 转稿建议（Word 转写时）

### 第 2 章补充合入位置

| 本文档节 | 原稿对应节 | 合入策略 |
|---|---|---|
| §2.4.A 双导航器实现 | §2.4 三维轨迹计算 | 追加为新小节 |
| §2.4.B 重力参考三阶段初始化 | §2.3.2 重力去除 | 追加为新小节 |
| §2.5.A–D ZUPT 工程细节 | §2.5 零速更新 | 追加为新小节 |
| §2.6.A–D 系统架构工程决策 | §2.6 系统架构设计 | 追加为新小节 |
| §2.7 加速度饱和检测 | — | 新增节 |

### 第 3 章合入位置

| 本文档节 | 原稿对应节 | 合入策略 |
|---|---|---|
| §3.1 系统功能实现 | §3.1 | **整段替换** |
| §3.2 算法效果验证 | §3.2 | **整段替换**（旧 temporal RMSE → 新 NPD） |
| 视频对比部分 | — | 新增为 §3.2 的子节 |
| §3.3 硬件局限性 | — | 新增节 |
| §3.4 本章小结 | — | 新增节 |

## 撰写约定

- **语言**：中文学术风格，被动或中立表述为主
- **数据精度**：位置 cm（2 位小数），时间 s（1 位），角度度（1 位）
- **指标命名**：闭环误差 / Mean NPD / RMSE NPD / Max NPD
- **图表引用**：`figures/<name>.png` 相对路径
