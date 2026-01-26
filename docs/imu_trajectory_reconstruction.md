## IMU 轨迹重建改进方案（后端参考）

本文档给出常见 IMU 轨迹重建算法与公式，解决当前两点问题：

1. 姿态直接使用 IMU 原始输出；2) 轨迹仅做积分，缺少滤波与预处理。

---

### 1. 预处理与标定（必做）

原始测量：

- 陀螺仪：w_m = w_true + b_g + n_g
- 加速度计：a_m = a_true + b_a + n_a

标定模型（比例因子+非正交）：

- w_cal = M_g \* (w_m - b_g)
- a_cal = M_a \* (a_m - b_a)
  其中 M_g, M_a 为 3x3 标定矩阵。

偏置估计：
若设备静止 N 帧，可估计：

- b_g = mean(w_m)
- b_a = mean(a_m) - g \* g_hat
  其中 g_hat 为重力方向（见姿态初始化）。

滤波（简单低通即可）：

- a*lp[k] = alpha * a*lp[k-1] + (1-alpha) * a_cal[k]
- w*lp[k] = alpha * w*lp[k-1] + (1-alpha) * w_cal[k]
  alpha 常用 0.7~0.98，随采样率和噪声调整。

---

### 2. 姿态估计（替换原始 IMU 姿态）

#### 方案 A：互补滤波（简单高效）

姿态用四元数 q（机体系 -> 世界系）。
陀螺积分：

- q*dot = 0.5 * Omega(w*lp) * q
  其中 Omega(w) =
  [ 0 -w_x -w_y -w_z
  w_x 0 w_z -w_y
  w_y -w_z 0 w_x
  w_z w_y -w_x 0 ]

离散更新：

- q_gyro = q + q_dot \* dt
- q_gyro = normalize(q_gyro)

由加速度估计重力方向：

- a_norm = a_lp / ||a_lp||
- g_body = a_norm
- g_world = [0, 0, -1]
  构造修正四元数 q_acc，使 g_body 旋转到 g_world：
  v = g_body x g_world
  s = sqrt((1 + dot(g_body, g_world)) \* 2)
  q_acc = [s/2, v_x/s, v_y/s, v_z/s]

融合：

- q = normalize( slerp(q_gyro, q_acc \* q_gyro, beta) )
  beta 取小值（如 0.01~0.05）。

若有磁力计，可加入航向（yaw）校正。

#### 方案 B：Mahony 或 Madgwick（行业常用）

Madgwick（无磁力计）：

- q*dot = 0.5 * Omega(w*lp) * q - beta \* grad_f(q, a_norm)
  其中 grad_f 为对齐重力的目标函数梯度。

Mahony：

- e = (a_norm x g_est_body)
- w*corr = w_lp + k_p * e + k*i * integral(e)
- 用 w_corr 进行积分更新 q

两者都有成熟公式，稳定易实现。

---

### 3. 捷联惯导（速度/位置传播）

有姿态 q 后，将机体系加速度转到世界系：

- R = quat_to_rotmat(q)
- a_world = R \* a_cal

去重力：

- a_lin = a_world - g_world \* g
  其中 g = 9.80665，g_world = [0, 0, -1]

积分：

- v*k = v*{k-1} + a_lin \* dt
- p*k = p*{k-1} + v_k \* dt

这是一套基础 INS，若无修正会快速漂移。

---

### 4. 漂移抑制：ZUPT 与静止检测

ZUPT（零速更新）对行人/短时运动非常有效。

静止检测：

- S = ||w_lp|| < w_thresh AND ||a_lp - g_world\*g|| < a_thresh
  典型：w_thresh ~ 0.05-0.2 rad/s，a_thresh ~ 0.1-0.3 m/s^2。

若 S 为真：

- v_k = 0
- 可估计加计偏置：b_a += k_b \* a_lin

可显著抑制速度漂移。

---

### 5. 误差状态 EKF（推荐）

状态（典型 15 维）：

