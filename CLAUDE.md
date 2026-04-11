# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **如果你是新开启的 agent session（尤其是跨机器接棒的）**：先读 [`HANDOFF.md`](./HANDOFF.md)，那里有前一个 session 的交接笔记，包括已完成的工作、未解决的问题、调查建议和红线清单。本文件（`CLAUDE.md`）描述稳定的架构和不变式，`HANDOFF.md` 描述动态的会话状态。

## 项目概述

IMU Vis 是一个基于 Tauri + React + TypeScript 的跨平台 IMU（惯性测量单元）数据可视化工具。后端使用 Rust 处理蓝牙通信、数据处理管道和 SQLite 数据库录制，前端使用 React + Ant Design 构建现代化界面，并通过 Canvas 和 Three.js 实现高性能的实时数据可视化。

## 开发命令

### 依赖管理
```bash
pnpm install              # 安装所有依赖
```

### 开发模式
```bash
pnpm tauri dev            # 启动完整开发环境（前端 + Tauri 后端）
pnpm dev                  # 仅启动前端开发服务器（不包含 Tauri API）
```

### 构建
```bash
pnpm build                # 构建前端（TypeScript 编译 + Vite 打包）
pnpm tauri build          # 构建完整应用（前端 + Rust 后端，生成可分发的安装包）
```

### Rust 后端开发
```bash
cd src-tauri
cargo build               # 构建后端
cargo test                # 运行测试
cargo clippy              # Lint 检查
cargo run                 # 直接运行后端（独立于前端）
```

## 架构设计

### 前端架构（React + TypeScript）

**目录结构**:
- `src/components/` - 可复用 UI 组件（ConnectionPanel, ImuChartsCanvas, ImuThreeCard, 等）
- `src/pages/` - 页面级组件（ImuRealtimePanel, DebugPanel）
- `src/providers/` - React Context Providers（BluetoothProvider, DeveloperModeProvider）
- `src/hooks/` - 自定义 Hooks（useBluetooth, useDeveloperMode, useImuSource, 等）
- `src/services/` - 与后端通信的服务层（Tauri commands 封装）
- `src/utils/` - 工具函数（如 ImuHistoryBuffer）
- `src/types.ts` - 全局 TypeScript 类型定义（与 Rust 后端的数据结构对应）

**Provider 架构**: 应用根组件包裹了全局 Providers（`AppProviders`），提供应用级状态管理：
- `BluetoothProvider` - 管理蓝牙设备连接、扫描和数据模式
- `DeveloperModeProvider` - 管理开发者模式状态（控制 Debug 面板可见性）

**数据可视化**:
- **实时波形图**: 使用原生 HTML5 Canvas 绘制，性能优化，避免 React 重渲染
- **3D 姿态显示**: 基于 Three.js 实现实时 3D 物体姿态和轨迹可视化

**前后端通信**:
- **Tauri Commands**: 同步/异步调用后端函数（设备扫描、连接、配置、录制控制等）
- **实时数据流**: 通过 WebSocket 或 Tauri 事件系统接收高频 IMU 数据

### 后端架构（Rust + Tauri）

**模块结构**（`src-tauri/src/`）:
- `app_state.rs` - 全局应用状态管理，持有 IMUClient、Processor、Recorder 等资源
- `commands/` - Tauri 命令处理器（前端调用入口）
  - `imu.rs` - IMU 相关命令（扫描、连接、断开、配置）
  - `recording.rs` - 录制控制命令
  - `debug.rs` - Debug 监控命令
  - `output.rs` - 输出流订阅命令
- `imu/` - 蓝牙通信层
  - `client.rs` - IMU 蓝牙客户端（基于 btleplug）
  - `config.rs` - IMU 配置结构
- `processor/` - 数据处理管道
  - `pipeline/` - 完整的数据处理流水线（校准、滤波、ZUPT、轨迹计算）
  - `calibration/` - 校准模块（陀螺仪/加速度计偏差、轴对齐）
