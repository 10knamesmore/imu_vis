# Agent Session Handoff Document

> 前一个 Claude Code session 在 macOS 上工作，遇到了一个无法就地诊断的 BLE 吞吐问题，现在要交接给 Linux 上的新 session。本文档是**新 session 第一件要读的东西**。读完本文档 + `CLAUDE.md` 你就能无缝接棒。

---

## 1. 新 session 开工前必读清单

按顺序读：

1. **`CLAUDE.md`** — 项目整体架构、replay workflow、算法不变式（5 条不变式 + 基线指标表）
2. **本文档的 §3 未解决问题** — 这是接棒的核心
3. **本文档的 §2 近期修改摘要** — 了解近期改了什么，避免重复劳动
4. **`processor.toml`** — 当前算法参数
5. **`scripts/iterate.sh`** 的用法（`CLAUDE.md` 里有详细说明）

**第一件要跑的事**：克隆仓库到 Linux 后先跑一次基线验证，确认 Linux 上的行为和 macOS 一致：
```bash
cd /path/to/imu_app/src-tauri && cargo build --release --bin replay
cd .. && bash scripts/iterate.sh 静止 scripts/reference_静止.csv
```
期望看到 `Loop close: 0.07 cm`（和 `CLAUDE.md` 基线表一致）。如果偏差 > 20%，说明 Linux 的浮点行为或数据库行为有差异，先调查这个再做别的。

---

## 2. 近期修改摘要（2026-04-11 session）

上一个 session 做了这些事，按时间顺序：

### 2.1 建立离线 replay + 紧凑报告工作流（已完成并持久化）

见 `CLAUDE.md` 的"算法迭代工作流（离线 replay）"和"轨迹重建基线指标"。

- **`src-tauri/src/bin/replay.rs`** — 独立 CLI，从 SQLite 读原始样本重跑 pipeline，输出轨迹 CSV + 诊断 CSV
- **`scripts/report.py`** — 压缩聚合指标到 < 3K tokens 的 Markdown
- **`scripts/iterate.sh`** — 一键封装
- **关键改动**：`src-tauri/src/lib.rs` 把 `processor`/`recorder`/`types` 改成 `pub mod`（让 bin 跨二进制复用），`Cargo.toml` 加了 `default-run = "imu-vis"` 和 `[[bin]] name = "replay"`
- **`src-tauri/src/processor/pipeline/logic.rs`** 抽出了 `process_sample_raw(raw)` 私有方法，让 replay 能跳过 BLE parser 直接喂样本

### 2.2 `gravity_ref` 三阶段初始化（已完成）

见 `CLAUDE.md` §1.1。核心发现：**WT 系列 IMU 板载 quat 不是"对准世界重力"的旋转，是相对开机朝向**。硬编码 `gravity_ref = [0,0,9.848]` 会和真实 IMU 姿态差 10°+，导致静止时 `accel_norm` 有 1-2.5 m/s² 的伪线加速度，ZUPT 永不触发。

修复逻辑在 `eskf/mod.rs` 和 `legacy.rs` 的 `update()`：
1. 首帧 `|R*a| ≈ g` 且 `|gyro|` 低 → 直接锁定
2. 首帧被污染 → 进 100 帧 refine 窗口，累加干净帧均值
3. 窗口内干净帧 < 10 → 保留首帧 bootstrap

### 2.3 ZUPT 阈值调优（已完成）

见 `processor.toml`，`CLAUDE.md` §5。原值 0.08/0.12 → 当前 0.18/0.60/0.35/1.00。原因：
- `accel_enter_thresh = 0.60` 看起来很宽松但必要——`detect_static` 用原始 `a_lin`（不减 bias_accel，见 `CLAUDE.md` §2），静止残差实测 p95 ≈ 0.8 m/s²

### 2.4 可视化路径改 try_send（已完成，**效果未达预期，见 §3**）

`src-tauri/src/processor/mod.rs` 里的 `downstream_tx.send()` 改成 `try_send()`，意图是让前端渲染慢不再反压到 BLE reader。但实测问题**没有解决**，见 §3。

---

## 3. 未解决问题：BLE throughput 在 macOS 上不稳定且随时间递减

### 3.1 症状