- x = [p(3), v(3), q(4), b_g(3), b_a(3)]（或用姿态误差 3 维）

名义传播：

- dot(p) = v
- dot(v) = R\*(a_m - b_a - n_a) + g_world
- dot(q) = 0.5 _ Omega(w_m - b_g - n_g) _ q
- dot(b_g) = n_bg, dot(b_a) = n_ba

误差状态：

- delta_x = [delta_p, delta_v, delta_theta, delta_b_g, delta_b_a]

线性化：

- dot(delta_p) = delta_v
- dot(delta*v) = -R * [a_m - b_a]\_x \_ delta_theta - R \* delta_b_a
- dot(delta_theta) = -[w_m - b_g]\_x \* delta_theta - delta_b_g
- dot(delta_b_g) = n_bg
- dot(delta_b_a) = n_ba

其中 [v]\_x 为反对称矩阵：
[ 0 -v_z v_y
v_z 0 -v_x
-v_y v_x 0 ]

离散传播：

- P = F _ P _ F^T + Q
  常用一阶离散或矩阵指数近似。

量测更新（示例）：

1. ZUPT：z = v = 0
   H = [0 I 0 0 0]
2. 位置/高度约束（可选）

更新：

- K = P _ H^T _ (H _ P _ H^T + R)^-1
- delta*x = K * (z - H \_ x)

修正：

- p += delta_p
- v += delta_v
- q = q \* exp(delta_theta/2)
- b_g += delta_b_g
- b_a += delta_b_a

这是工业级 INS 的标准做法。

---

### 6. Rust 实现建议

建议处理流程（每帧）：

1. 读原始 IMU。
2. 标定：去偏 + 矩阵校正。
3. 低通滤波（可选）。
4. 姿态更新（Mahony/Madgwick 或互补）。
5. 计算世界系加速度，去重力。
6. INS 传播（v, p）。
7. 静止检测 + ZUPT（及 EKF 更新）。
8. 输出姿态与位置。

数据结构：

- Quaternion（归一化、乘法、旋转向量）。
- 3x3/向量运算（可复用 `src-tauri/crates/math_f64`）。
- EKF 状态（P/Q/R 矩阵）。

---

### 7. 推荐方案（简明选择）

简单可用：

- Mahony 姿态融合。
- 静止检测 + ZUPT。
- 加速度低通。

效果更稳健：

- 误差状态 EKF + ZUPT。
- 可选磁力计航向校正。

---

### 8. 关键词（用于检索公式）

- "Madgwick filter equations"
- "Mahony filter IMU"
- "INS error-state EKF ZUPT"
- "strapdown inertial navigation mechanization"

---

## 9. Rust 模块设计建议（输入/输出/数据类型/上下游）

以下设计以当前 `src-tauri/src/processor/` 为主轴，保持单线程时序处理，
通过 `flume::Receiver/ Sender` 进行上下游通信。

### 9.1 数据结构（类型建议）

1. 原始包与解析结果

- `RawPacket` (Vec<u8>)
- `ImuSampleRaw`
  - `timestamp_ms: u64`
  - `accel_with_g: DVec3`
  - `gyro: DVec3` (rad/s)
  - `quat_raw: DQuat` (如果设备给)
  - `angle_raw: DVec3`
  - `accel_nav: DVec3` (若订阅)

2. 标定与滤波后

- `ImuSampleCalibrated`
  - `timestamp_ms: u64`
  - `accel: DVec3`
  - `gyro: DVec3`
  - `bias_g: DVec3`
  - `bias_a: DVec3`
- `ImuSampleFiltered`
  - `timestamp_ms: u64`
  - `accel_lp: DVec3`
  - `gyro_lp: DVec3`

3. 姿态与导航状态

- `AttitudeEstimate`
  - `timestamp_ms: u64`
  - `quat: DQuat`
  - `euler: DVec3` (可选)