- `recorder/` - SQLite 数据库录制（基于 sea-orm）
- `debug_monitor/` - Debug 实时监控（队列深度、处理频率、性能指标）
- `types/` - 后端数据结构定义
- `logger.rs` - 日志系统（基于 tracing）

**数据流**:
```
蓝牙设备 (BLE)
  ↓
IMUClient (btleplug)
  ↓
Processor Pipeline (校准 → 滤波 → ZUPT → 轨迹计算)
  ↓
├─→ 前端 (WebSocket/Events)
└─→ Recorder (SQLite)
```

**自定义 Crate**:
- `math_f64` - 本地数学库（位于 `src-tauri/crates/math_f64`），提供 IMU 数据处理所需的数学运算

**关键依赖**:
- `btleplug` - 跨平台蓝牙 BLE 通信
- `sea-orm` - SQLite ORM，用于数据录制
- `axum` - WebSocket 服务器（实时数据流）
- `flume` - 无锁 MPMC 通道（高性能异步消息传递）
- `tracing` - 结构化日志

## 开发注意事项

### Rust 后端
- **开发模式优化**: `Cargo.toml` 中 `[profile.dev]` 设置 `opt-level = 3`，确保开发模式下也有较好的性能
- **Debug DevTools**: Debug 构建下会自动打开浏览器开发者工具（见 `lib.rs` setup）
- **文档注释要求**: 所有公共 API 都需要 `///` 文档注释（启用了 `#![deny(missing_docs)]`）

### 前端
- **组件约定**: 每个组件目录包含一个 `index.ts` 用于统一导出
- **类型定义**: `src/types.ts` 包含与 Rust 后端一致的数据结构定义，确保前后端类型同步
- **样式**: 使用 SCSS 模块化样式（`*.module.scss`）

### Tauri 配置
- **开发服务器**: 前端开发服务器运行在 `http://127.0.0.1:3000`
- **前端构建输出**: 构建产物输出到 `dist/`，由 Tauri 打包

### 数据库
- 应用运行时会在本地创建 `imu_recordings.sqlite` 用于存储录制的 IMU 数据会话

## 技术栈总结

**前端**: React 19 · TypeScript 5.8 · Vite 7 · Ant Design 6 · Three.js · Plotly.js · SCSS
**后端**: Tauri 2 · Rust 2021 · btleplug · sea-orm · axum · flume · tracing
**包管理**: pnpm

## 算法迭代工作流（离线 replay）

调参或改算法时**不要**要求重新采集真机数据，使用离线 replay：

```bash
# 基本用法（session 名模糊匹配或数字 id）
bash scripts/iterate.sh 正方形2 scripts/reference_正方形.csv
bash scripts/iterate.sh 静止                 # 无参考轨迹也可

# 直接调二进制（更细的控制）
cd src-tauri
cargo run --release --bin replay -- --session 正方形2 --no-report
```

**工作原理**：
1. `src-tauri/src/bin/replay.rs` 从 `imu_recordings.sqlite` 按 session 取出**原始 IMU 样本**（不是计算后的轨迹）
2. 用当前 `processor.toml` 重建 `ProcessorPipeline`，诊断开关常开
3. 逐帧跑 `process_sample_raw()`（与在线管线共享主体逻辑，跳过 BLE 字节解析）
4. 输出到 `exports/`：
   - `replay_<session>_trajectory.csv` — 轨迹列（与在线导出同格式）
   - `replay_<session>_diag.csv` — 压平的 `PipelineDiagnostics` 时序（~35 列）
5. 默认调 `scripts/report.py` 输出**紧凑 Markdown 报告**到 stdout（目标 < 3 KB ≈ 600 tokens）：轨迹 vs 参考 · ZUPT 统计 · 偏差收敛 · ESKF 协方差/创新 · 静止段完整性 · 信号范围 · 性能分位数 · 自适应每秒分箱

