# IMU 传感器标定向导

## 概述

消费级 IMU 存在加速度计零偏（bias）与比例因子（scale）误差，以及陀螺仪零偏，这些确定性系统误差会在姿态解算和轨迹重建中持续累积。标定向导通过引导用户采集六个静态位置的加速度计数据并额外采集一组陀螺仪静止数据，利用椭球拟合算法消除上述误差，并将标定结果持久化到 SQLite 数据库。

---

## 业务要求

### 触发条件

- 用户连接蓝牙设备后，后端自动查询该设备的标定记录（以蓝牙设备 ID 为索引）。
- 若数据库中**不存在**该设备的标定记录，前端自动切换到全页标定向导界面，不可跳过直接关闭（下次连接仍会提示，直到完成标定或手动跳过一次）。
- 若已存在标定记录，后端立即将参数应用到当前处理管线，正常进入实时面板。

### 标定流程

标定向导共 8 步，分为三个阶段：

| 步骤编号 | 阶段         | 说明                                  |
|----------|--------------|---------------------------------------|
| 0 – 5    | 加速度计采集 | 六个方向，每步静止采集 3 秒           |
| 6        | 陀螺仪采集   | 设备水平静置，静止采集 3 秒           |
| 7        | 结果确认     | 展示拟合质量与参数，用户确认后保存    |

#### 六个采集方向

| 步骤 | 方向描述        | 目标姿态（相对设备坐标系）  |
|------|-----------------|-----------------------------|
| P1   | Z 轴朝上        | 设备正面朝上水平放置        |
| P2   | Z 轴朝下        | 设备正面朝下水平放置        |
| P3   | X 轴朝上        | 设备 X 轴方向竖起朝上       |
| P4   | X 轴朝下        | 设备 X 轴方向竖起朝下       |
| P5   | Y 轴朝上        | 设备 Y 轴方向竖起朝上       |
| P6   | Y 轴朝下        | 设备 Y 轴方向竖起朝下       |

六个方向**不要求严格正交**，实际使用中大致对齐即可；椭球拟合算法能容忍一定的方向误差。

#### 采集行为规范

- 每步采集时长固定为 **3000 ms**，通过进度条实时展示进度（0 % → 100 %）。
- 采集期间持续收集 `accel_with_g`（含重力加速度的原始加速度）或 `gyro` 数据，取时间窗口内的**算术均值**作为该步骤的代表值。
- 采集完成后用户可选择**重新采集**（覆盖当前步骤数据）或**下一步**继续。
- 跳过标定的入口位于工具栏右侧，点击后直接退出向导（本次不保存，下次连接仍会提示）。

### 标定质量评估

| 最大残差（m/s²） | 等级     | 建议           |
|-----------------|----------|----------------|
| < 0.05          | 优秀     | 可直接应用     |
| 0.05 – 0.10     | 良好     | 可应用         |
| ≥ 0.10          | 建议重标 | 建议重新采集   |

结果步展示：最大残差、加速度计偏置 (m/s²)、加速度计缩放（无单位）、陀螺仪偏置 (rad/s)。

### 数据持久化

- 标定参数以**设备蓝牙 ID 为主键**存储到 SQLite，采用 `INSERT OR REPLACE` 语义，重新标定会覆盖旧记录。
- 保存成功后，参数立即热应用到当前运行的处理管线（无需重启应用或重连设备）。
- 标定参数**不再写入** `processor.toml`，由 SQLite 统一管理；配置文件仅保存滤波、ZUPT、轨迹等运行时参数。

---

## 数学设计

### 椭球拟合（轴对齐，六参数）

理想情况下，经校正后各方向加速度的模长应等于重力加速度 $g$：

$$\left\| S^{-1}(a - b) \right\| = g$$

其中 $b = [b_x, b_y, b_z]^T$ 为偏置，$S = \mathrm{diag}(s_x, s_y, s_z)$ 为对角缩放矩阵。展开为轴对齐椭球方程（6 个未知量 $A,B,C,D,E,F$）：

$$A a_x^2 + B a_y^2 + C a_z^2 + D a_x + E a_y + F a_z = 1$$

**求解步骤：**

1. 将 $N \geq 6$ 个测量值构建 $N \times 6$ 矩阵 $H$，右端向量 $\mathbf{1}_N$。
2. 求解正规方程组（含偏主元 Gauss 消去）：$\theta = (H^T H)^{-1} H^T \mathbf{1}_N$
3. 从 $\theta = [A,B,C,D,E,F]$ 恢复物理参数：

