# IMU Visualization Tool (IMU Vis)

这是一个基于 [Tauri](https://tauri.app/)、[React](https://react.dev/) 和 [TypeScript](https://www.typescriptlang.org/) 构建的跨平台 IMU（惯性测量单元）数据可视化工具。

## 功能特性

- 📊 **实时数据图表**：使用原生 HTML5 Canvas 高性能绘制传感器数据波形。
- 🧊 **3D 姿态可视化**：基于 [Three.js](https://threejs.org/) 实现实时的 3D 物体姿态显示。
- 💾 **本地数据记录**：支持将采集的数据保存到本地 SQLite 数据库 (`imu_recordings.sqlite`)。
- 🎨 **现代化界面**：采用 [Ant Design](https://ant.design/) 组件库，提供简洁友好的用户界面。

## 技术栈

- **Core**: Tauri (Rust)
- **Frontend**: React, TypeScript, Vite
- **UI**: Ant Design, SCSS
- **Visualization**: HTML5 Canvas, Three.js
- **Database**: SQLite

## 开发环境设置

确保你已经安装了 [Node.js](https://nodejs.org/)、[pnpm](https://pnpm.io/) 以及 [Rust](https://www.rust-lang.org/) 开发环境。

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

启动前端和后端开发模式：

```bash
pnpm tauri dev
```

如果你只需要调试前端界面（不包含 Tauri API）：

```bash
pnpm dev
```

### 构建应用

构建生产环境版本：

```bash
pnpm tauri build
```

## 许可证

本项目采用 MIT 许可证。详情请参阅 [LICENSE](LICENSE) 文件。