**可重复性保证**：
- 同 `processor.toml` + 同 session → `trajectory.csv` **逐字节一致**；`diag.csv` 仅 `perf_process_us` 因墙钟差异
- 回归对比时用 `scripts/report.py` 的聚合指标做基准

**不适用的场景**：BLE 解析层变更（replay 跳过解析）、硬件/固件变更、需要验证新动作场景（此时必须重新录制）

**已有录制会话**（至 2026-04-11）：`静止`(id=3)、`直线`(id=21)、`正方形`(id=22)、`正方形2`(id=23)、`圆形`(id=38)、`停止后依然跳动`(id=54)
**参考轨迹**：`scripts/reference_{静止,直线,正方形,圆形}.csv`
**Python 依赖**：通过 `scripts/pyproject.toml` 由 `uv` 管理（pandas/numpy/matplotlib），replay 自动用 `uv run` 调用

## 处理管线诊断系统

`src-tauri/src/processor/pipeline/diagnostics.rs` 定义 `PipelineDiagnostics`，每帧一份，涵盖：

- **各阶段中间值**：`cal_*`（标定前后）· `filt_*`（滤波前后）· `zupt_*`（静止检测）· `nav_*`（积分）· `eskf_*`（协方差/偏差/创新）· `backward_*`（回溯修正）
- **性能指标**：`perf_process_us` · 上下游/录制通道队列深度 · BLE 收包间隔

**零开销门控**：诊断采集由 `Arc<AtomicBool>` 单指令判断，关闭时不走诊断路径。前端通过"开发者模式 + 诊断 Tab"触发 `subscribe_diagnostics` command，自动开启/关闭标记位。

**BLE 间隔统计**：`perf_ble_interval_ms` 使用**主机端** `Instant::now()` 差分计算，**不要**用 `raw.timestamp_ms`（那是设备板载计数，固定 4 ms 递增）。

## 导航器双实现

`processor.toml` 顶层字段 `navigator_impl` 切换：

- `"legacy"` — 传统积分 + ZUPT 硬锁定（`src-tauri/src/processor/navigator/legacy.rs`）
- `"eskf"` — 15-state 误差状态卡尔曼滤波（`src-tauri/src/processor/navigator/eskf/`），状态向量 `[δθ, δv, δp, δb_g, δb_a]`

**ESKF 关键行为**（文档之外的不变式）：
- ZUPT 触发时**不注入** `δp`（位置误差），仅注入 `δθ/δv/δb_g/δb_a`。原因：ZUPT 只观测"速度=0"，协方差间接推断的位置修正在 MEMS IMU 上经常产生跳变
- ZUPT 触发后**硬归零速度**（即使 Kalman 最优修正保留协方差更新）。原因：加速度计残差积分导致速度线性漂移
- `detect_static` 用**原始线加速度范数**（不减 `bias_accel` 估计），避免 bias 跑偏时 ZUPT 永不触发

前端 `SettingsPanel` 的"轨迹计算"卡片有 `navigator_impl` 下拉选择器。

## 开发者模式与诊断面板

- `DeveloperModeProvider` + `useDeveloperMode` hook，状态持久化到 localStorage
- 激活方式：`ImuToolBar` 上模式标签**连续点击 5 次**（Android 风格），激活后显示 DEV badge
- 激活后 `App.tsx` 顶层渲染为 `Tabs`：`实时` / `诊断`；未激活时只渲染实时面板
- `DiagnosticsPanel` 使用 EMA 平滑显示聚合值，避免每帧刷新造成的视觉抖动
- `DiagnosticsHistoryBuffer`（`src/utils/`）复用 `ImuHistoryBuffer` 的环形 typed array 模式

## 配置文件热加载

`processor.toml` 可运行时热加载：`Processor::init_config_watcher` 每 3 秒检查文件 `modified_time`，变更则通过 channel 送新配置，`ProcessorPipeline::reset_with_config` 重建管线并保留最近一次原始样本做轴校准。