$$b_x = -\frac{D}{2A},\quad b_y = -\frac{E}{2B},\quad b_z = -\frac{F}{2C}$$

$$K = 1 + A b_x^2 + B b_y^2 + C b_z^2$$

$$s_x = \frac{\sqrt{K/A}}{g},\quad s_y = \frac{\sqrt{K/B}}{g},\quad s_z = \frac{\sqrt{K/C}}{g}$$

4. 质量评估：对每个测量位置计算残差 $e_i = \left|\left\| S^{-1}(a_i - b) \right\| - g \right|$，取最大值。

处理管线中应用缩放的方式为对角矩阵：$\text{accel\_matrix}[i][i] = 1/s_i$。

---

## 代码设计

### 前端

#### 目录结构

```
src/
├── components/
│   └── CalibrationWizard/
│       ├── CalibrationWizard.tsx       # 主向导组件（8 步状态机）
│       ├── CalibrationWizard.module.scss
│       ├── CalibrationThreeView.tsx    # Three.js 双视图（目标方向 / 实时姿态）
│       ├── useCalibrationCapture.ts    # 采集逻辑 Hook
│       └── index.ts
├── utils/
│   └── ellipsoidFit.ts                 # 椭球拟合算法
└── services/
    └── imu.ts                          # 含三个标定 API 方法
```

#### 组件层次

```
App.tsx
└── CalibrationWizard          # needsCalibration && connectedDevice 时全页接管
    ├── toolbar                # 步骤点 + 步骤标签 + 跳过按钮
    └── body
        ├── AccelStepContent   # step 0-5
        │   ├── CalibrationThreeView
        │   │   ├── SingleCalibrationView (isTarget)   # 目标方向
        │   │   └── SingleCalibrationView (!isTarget)  # 实时姿态
        │   └── CaptureBar
        ├── GyroStepContent    # step 6
        │   └── CaptureBar
        └── ResultStepContent  # step 7
            └── ValueCard × 3
```

#### 关键 Hook：`useCalibrationCapture`

```typescript
type CaptureState = 'idle' | 'capturing' | 'done';

// 返回值
{
  captureState: CaptureState;
  progress: number;               // 0 ~ 100
  capturedMean: [number, number, number] | null;
  startCapture: (type: 'accel' | 'gyro', durationMs: number) => void;
  resetCapture: () => void;
}
```

实现要点：

- 订阅独立的 `Channel<ResponseData>`，与主数据流并行，不影响图表渲染。
- 采集期间按采样时间戳判断是否在窗口内，窗口结束后取均值。
- `type = 'accel'` 时采集 `raw_data.accel_with_g`；`type = 'gyro'` 时采集 `raw_data.gyro`。

#### 实时姿态数据来源

`CalibrationWizard` 通过 `useBluetooth()` 获取 `dataHistory`，实时四元数读取路径为：

```typescript
// ✅ 正确：builtin.quat 由 provider 的 channel.onmessage 持续填充
const quat = dataHistory.builtin.quat;

// ❌ 错误：calculated.attitude 在 provider 中从未被写入，始终为空数组
// const quat = dataHistory.calculated.attitude;
```

`dataHistory.builtin.quat` 对应 `ResponseData.raw_data.quat`，是 IMU 固件直接输出的实时姿态四元数，由 `bluetooth-provider.tsx` 的 `channel.onmessage` 持续写入 `dataHistoryRef.current.builtin.quat.*`，并由 UI 刷新定时器（默认 33 ms）同步到 React state。

#### Three.js 双视图

- 复用 `useThreeBase` 渲染循环（`requestAnimationFrame`）。
- **目标视图**：从 6 个预定义四元数 `TARGET_QUATS[step]` 静态渲染，对应步骤的"朝上"面用绿色高亮材质。
- **实时视图**：通过 `liveQuatRef`（非 state，避免闭包问题）每帧同步最新四元数到 mesh。
- 两个视图分别独立实例化 `useThreeBase`，共享同一 SCSS 布局容器。

#### 标定 API（`src/services/imu.ts`）

