# 项目: imu_vis

## 概览
- 基于 Tauri + React + TypeScript 的 IMU 可视化应用。
- 前端使用 Vite、React 19、Ant Design、Plotly，以及 Tauri 事件 API。
- 后端为 Rust Tauri 应用，负责 BLE IMU 的采集、处理与 IPC 推送到前端。

## 关键路径
- 前端入口：`src/main.tsx`，应用壳：`src/App.tsx`
- UI 组件：`src/components/`
- Tauri 后端：`src-tauri/crates/imu-vis/src/`
- IMU 数据管线状态：`src-tauri/crates/imu-vis/src/app_state.rs`
- 命令处理：`src-tauri/crates/imu-vis/src/commands/`
- 数据处理：`src-tauri/crates/imu-vis/src/processor/`
- BLE 客户端/配置/类型：`src-tauri/crates/imu-vis/src/imu/`，`src-tauri/crates/imu-vis/src/types/`
- Tauri 配置：`src-tauri/tauri.conf.json`
- REST/WS 文档（如使用独立后端服务）：`src-tauri/API_ENDPOINTS.md`

## 运行时数据流（Tauri）
- BLE 数据包 -> `IMUClient` -> flume 通道 -> `Processor` -> `ResponseData` -> IPC `Channel` 到前端。
- 心跳事件在 `src-tauri/crates/imu-vis/src/lib.rs` 发射，并由 `src/hooks/useWebSocket.ts` 的 `useHeartbeat` 消费。

## 常用命令
- `pnpm dev`：启动 Vite 开发服务器。
- `pnpm dev:backend`：运行 Rust 后端（`src-tauri` 下执行 `cargo run`）。
- `pnpm tauri dev`：启动 Tauri 应用并联动 Vite。
- `pnpm build`：TypeScript 类型检查 + 前端构建。

## 备注
- 前端当前监听名为 `heartbeat` 的 Tauri 事件。
- `subscribe_output` 通过 Tauri IPC 通道提供 IMU 数据（见 `src-tauri/crates/imu-vis/src/commands/output.rs`）。
