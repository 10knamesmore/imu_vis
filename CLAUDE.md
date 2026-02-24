# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