- IMU 固件配置 `report_rate = 250 Hz`（`src-tauri/src/imu/config.rs:90`），应产生 250 msg/s
- 在 macOS（Apple Silicon）上用 btleplug + Core Bluetooth 实测：
  - **刚连上前几秒**：throughput 150-230 Hz（最高能冲到 228）
  - **稳态**：100-150 Hz，方差极大（40-220 同一分钟内）
  - **长时间运行**：缓慢降到 50-100 Hz
- 日志行为：`src-tauri/src/imu/client.rs:210-219` 的 "处理速率报告" 每秒打印一次

### 3.2 尝试过的假设和结果

| # | 假设 | 是否验证 | 结果 |
|---|---|---|---|
| 1 | BLE 协议只能一个通知一个样本，固件不批处理 | 读了 `parser/logic.rs`，每包解析一个样本 | 正确但不完全——不解释为什么会降 |
| 2 | macOS Core Bluetooth 的 connection interval 被锁在 15-30ms | 无法直接验证（需要系统诊断工具） | **高度可能但无法从代码 fix** |
| 3 | `downstream_tx` (bounded 256) 反压：前端消费慢 → pipeline 阻塞 → BLE 堵 | 改成 `try_send` 丢帧，`mod.rs:163` | **无效果**。throughput 仍然 40-220 波动 |
| 4 | 开发者模式/诊断订阅导致 IPC 流量翻倍 | 检查日志发现诊断从未被订阅，只开启了开发者模式 | 假设不成立 |
| 5 | 前端 Canvas/React 随时间渲染变慢 | 未验证 | 因为 #3 无效果，说明前端反压不是主要因素 |

### 3.3 还未尝试的假设（给新 session 的候选）

**假设 A：`record_tx.send()` 仍然是同步阻塞，消费者在 Tauri async runtime 上**

- `src-tauri/src/recorder/service.rs:58` 的 `spawn_recorder` 用 `tauri::async_runtime::spawn`——**和 Tauri IPC 共享同一个 runtime**
- `src-tauri/src/processor/mod.rs:180` 的 `record_tx.send(frame)` 依然是同步阻塞
- 容量 2048，理论上有 8 秒 buffer，但如果 Tauri IPC 持续占用 runtime worker，`data_rx.recv_async()` 会被延迟调度
- **修复方案**：把 `spawn_recorder` 从 `tauri::async_runtime::spawn` 改成独立 `std::thread::spawn`，用同步 `flume::Receiver::recv()` 而不是 `recv_async()`。这样 IPC 再堵都不会拖累录制，pipeline 的 `record_tx.send()` 也不会被阻塞
- **Linux 优先级**：高。先试这个

**假设 B：macOS 的 tokio runtime 在 btleplug 回调压力下 work-stealing 不稳定**

- 日志里 "处理速率报告" 每秒由不同 ThreadId（5/6/7/8/12/13）打印
- 这是 work-stealing 正常行为，但如果某个 worker 被别的阻塞任务占住，BLE reader 的 `notification_stream.next().await` 恢复就会延迟
- Linux 下 tokio 行为通常更稳定，这个问题可能自动消失
- **Linux 优先级**：如果 A 修完还有问题再看

**假设 C：macOS Core Bluetooth 真的在动态降低 connection interval**

- 如果是这个，**Linux BlueZ 不会有这个问题**。Linux 允许 7.5 ms connection interval，且不会动态调整
- **验证方式**：在 Linux 上跑一分钟，看 throughput 是否稳定在 200+。**如果是，则 Linux 自动解决**

**假设 D：前端 IPC 桥本身的开销**

- Tauri 的 IPC Channel 用 `on_event.send(data)` 走内部序列化。250 Hz 每秒 serialize 一个 `ResponseData` 可能在某些系统上负担不小
- 修复思路：在 Rust 端批量（比如 10 ms 一批）发 IPC，而不是每样本一次
- **Linux 优先级**：低，等其他修完再看

### 3.4 新 session 的调查建议步骤

1. **在 Linux 上先跑一次基线**：连上真机，连续录 2 分钟，看 "处理速率报告" 的 throughput 分布。用 `rg "处理速率报告" /path/to/log | awk '{...}'` 统计 p50/p95/p99
2. **如果 Linux 基线是稳定 200+**：问题就是 macOS 特有的，给 macOS 的 `CLAUDE.md` 加 known-issue note 即可，不需要修代码
3. **如果 Linux 也有问题**：实施假设 A 的修复（recorder 移到独立线程），再测
4. **如果还有问题**：用 `tracing` 加细粒度 span，在 `processor/mod.rs:163` 的 match arm 里分别测量 `downstream_tx.try_send`、`record_tx.send`、`upstream_rx` 等待时间的分布，定位真正的 hot spot