**注意**：`processor.toml` 必须放在项目根目录（不是 `src-tauri/`），否则 Tauri dev 的文件监视器会把配置变更当作源码改动触发重新编译。`ProcessorPipelineConfig::default_config_path` 支持从 `src-tauri/` CWD 向上回退到父目录查找。

## 前端类型同步

`src/types.ts` 的 TypeScript 接口必须与后端 Rust 结构保持一致，特别是：
- `PipelineDiagnostics` ↔ `src-tauri/src/processor/pipeline/diagnostics.rs`
- `ResponseData` / `OutputFrame` ↔ `src-tauri/src/types/outputs.rs`
- `ProcessorPipelineConfig` ↔ `src-tauri/src/processor/pipeline/types.rs`

改后端结构时记得同步更新前端类型，否则 Tauri IPC 反序列化会默默吞字段或失败。

## Rust 模块可见性

`src-tauri/src/lib.rs` 中 `processor`、`recorder`、`types` 是 `pub mod`（供 `bin/replay.rs` 跨二进制复用），其余 `app_state`/`commands`/`imu`/`logger` 保持私有。新增需要被 bin 复用的模块时要同步调整。

`recorder` 和 `types` 模块上加了 `#[allow(missing_docs)]`，因为 SeaORM 实体字段太多不值得逐字段加文档；其他模块仍强制 `#![deny(missing_docs)]`。

## 算法关键事实与不变式

改 `processor/navigator/*` 或 ZUPT 相关代码之前**务必读完本节**。这些是通过 replay 对比验证过的事实，违反任何一条都会导致漂移回到米级。

### 1. IMU 板载 quat 不是"对准世界重力"的旋转

这台 WT 系列 IMU 的固件 AHRS 输出的 quat 是**相对开机初始朝向**的旋转，不是到"Z 轴对准世界重力"的旋转。开机时 `quat ≈ [1,0,0,0]`（恒等），无论设备物理倾角是什么。

**证据**（session id=55 前几帧）：
- `accel_with_g = [+1.0, -2.4, +9.5]`（有 ~14° 倾角）
- `quat = [1.000, -0.002, -0.016, +0.003]`（恒等）
- `R(quat) * accel = [0.9, -2.4, 9.5]`，差 `[0,0,g]` 有 **2.5 m/s²**

**后果**：硬编码 `gravity_ref = [0, 0, 9.848]` 是错的。正确做法是用首帧附近的 `R(q) * accel_with_g` 作为重力参考。

### 1.1 gravity_ref 三阶段初始化

`EskfNavigator::update` 和 `LegacyNavigator::update` 实现三种策略（详见代码注释）：

1. **首帧干净**（`||R*a| - g| < 0.15` 且 `|gyro| < 0.15 rad/s`）→ 直接用首帧 R*a，**立即锁定**
2. **首帧被污染**（例如用户点"开始录制"时手还在微小运动，实测首帧 `|R*a|` 常比真 g 低 1 m/s²）→ 进入 100 帧 refine 窗口，累加后续"干净"帧的 R*a，窗口末用均值替换
3. **窗口内干净帧不足 10 个**（用户一开始就在剧烈运动）→ 保留首帧 bootstrap 值

**"干净帧"的判据**关键：**同时检查 `|R*a| ≈ g`（模长）和 `|gyro|` 低**。只看 gyro 不够——`|R*a|` 是绝对物理量，静止时必须等于 g，这比方向更稳健。

**状态字段**（两个 navigator 都有）：
- `gravity_initialized: bool` — 首帧已 bootstrap
- `gravity_locked: bool` — 已最终锁定，不再 refine
- `gravity_init_total_frames / _static_frames / _sum` — refine 窗口累加器

**`set_gravity_reference(quat_offset)`**（用户"姿态校准"按钮）立即把 `gravity_initialized` 和 `gravity_locked` 都置为 true，完全绕过自动初始化。