- `NavState`
  - `timestamp_ms: u64`
  - `position: DVec3`
  - `velocity: DVec3`
  - `attitude: DQuat`
  - `bias_g: DVec3`
  - `bias_a: DVec3`

4. EKF 误差状态（可选）

- `ErrorState`
  - `delta_p: DVec3`
  - `delta_v: DVec3`
  - `delta_theta: DVec3`
  - `delta_b_g: DVec3`
  - `delta_b_a: DVec3`
- `Covariance` (P, Q, R 矩阵)

### 9.2 模块划分与职责

1. `processor::parser`

- 输入：`RawPacket`
- 输出：`ImuSampleRaw`
- 上游：`imu::client`（蓝牙流）
- 下游：`processor::calibration`（新模块）
- 通信：`flume::Receiver<Vec<u8>> -> ImuSampleRaw`（同线程内可直接调用）

2. `processor::calibration`（新增）

- 输入：`ImuSampleRaw`
- 输出：`ImuSampleCalibrated`
- 功能：去偏置、标定矩阵、单位统一（deg/s -> rad/s）
- 额外：支持姿态零位校准（前端触发，使用最新原始样本）
- 上游：parser
- 下游：`processor::filter`
- 通信：函数调用或内部管线结构

3. `processor::filter`（新增）

- 输入：`ImuSampleCalibrated`
- 输出：`ImuSampleFiltered`
- 功能：低通滤波、异常值抑制
- 上游：calibration
- 下游：`processor::attitude_fusion`

4. `processor::attitude_fusion`（新增）

- 输入：`ImuSampleFiltered`
- 输出：`AttitudeEstimate`
- 功能：Mahony/Madgwick/互补滤波
- 上游：filter
- 下游：`processor::strapdown`

5. `processor::strapdown`（新增）

- 输入：`AttitudeEstimate` + `ImuSampleFiltered`
- 输出：`NavState`（含 v,p）
- 功能：旋转到世界系、去重力、速度/位置积分
- 上游：attitude_fusion
- 下游：`processor::zupt` 或 `processor::ekf`

6. `processor::zupt`（新增）

- 输入：`NavState` + `ImuSampleFiltered`
- 输出：`NavState`（修正后）
- 功能：静止检测、速度清零、偏置回归
- 上游：strapdown
- 下游：`processor::ekf` 或直接输出

7. `processor::ekf`（新增，可选）

- 输入：`NavState` + `ImuSampleFiltered` + `ZuptObservation`
- 输出：`NavState`（纠正后）
- 功能：误差状态 EKF 传播与更新
- 上游：zupt/strapdown
- 下游：`processor::output`

8. `processor::output`（已有响应结构）

- 输入：`NavState` + `ImuSampleRaw`（用于 UI 展示原始数据）
- 输出：`ResponseData`
- 上游：ekf/zupt
- 下游：`AppState` 与 `recorder`
- 通信：`flume::Sender<ResponseData>`

### 9.3 上下游连接方式（建议）

单线程处理链（推荐，与现有线程模型一致）：
`RawPacket -> parse -> calibrate -> filter -> attitude_fusion -> strapdown -> zupt -> ekf -> ResponseData`

跨线程通信：

- `imu::client` 使用 `flume::Sender<Vec<u8>>` 推送原始包
- `processor::Processor` 内部线程消费，计算后使用
  `flume::Sender<ResponseData>` 发给 `AppState` 和 `recorder`
- 前端校准命令通过独立控制通道送入 `processor` 线程处理

模块内通信建议使用纯函数/struct 方法，避免跨线程频繁拷贝。

### 9.4 与现有代码的映射

当前 `State::update()` 可拆分为：

- `AttitudeFusion::update(sample_filtered) -> AttitudeEstimate`
- `Strapdown::update(att, sample_filtered) -> NavState`
- `Zupt::update(nav, sample_filtered) -> NavState`
- `Ekf::update(nav, obs) -> NavState`

最终由 `ResponseData::from_parts()` 统一输出。

---