### 3.5 相关代码位置速查

| 功能 | 文件:行 |
|---|---|
| BLE reader 线程 | `src-tauri/src/imu/client.rs:196` 的 `tauri::async_runtime::spawn` |
| 吞吐报告 | `src-tauri/src/imu/client.rs:210-219` |
| Pipeline 主循环 | `src-tauri/src/processor/mod.rs:105-227` |
| `downstream_tx.try_send` | `src-tauri/src/processor/mod.rs:165-181` |
| `record_tx.send` | `src-tauri/src/processor/mod.rs:182-184` |
| Recorder spawn | `src-tauri/src/recorder/service.rs:58` |
| Upstream channel 定义 | `src-tauri/src/app_state.rs:134` |
| `process_sample_raw` | `src-tauri/src/processor/pipeline/logic.rs:124` |

---

## 4. 可用的测试 session 列表（SQLite）

全在 `imu_recordings.sqlite`，通过 `bash scripts/iterate.sh <name>` 可离线 replay。对应的原始 CSV 在 `exports/`。

| id | name | 样本 | 场景 | 基线 loop close | 用途 |
|---|---|---|---|---|---|
| 3 | 静止 | 11209 | 60s 纯静止 | 0.07 cm | 红线：超过 0.5 cm 说明基础逻辑坏 |
| 21 | 直线 | 3533 | 直线往复 | 8.95 cm | |
| 22 | 正方形 | 2395 | 正方形路径 | — | 参考 `reference_正方形.csv` |
| 23 | 正方形2 | 3576 | 正方形路径（更稳） | 1.45 cm | 主回归测试 |
| 38 | 圆形 | 2081 | 圆形路径 | 33.51 cm | |
| 54 | 停止后依然跳动 | 2036 | 停下来后算法跳变 | 28.06 cm | 老 bug 重现 |
| 55 | 原地4分之一圆转动 | 2654 | 纯旋转无平移 | 59 cm | 红线：超过 3m 说明 gravity_ref 坏 |
| 56 | session 56（无停顿小臂往复） | 2065 | 连续往复无停顿 | 558 cm | **预期大漂移**：无 ZUPT 机会 |
| 57 | session 57（小臂往复+半秒停顿） | 2042 | 往复之间停半秒 | 43 cm | 验证 refine window |

**参考轨迹**：`scripts/reference_{静止,直线,正方形,圆形}.csv`（50 Hz，`time_ms/x_m/y_m` 格式）

---

## 5. 算法当前状态简报

实测指标（见 `CLAUDE.md` 的基线表）显示：
- **静止**场景完美（RMSE 0.05 cm）
- **带间歇停顿的运动**（正方形2、直线、session 57）误差可接受（1-10 cm 量级）
- **连续往复无停顿**（session 56）必然大漂移，这是 MEMS IMU 物理极限
- **纯旋转**（session 55）漂移来自向心加速度 + AHRS 微漂，目前 59 cm，想进一步改善需要"角速度过零点注入切向零速度"或"基于小臂长度的正运动学"——这两个都还没做

### 5.1 如果用户抱怨"某个动作漂移大"

**优先顺序**：
1. 问清楚动作类型和持续时间
2. 如果有对应的 session，用 replay 看基线；没有就让用户重录一个有 reference 的
3. 用 `CLAUDE.md` 里的 iterate workflow 调参或改算法
4. 每次改动都跑**完整的 6 个基线 session** 检查回归
5. 改动前存 `/tmp/before_*.txt`，改动后 diff

### 5.2 红线（任一触发必须回滚）

- `静止` loop close > 0.5 cm
- `原地4分之一圆转动` loop close > 3 m
- `正方形2` loop close > 10 cm
- 任何 session 的 Static % 掉到 0

---

## 6. 工具链和环境