```typescript
saveDeviceCalibration(
  deviceId: string,
  accelBias: [number, number, number],
  accelScale: [number, number, number],
  gyroBias: [number, number, number],
  qualityError: number
): Promise<IpcResponse<void>>

getDeviceCalibration(
  deviceId: string
): Promise<IpcResponse<DeviceCalibrationData | null>>

applyDeviceCalibration(
  deviceId: string
): Promise<IpcResponse<boolean>>  // true=找到并已应用, false=无记录
```

#### 全局状态扩展（`BluetoothContext`）

```typescript
// bluetooth-context.ts 新增字段
needsCalibration: boolean;
setNeedsCalibration: (v: boolean) => void;
```

连接成功后调用 `applyDeviceCalibration`，若返回 `false` 则 `setNeedsCalibration(true)`，触发 `App.tsx` 的全页接管渲染。

---

### 后端（Rust）

#### Tauri 命令

| 命令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `save_device_calibration` | `device_id`, `accel_bias[3]`, `accel_scale[3]`, `gyro_bias[3]`, `quality_error` | `Response<()>` | INSERT OR REPLACE，保存后热应用到 pipeline |
| `get_device_calibration` | `device_id` | `Response<Option<DeviceCalibrationData>>` | 查询指定设备标定记录 |
| `apply_device_calibration` | `device_id` | `Response<bool>` | 查询并应用到 pipeline；无记录返回 false |

#### Pipeline 应用逻辑

```rust
config.calibration = ImuCalibrationConfig {
    passby: false,
    accel_bias: DVec3::new(bias_x, bias_y, bias_z),
    gyro_bias:  DVec3::new(gyro_x, gyro_y, gyro_z),
    // 对角缩放：1/s_i
    accel_matrix: [
        [1.0 / sx, 0.0,       0.0      ],
        [0.0,      1.0 / sy,  0.0      ],
        [0.0,      0.0,       1.0 / sz ],
    ],
    gyro_matrix: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
};
```

#### 配置文件分离

引入 `ProcessorPipelineConfigFile` 结构体，用于 `processor.toml` 的读写，**不含** `calibration` 字段。运行时使用的 `ProcessorPipelineConfig` 保留 `calibration` 字段，由 SQLite 动态注入。两者通过 `From` trait 互转：

```rust
pub struct ProcessorPipelineConfigFile {
    pub global:     GlobalConfig,
    pub filter:     LowPassFilterConfig,
    pub trajectory: TrajectoryConfig,
    pub zupt:       ZuptConfig,
    // ⚠️ 无 calibration 字段
}
impl From<ProcessorPipelineConfigFile> for ProcessorPipelineConfig { ... }
impl From<ProcessorPipelineConfig>     for ProcessorPipelineConfigFile { ... }
```

---

## 数据库配置

### SQLite 表：`device_calibrations`

```sql
CREATE TABLE IF NOT EXISTS device_calibrations (
    device_id     TEXT    NOT NULL PRIMARY KEY,
    accel_bias_x  REAL    NOT NULL DEFAULT 0.0,
    accel_bias_y  REAL    NOT NULL DEFAULT 0.0,
    accel_bias_z  REAL    NOT NULL DEFAULT 0.0,
    accel_scale_x REAL    NOT NULL DEFAULT 1.0,
    accel_scale_y REAL    NOT NULL DEFAULT 1.0,
    accel_scale_z REAL    NOT NULL DEFAULT 1.0,
    gyro_bias_x   REAL    NOT NULL DEFAULT 0.0,
    gyro_bias_y   REAL    NOT NULL DEFAULT 0.0,
    gyro_bias_z   REAL    NOT NULL DEFAULT 0.0,
    created_at_ms INTEGER NOT NULL DEFAULT 0,
    quality_error REAL    NOT NULL DEFAULT 0.0
);
```

- 数据库文件路径：与录制数据共用 `imu_recordings.sqlite`，由 `recorder::db::recording_db_path()` 解析。
- 建表在 `ensure_schema()` 中执行，使用 `CREATE TABLE IF NOT EXISTS`，应用每次启动时幂等执行。
- 更新操作使用 SeaORM `OnConflict::column(DeviceId).update_columns([...])` 实现 `UPSERT`。

### `processor.toml` 变更

标定相关字段从配置文件中移除，仅保留：

```toml
[global]
# 全局开关

[filter]
# 低通滤波参数

[trajectory]
# 轨迹计算参数

[zupt]
# 零速修正参数

# ⚠️ [calibration] 段已删除，由 SQLite 管理
```