**`reset()`** 清除所有字段，允许下次 update 重新走三阶段逻辑。

**不要做**：
- 不要把 `gravity_ref` 改回硬编码 `[0, 0, g]`
- 不要假设 `R(quat) * accel_with_g ≈ [0, 0, g]` 在任何情况下成立
- 不要只用首帧 bootstrap 而不做 refine——用户录制启动时往往不是严格静止
- 不要无脑用 init window 的所有帧平均——会被缓慢 yaw 漂污染，让已经干净的首帧变差
- 接入其他 IMU（quat 已对准世界系）时不需要改——三阶段逻辑对两种情况都正确

### 2. ZUPT 静止检测用的是原始 `a_lin`，不减 bias_accel 估计

`eskf/mod.rs` 的 `detect_static` 步骤里：
```rust
let a_world_raw = attitude.rotate_vec3(sample.accel_lp);  // 注意：不减 bias_accel
let a_lin_raw = a_world_raw - self.gravity_ref;
let accel_norm = a_lin_raw.length();
```

**Why**：如果用减 bias 后的 `a_lin`，当 ESKF 的 `bias_accel` 估计跑偏时，`a_lin` 持续偏大 → ZUPT 永不触发 → bias 永不被修正，雪崩式漂移。用原始 `a_lin` 打破这个死循环。

**代价**：`accel_norm` 静止残差完全取决于 `gravity_ref` 准确度。快速旋转后板载 AHRS 有几度漂移，静止时 `accel_norm` 有 0.4-0.8 m/s² 的残差（p95 ≈ 0.81）。所以 `accel_enter_thresh` 被调到 **0.60 m/s²**——看起来很宽松，但这是必要值。

**不要做**：
- 不要在 `detect_static` 里改成用 `sample.accel_lp - bias_accel`（会死循环）
- 不要把 `accel_enter_thresh` 收紧到 < 0.4（停下阶段 ZUPT 触发率会暴跌）
- 调阈值前先看 `replay_*_diag.csv` 里 `gyro<0.1` 子集的 `zupt_accel_norm` 分位，阈值要覆盖那个子集的 p95-p99

### 3. ZUPT 触发时硬归零速度

```rust
// eskf/mod.rs ZUPT 块的末尾
self.nav_state.velocity = DVec3::ZERO;
self.last_accel_lin = None;
```

**Why**：Kalman 最优修正后速度接近零但不严格为零，加上加速度计残差每帧被积分，会产生线性速度漂移。硬归零直接切断积分。**协方差和 bias 估计仍通过 `zupt_update`/`apply_state_injection` 正常更新**，硬归零只作用于最终 nominal velocity。

### 4. ZUPT 不注入位置修正 δp

```rust
// update.rs apply_state_injection
let _ = (dx.get(6), dx.get(7), dx.get(8));  // 跳过 δp
```

**Why**：ZUPT 只观测"速度 = 0"，对位置没有直接信息。`δp` 来自协方差耦合的间接推断，在 MEMS IMU 上经常不准确，会导致静止时位置跳变。姿态/速度/bias 的修正仍然注入。

### 5. 可视化路径不得反压 BLE ingress

`processor/mod.rs` 的 pipeline 线程里：

```rust
// 到前端的路径：非阻塞 try_send，丢帧容忍
downstream_tx.try_send(response_data)  // ← 必须是 try_send，不是 send

// 到录制的路径：同步阻塞 send，完整性必须保证
record_tx.send(frame)                   // ← 这里保持 send
```

**Why**：`downstream_tx` 是 `flume::bounded(256)`，消费者是 Tauri IPC forwarder → 前端 Canvas/React。若用同步 `send()`，前端渲染变慢/macOS BLE 调整连接间隔等任何下游抖动都会反压到 pipeline 线程 → 再反压到 BLE reader（`tx.send_async(...).await` 阻塞）→ BLE 吞吐从 200+ Hz 降到 70-150 Hz 并随时间递减。