- **语言**: Rust (nightly-ish, 2021 edition), TypeScript 5.8
- **构建**: pnpm + tauri 2.0 + cargo
- **Python**: `scripts/pyproject.toml` 用 `uv` 管理（pandas/numpy/matplotlib）
- **macOS specific**: `cc` 被 shell aliased 成 `claude code`——不影响 cargo 的 linker（cargo 通过 PATH 查找，不走 shell alias），但如果新 session 在其他 Unix 上报 cc 错误要注意
- **cargo test/build/check**：工作目录必须是 `src-tauri/`（因为 `Cargo.toml` 在那）
- **scripts/report.py 运行**：`cd scripts && uv run python report.py ...` 或让 replay bin 自动调

### 6.1 Rust 模块可见性注意

`src-tauri/src/lib.rs` 里 `processor`、`recorder`、`types` 是 `pub mod`（供 bin 使用）。`recorder` 和 `types` 上加了 `#[allow(missing_docs)]`，其他模块仍 `#![deny(missing_docs)]`。新增 bin 需要复用的模块时要同步放开可见性。

### 6.2 处理管线配置热加载

`processor.toml` 放在**项目根目录**（不是 `src-tauri/`），原因是 tauri dev 的文件监视器会把 `src-tauri/` 里的变更当成源码改动触发重编译。`ProcessorPipelineConfig::default_config_path` 支持从 `src-tauri/` 向上回退到父目录。

运行时热加载由 `Processor::init_config_watcher` 每 3 秒轮询 modified time。**注意**：热加载触发 `reset_with_config`，会重新初始化 navigator 状态。如果在运动中改 toml，`gravity_ref` 会被用"运动中的快照"重新锁定——建议静止时改参数。

---

## 7. 前一个 session 已经持久化到 memory 系统的内容

本机 `~/.claude/projects/-Users-wanger-Documents-imu-app/memory/`：
- `MEMORY.md` — 索引
- `replay_workflow.md` — 离线 replay 工作流的私有备忘

**这些 memory 文件不跨机器同步**。Linux 的新 session 需要从 `CLAUDE.md` 和本文档重建自己的工作记忆。**这正是本文档存在的理由**。

---

## 8. 给 Linux 新 session 的开场建议

读完 `CLAUDE.md` + 本文档后，建议这样开工：

1. **跑 §1 的基线验证命令**，确认数据和代码在 Linux 上能 reproduce 基线
2. **立即实施 §3.3 假设 A**（把 recorder 移到独立 std::thread），因为这是低风险高收益的改动
3. 让用户重新连上 IMU 录 2 分钟，收集 "处理速率报告" 日志
4. 如果 Linux 上 throughput 稳定 180+ → 写个 macOS known-issue 到 `CLAUDE.md`，跳到步骤 6
5. 如果 Linux 上仍然低/抖动 → 按 §3.3 假设 B/C/D 顺序调查
6. 所有其他算法改进请继续用 `bash scripts/iterate.sh` + 基线回归流程，见 `CLAUDE.md`

**不要重复做的事**：
- gravity_ref 初始化逻辑（已完成且验证过）
- ZUPT 阈值调优（已完成，有红线保护）
- replay 工作流（已完成）
- `process_sample_raw` 抽取（已完成）

**欢迎做的事**：
- 改善"纯旋转"场景（§5，两个候选方案都没做）
- 如果 BLE 吞吐问题修完，重新测所有基线，更新 `CLAUDE.md` 基线表
- 重构任何发现的 bug

---

## 9. 已知 bug / quirk 清单

- `src-tauri/src/imu/client.rs` 连接后有一次 `WARN IMU 数据解析失败: [error] data head not defined`——这是连接握手后的一个 control response 被 parser 当成数据包。无害，可以忽略，但长期应该过滤掉
- `scripts/validate_trajectory.py` 已被 `scripts/report.py` 大部分替代，但保留用作人工画图。`report.py` 从 `validate_trajectory.py` 复制了部分函数，两者有少量重复逻辑
- `exports/` 里的旧 CSV（`imu_*.csv`）可能来自更早的算法版本，**不要**用它们做基线对比。要对比就跑 replay 生成新的 `replay_*_trajectory.csv`
- `scripts/iterate.sh` 把第二个 positional arg 当作 reference，不能传 `--no-report`，要加额外 flag 需要直接调 `cargo run --bin replay -- ...`

---

**前一个 session 的最后状态**：用户决定移到 Linux 上继续。本文档写完后交接。