## 10. 具体文件结构建议（逻辑与类型分离，每模块用文件夹）

目标：每个模块是一个文件夹，类型与逻辑分开放；所有模块通过各自 `mod.rs` 统一导出。
以下路径均位于 `src-tauri/src/processor/` 下。

```
processor/
  mod.rs
  pipeline/
    mod.rs
    types.rs
    pipeline.rs
  parser/
    mod.rs
    types.rs
    parser.rs
  calibration/
    mod.rs
    types.rs
    calibration.rs
  filter/
    mod.rs
    types.rs
    filter.rs
  attitude_fusion/
    mod.rs
    types.rs
    mahony.rs
    madgwick.rs
  strapdown/
    mod.rs
    types.rs
    strapdown.rs
  zupt/
    mod.rs
    types.rs
    zupt.rs
  ekf/
    mod.rs
    types.rs
    ekf.rs
  output/
    mod.rs
    types.rs
    output.rs
  shared/
    mod.rs
    types.rs
```

### 10.1 `processor/shared/`

- 放跨模块共享的基础类型与数学别名，避免循环依赖。
- `types.rs` 示例：
  - `pub type TimestampMs = u64`
  - `pub type ImuVec3 = DVec3`
  - `pub type ImuQuat = DQuat`

### 10.2 `processor/parser/`

- `types.rs`：`ImuSampleRaw` 等原始样本类型。
- `parser.rs`：`ImuParser` 解析逻辑。
- `mod.rs`：统一导出类型与解析器。

### 10.3 `processor/calibration/`

- `types.rs`：`ImuSampleCalibrated`、`ImuCalibrationConfig`、`CalibrationState`。
- `calibration.rs`：`Calibration::update` 逻辑。
- `mod.rs`：统一导出。

### 10.4 `processor/filter/`

- `types.rs`：`ImuSampleFiltered`、`LowPassFilterConfig`。
- `filter.rs`：`LowPassFilter::apply`。
- `mod.rs`：统一导出。

### 10.5 `processor/attitude_fusion/`

- `types.rs`：`AttitudeEstimate`、`AttitudeFusionConfig`。
- `mahony.rs`/`madgwick.rs`：各自的融合逻辑。
- `mod.rs`：选择实现并导出（可通过 feature 或 config）。

### 10.6 `processor/strapdown/`

- `types.rs`：`NavState`、`StrapdownConfig`。
- `strapdown.rs`：`Strapdown::propagate`。
- `mod.rs`：统一导出。

### 10.7 `processor/zupt/`

- `types.rs`：`ZuptConfig`、`ZuptObservation`。
- `zupt.rs`：`ZuptDetector::apply`。
- `mod.rs`：统一导出。

### 10.8 `processor/ekf/`

- `types.rs`：`EkfConfig`、`ErrorState`、`EkfState`（P/Q/R）。
- `ekf.rs`：传播与更新逻辑。
- `mod.rs`：统一导出。

### 10.9 `processor/output/`

- `types.rs`：`OutputFrame` 或 `ResponseData` 组合结构。
- `output.rs`：`OutputBuilder::build`。
- `mod.rs`：统一导出。

### 10.10 `processor/pipeline/`

- `types.rs`：`ProcessorPipelineConfig`。
- `pipeline.rs`：`ProcessorPipeline::process_packet`。
- `mod.rs`：统一导出。

### 10.11 `processor/mod.rs`

- 统一 re-export 各模块。
- `Processor` 保持当前线程模型，内部持有 `ProcessorPipeline`。

---

## 11. tracing 要求（写代码时必须带）

关键路径使用 `tracing` 记录，便于调试：

1. 解析与校验失败：

- `tracing::warn!` 或 `tracing::error!`

2. 关键状态变化：

- 进入/退出静止状态
- ZUPT 触发与速度归零
- EKF 更新执行（含创新量、协方差对角线简化日志）

3. 性能与节流：

- 不要在可能每帧调用的函数内打日志（250Hz）