**症状**（历史上见过的）：
- "处理速率报告" throughput 随时间单调递减：181 → 154 → 124
- 切换开发者模式/任何 React 重渲染触发的 CPU burst 会让 macOS BLE 悄悄把 connection interval 调保守，一旦保守就不再调回
- 重启应用才恢复

**不要做**：
- 不要把 `downstream_tx` 改回 `send()` —— 哪怕觉得"丢帧不可接受"
- 不要把 `downstream_tx` 扩容到 `unbounded` —— OOM 风险，且只是延迟问题不是解决
- 不要给 `record_tx` 也改 `try_send` —— 录制必须完整，reasoning 不同

**代价**：前端在重负载下会跳帧（60-100 fps 可视化而不是 250 fps）。这不是 bug，是设计——人眼感知不到 60 Hz 以上。

### 6. 当前 `processor.toml` ZUPT 阈值（2026-04-11）

```toml
[zupt]
gyro_enter_thresh = 0.18     # rad/s  (≈ 10 deg/s)
accel_enter_thresh = 0.60    # m/s²   (要覆盖 gravity_ref 残差)
gyro_exit_thresh = 0.35
accel_exit_thresh = 1.00
enter_frames = 15            # 250 Hz 下 60 ms
exit_frames = 3              # 12 ms
```

迟滞方向：`enter` 阈值低，`exit` 阈值高，且 `entering` 要求 gyro AND accel 都低，`exiting` 只要任一超过。

## 轨迹重建基线指标 (2026-04-11)

改 `navigator`/ZUPT/重力补偿相关代码前存基线，改后重跑所有 session 对比。任何红线指标恶化必须立即回滚。

| Session | Loop close | Drift rate | Static % | 说明 |
|---|---|---|---|---|
| 静止 | 0.07 cm | 0.001 cm/s | 99.9% | **红线**：loop close 超过 0.5 cm 说明基础逻辑被破坏 |
| 正方形2 | 1.45 cm | 0.081 cm/s | 70.2% | |
| 直线 | 8.95 cm | 0.470 cm/s | 38.3% | |
| 圆形 | 33.51 cm | 3.161 cm/s | 33.3% | |
| 停止后依然跳动 | 28.06 cm | 3.117 cm/s | 57.9% | |
| 原地4分之一圆转动 | 59 cm | 4.360 cm/s | 25.6% | **红线**：超过 3 米说明 gravity_ref 逻辑被破坏 |
| **session 57**（小臂往复+半秒停顿） | **43 cm** | 3.701 cm/s | 35.8% | 首帧被污染场景，验证 refine window |
| session 56（小臂往复无停顿） | 558 cm | 61 cm/s | 10.5% | **预期大漂移**：连续运动无 ZUPT 触发机会 |

基线验证流程：
```bash
# 改动前
for s in 静止 正方形2 直线 圆形 停止后依然跳动 原地4分之一圆转动; do
    bash scripts/iterate.sh "$s" 2>&1 | head -15 > /tmp/before_"$s".txt
done

# 改动后
for s in 静止 正方形2 直线 圆形 停止后依然跳动 原地4分之一圆转动; do
    bash scripts/iterate.sh "$s" 2>&1 | head -15 > /tmp/after_"$s".txt
    diff /tmp/before_"$s".txt /tmp/after_"$s".txt
done
```

**允许**：个别 session 小幅恶化 (< 20%)，只要总体改善
**红线**：
- `静止` loop close > 0.5 cm
- `原地4分之一圆转动` loop close > 3 m
- `正方形2` loop close > 10 cm
- 任何 session 的 Static % 掉到 0（说明 ZUPT 完全失效）

此表过期标志：
- `processor.toml` 大改（ZUPT 阈值或 ESKF 参数调整）
- ESKF 状态向量变化
- `detect_static` 或 `gravity_ref` 初始化逻辑改动
- 新增 navigator 实现

届时要重新测基线并替换此表。
