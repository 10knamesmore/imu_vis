# IMU 轨迹准确性验证指南

本文档说明如何使用 IMU Vis 内置的 **CSV 导出功能**与配套的 **Python 离线分析脚本**，对 IMU 积分轨迹进行系统性准确性验证。

---

## 快速开始

```
录制数据  →  导出 CSV  →  运行分析脚本  →  查看报告
```

---

## 第一步：导出录制数据

### 操作步骤

1. 打开 IMU Vis，切换到**录制面板**（Recordings）。
2. 选择需要分析的会话，在**操作列**点击 **「导出 CSV」** 按钮。
3. 导出成功后，界面会弹出提示，显示文件路径，并附有 **「打开文件夹」** 快捷按钮。

### 导出文件位置

CSV 文件自动保存到项目根目录下的 `exports/` 文件夹：

```
imu_recordings.sqlite          ← 数据库（同级目录）
exports/
  imu_20260310_192503.csv      ← 按导出时间命名（UTC）
  imu_20260310_201145.csv
  ...
```

### CSV 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `timestamp_ms` | int | 采样时间戳（Unix 毫秒） |
| `calc_position_x` | float | 积分位置 X（米） |
| `calc_position_y` | float | 积分位置 Y（米，竖直方向） |
| `calc_position_z` | float | 积分位置 Z（米） |
| `calc_velocity_x` | float | 积分速度 X（米/秒） |
| `calc_velocity_y` | float | 积分速度 Y（米/秒） |
| `calc_velocity_z` | float | 积分速度 Z（米/秒） |
| `calc_attitude_w` | float | 姿态四元数 w |
| `calc_attitude_x` | float | 姿态四元数 x |
| `calc_attitude_y` | float | 姿态四元数 y |
| `calc_attitude_z` | float | 姿态四元数 z |

> **坐标系**：X/Z 构成水平面（俯视），Y 为竖直方向（向上为正）。

---

## 第二步：运行分析脚本

### 运行环境

`scripts/` 目录已配置 `uv` 项目（`pyproject.toml` + `uv.lock`），依赖已锁定，**无需手动安装**，使用 `uv run` 自动解析虚拟环境。

若首次使用需要安装 `uv`：

```bash
curl -Ls https://astral.sh/uv/install.sh | sh
```

### 脚本位置

```
scripts/validate_trajectory.py
scripts/gen_reference_trajectory.py
```

### 用法一：仅 IMU 分析（无视频真值）

适用于静置漂移、直线往返、矩形/圆形闭环等实验。

```bash
cd scripts
uv run validate_trajectory.py --imu ../exports/imu_session_1.csv
```

**输出内容**：

- 控制台打印：样本数、时长、**闭环误差**（终点距起点距离）、**漂移速率**（cm/s）
- 自动保存 `imu_trajectory.png`：XZ 俯视轨迹图 + 位移-时间曲线

### 用法二：与视频真值对比

适用于羽毛球拍挥拍验证实验。

```bash
cd scripts
uv run validate_trajectory.py \
  --imu ../exports/imu_session_3.csv \
  --video video_tracker.csv \
  --plane xz
```

**参数说明**：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--imu` | IMU 导出 CSV 路径 | 必填 |
| `--video` | 视频真值 CSV 路径 | 无（仅 IMU 模式） |
| `--plane` | IMU 投影平面：`xz`（俯视）/ `xy`（正视）/ `yz`（侧视） | `xz` |

**输出内容**：

- 控制台打印：RMSE、最大偏差、平均偏差（单位 cm）
- 自动保存 `trajectory_comparison.png`：轨迹叠加图 + 逐帧误差曲线 + 误差摘要

---

## 验证实验操作手册

> **关于参考轨迹生成**
>
> 实验一至四均可用 `scripts/gen_reference_trajectory.py` 生成理想参考轨迹 CSV，直接代入 `validate_trajectory.py --video` 进行定量对比，无需视频拍摄。脚本用法详见[参考轨迹生成](#参考轨迹生成)节。

---

### 实验一：静置漂移测试

**验证目标**：测量 IMU 完全静止时的位置漂移速率，是评估滤波器基线性能的最基本测试。

#### 准备材料

- IMU 设备 × 1
- 书本（2～3 本）或橡皮泥 × 适量（用于固定 IMU）
- 平稳桌面或地板（无振动）

#### 场地布置

1. 将 IMU 放置于平整桌面，**四周用书本夹紧**或用橡皮泥固定底部，使其无法滑动。
2. 确保桌面远离空调出风口、风扇、步行等振动源。
3. 将 USB/蓝牙接收器放置好，确保录制期间不会碰触 IMU。

#### 录制步骤

1. 打开 IMU Vis，连接设备后切换到**录制面板**，点击**开始录制**。
   - 此时应看到：状态栏显示"录制中"，采样计数每秒递增。
2. **静置 60 秒**，期间不要触碰桌子。
3. 点击**停止录制**，然后导出 CSV：在录制列表找到刚创建的会话，点击**导出 CSV**。
   - 此时应看到：弹出提示显示导出路径（如 `exports/imu_20260315_...csv`）。

#### 生成参考轨迹

```bash
cd scripts
uv run gen_reference_trajectory.py static --duration 60
# 输出：reference_static.csv（全零，60s，3000行）
```

#### 对比分析

```bash
cd scripts

# 方式 A：仅查看 IMU 漂移（无参考对比）
uv run validate_trajectory.py --imu ../exports/imu_session_1.csv

# 方式 B：与全零参考轨迹定量对比
uv run validate_trajectory.py \
  --imu ../exports/imu_session_1.csv \
  --video reference_static.csv \
  --plane xz
```

#### 结果判读

| 指标 | 正常 | 需关注 |
|------|------|--------|
| 漂移速率 | < **0.083 cm/s**（60 s 漂移 < 5 cm） | ≥ 0.083 cm/s 说明陀螺仪偏差未校准 |
| RMSE（方式 B） | < **3 cm** | ≥ 3 cm 建议重新运行校准向导 |
| XZ 轨迹图 | 点簇集中在原点附近，无方向性漂移 | 轨迹持续朝某方向漂移→轴对齐或偏差补偿问题 |

---

### 实验二：直线往返测试

**验证目标**：验证 ZUPT（零速更新）效果以及直线位移测量精度。

#### 准备材料

- IMU 设备 × 1（固定在鞋盒盖或小托盘上，保持水平）
- 卷尺或量尺 × 1
- 彩色胶带或粉笔 × 适量（标记起点和终点）

#### 场地布置

1. 选择**宽敞走廊或室内直线通道**，沿地板瓷砖缝方向（天然直线导向）铺设路线。
2. 用卷尺量出 **1 m** 距离，用胶带在地面贴十字标记**起点**和**终点**。
3. IMU 放置于鞋盒盖正中央，用橡皮泥固定，操作者双手托住鞋盒盖，保持水平匀速移动。

```
起点 ←────────── 1 m ──────────→ 终点
 ★                                  ★
（胶带十字）                  （胶带十字）
```

#### 录制步骤

1. 操作者站在起点，托稳 IMU，开始录制。
   - 此时应看到：录制状态变绿，计数递增。
2. **在起点静止 3 秒**（确保 ZUPT 触发，速度归零）。
3. 缓慢匀速推着 IMU 走到终点（约 5～8 s），到达终点后**再静止 3 秒**。
4. 原路匀速返回起点，到达后**再静止 3 秒**。
5. 停止录制，导出 CSV。

> **操作要点**：停顿时双脚不要挪动，托盘不能晃动；行进时脚步不要停顿。

#### 生成参考轨迹

```bash
cd scripts
uv run gen_reference_trajectory.py linear \
  --distance 1.0 --duration 15 --pause 3
# 输出：reference_linear.csv
# 实际时长 = 去程 + 停顿 + 回程 + 停顿
# 若录制时长不同，调整 --duration 与实际一致
```

#### 对比分析

```bash
cd scripts
uv run validate_trajectory.py \
  --imu ../exports/imu_session_2.csv \
  --video reference_linear.csv \
  --plane xz
```

#### 结果判读

| 指标 | 验收标准 | 异常现象 |
|------|----------|----------|
| 峰值位移（图表曲线最高点） | 0.90 m ～ 1.10 m | 偏低→ZUPT 阈值太宽，偏高→加速度计偏差 |
| 闭环误差 | < **5 cm** | ≥ 5 cm → 检查静止段速度是否归零 |
| RMSE（与参考对比） | < **8 cm** | 轨迹整体偏移→起点时间未对齐 |
| XZ 轨迹图 | 去程和回程几乎重叠在同一直线上 | 偏离直线→操作时 IMU 发生横向抖动 |

---

### 实验三：矩形轨迹闭环测试

**验证目标**：测试二维轨迹累积误差与形状保真度，验证转弯处的 ZUPT 效果。

#### 准备材料

- IMU 设备 × 1（固定在鞋盒盖）
- 彩色胶带（建议红色）× 约 4 m
- 卷尺 × 1
- 记号笔或十字贴 × 4（标记角落）

#### 场地布置

1. 在地板上贴出 **1 m × 0.5 m** 矩形，用卷尺确认尺寸精确。
2. 四角各贴一个十字标记（角点）。
3. 选取左下角为起点，顺时针方向行走（右→上→左→下）。

```
A ──────── 1.0 m ────────→ B
│                           │
0.5 m                    0.5 m
│                           │
D ←──────── 1.0 m ──────── C
↑ 起点
```

#### 录制步骤

1. IMU 放置于鞋盒盖，双手托稳，站在 A 点（起点），开始录制。
2. **在 A 点静止 3 秒**。
3. 推着 IMU 沿胶带边缘缓慢匀速走到 B 点，**静止 3 秒**。
4. 走到 C 点，**静止 3 秒**。
5. 走到 D 点，**静止 3 秒**。
6. 走回 A 点（起点），**静止 3 秒**。
7. 停止录制，导出 CSV。

> **操作要点**：转角时先停顿，再转向，确保 ZUPT 在转角处触发；行进时沿胶带内侧推行，脚步不要过大。

#### 生成参考轨迹

```bash
cd scripts
uv run gen_reference_trajectory.py rect \
  --width 1.0 --height 0.5 --pause 3
# 默认 duration=20s，若实际录制更长，请用 --duration <实际秒数>
# 实际秒数 = IMU CSV 末行 timestamp_ms 减首行 timestamp_ms，再除以 1000
```

#### 对比分析

```bash
cd scripts
uv run validate_trajectory.py \
  --imu ../exports/imu_session_3.csv \
  --video reference_rect.csv \
  --plane xz
```

#### 结果判读

| 指标 | 验收标准 | 异常现象 |
|------|----------|----------|
| 闭环误差 | < **10 cm** | ≥ 10 cm → 检查转角停顿是否足够 |
| RMSE（与参考对比） | < **12 cm** | 大偏差 → 行走速度不均匀或未对齐 duration |
| XZ 轨迹图 | 可辨认矩形，四边接近直线 | 形状歪斜 → IMU 安装未水平；圆角过大 → 转角停顿不足 |

---

### 实验四：圆形轨迹测试

**验证目标**：测试曲线轨迹的形状保真度，评估连续转向场景下的积分误差。

#### 准备材料

- IMU 设备 × 1（固定在鞋盒盖）
- 细绳 × 1 m（一端固定圆心，另一端引导圆弧）
- 粉笔或胶带 × 适量
- 卷尺 × 1

#### 场地布置

1. 选择地面平整区域，用粉笔标记**圆心**，绳子一端固定在圆心（可用胶带贴住）。
2. 用绳子另一端引导，画出**半径 0.5 m** 的圆（直径 1 m），用粉笔或胶带标出圆周。
3. 在圆圈正东方（0° 位置）标记起点。

```
       ┌──────┐
      /        \
     │    +     │   半径 0.5 m
      \        /    起点 →●（正东方）
       └──────┘
```

#### 录制步骤

1. IMU 放置于鞋盒盖，站在起点，开始录制。
2. **在起点静止 3 秒**，然后缓慢沿圆圈内侧逆时针匀速推行。
   - 行进节奏：走约 10 步完成一圈（约 10 s），不要抬脚走，保持鞋底轻微摩擦地面（有助于 ZUPT 触发）。
3. 回到起点后**静止 3 秒**，停止录制，导出 CSV。

> **操作要点**：匀速非常重要，忽快忽慢会导致 ZUPT 误触发；小碎步优于大步迈进。

#### 生成参考轨迹

```bash
cd scripts
uv run gen_reference_trajectory.py circle \
  --radius 0.5 --duration 10
# 若实际录制时长不同，调整 --duration
```

#### 对比分析

```bash
cd scripts
uv run validate_trajectory.py \
  --imu ../exports/imu_session_4.csv \
  --video reference_circle.csv \
  --plane xz
```

#### 结果判读

| 指标 | 验收标准 | 异常现象 |
|------|----------|----------|
| 闭环误差 | < **10 cm** | ≥ 10 cm → 检查步速是否均匀 |
| RMSE（与参考对比） | < **15 cm** | 偏大 → 圆弧扭曲，检查 IMU 安装方向 |
| XZ 轨迹图 | 近似圆形，无明显顺/逆时针系统性偏转 | 螺旋形 → 速度计算漂移；椭圆形 → 行走时发生了椭圆实际路径 |

---

### 实验五：羽毛球拍挥拍验证（含视频真值）

**验证目标**：将 IMU 轨迹与高速视频追踪结果定量对比。

#### 5.1 录制准备

- 手机固定在**正前方**，240 fps 慢动作模式。
- 在拍柄末端贴一块**彩色反光贴纸**作为视觉标记。
- IMU 固定在反光贴纸旁边（偏移 < 5 cm）。

#### 5.2 时间同步

录制开始时，将球拍在摄像机前**用力顿击桌面一次**，产生：

- 视频中可见的冲击帧（标记视觉 t=0）
- IMU 数据中的加速度尖峰（标记 IMU t=0）

分析时，手动裁剪两个 CSV，使起点均对齐到冲击事件后的第一帧。

#### 5.3 用 Tracker 软件获取视频真值

1. [下载 Tracker](https://physlets.org/tracker/)（免费，物理教育软件）。
2. 导入慢动作视频，用**已知长度**（球拍拍框长约 68 cm，或画面中的卷尺）设置参考尺度。
3. 在反光贴纸处逐帧手动点击追踪。
4. 导出表格（File → Export → Data File），包含 `frame`、`x`（m）、`y`（m）列。

#### 5.4 转换 Tracker CSV 格式

Tracker 导出格式为 `frame, x, y`，需转换为脚本所需的 `time_ms, x_m, y_m`：

```python
import pandas as pd

FPS = 240  # 慢动作帧率

df = pd.read_csv('tracker_raw.csv', comment='%', skipinitialspace=True)
df = df.rename(columns={'t': 'time_ms', 'x': 'x_m', 'y': 'y_m'})
# 若 Tracker 导出的是时间（秒），换算为毫秒：
df['time_ms'] = (df['time_ms'] * 1000).round().astype(int)
# 若导出的是帧号，换算为毫秒：
# df['time_ms'] = (df['frame'] / FPS * 1000).round().astype(int)
df[['time_ms', 'x_m', 'y_m']].to_csv('video_tracker.csv', index=False)
```

#### 5.5 运行对比分析

```bash
# 正视图（手机正对球拍挥动平面）→ 用 xz 平面对应水平+垂直
cd scripts
uv run validate_trajectory.py \
  --imu ../exports/imu_session_3.csv \
  --video ../video_tracker.csv \
  --plane xz
```

**关注指标**：

| 指标 | 验收标准 |
|------|----------|
| RMSE | < **15 cm** |
| 最大偏差 | < **30 cm** |
| 闭环误差 | 动作结束后 < **10 cm** |

---

## 参考轨迹生成

`scripts/gen_reference_trajectory.py` 可为实验一至四生成理想参考轨迹 CSV，直接传入 `--video` 参数进行定量对比，无需视频拍摄。

### 运行环境

依赖由 `scripts/pyproject.toml` 管理（含 numpy、pandas、matplotlib），使用 `uv run` 自动激活，无需手动安装。

### 各实验命令速查

| 实验 | 命令 |
|------|------|
| 静置漂移 | `uv run gen_reference_trajectory.py static --duration 60` |
| 直线往返 | `uv run gen_reference_trajectory.py linear --distance 1.0 --duration 15 --pause 3` |
| 矩形闭环 | `uv run gen_reference_trajectory.py rect --width 1.0 --height 0.5 --pause 3` |
| 圆形 | `uv run gen_reference_trajectory.py circle --radius 0.5 --duration 10` |
| 8 字形 | `uv run gen_reference_trajectory.py figure8 --radius 0.5 --duration 20 --pause 2` |

### 参数说明

| 参数 | 适用 | 说明 | 默认值 |
|------|------|------|--------|
| `--duration` | 全部 | 总时长（秒） | 60 |
| `--distance` | linear | 往返距离（米） | 1.0 |
| `--pause` | linear / rect / figure8 | 停顿时长（秒） | 3.0 |
| `--width` | rect | 矩形宽度（米） | 1.0 |
| `--height` | rect | 矩形高度（米） | 0.5 |
| `--radius` | circle / figure8 | 半径（米） | 0.5 |
| `--output` | 全部 | 指定输出文件路径 | `reference_<实验名>.csv` |

> **注意**：生成的 CSV 时长由采样率（50 Hz）和点数决定，与输入的 `--duration` 近似但不完全相等（整数截断）。与 IMU 数据对比时，两条轨迹各自从 t=0 开始对齐，时长无需完全一致（脚本会插值到较短轨迹的时间范围内）。

---

## 视频真值 CSV 格式参考

脚本的 `--video` 参数要求 CSV 包含以下三列（列名严格匹配）：

| 列名 | 类型 | 说明 |
|------|------|------|
| `time_ms` | int | 时间戳（毫秒），起点可为任意值 |
| `x_m` | float | 水平位置（米） |
| `y_m` | float | 垂直位置（米） |

示例：

```csv
time_ms,x_m,y_m
0,0.000,0.000
4,0.003,0.001
8,0.011,0.004
...
```

---

## 常见问题

**Q：导出的 CSV 文件在哪里？**
A：在项目根目录的 `exports/` 文件夹，文件名为 `imu_session_<ID>.csv`。点击"导出 CSV"成功后的提示消息中也会显示完整路径，点击「打开文件夹」可直接定位。

**Q：脚本报错"缺少列"怎么办？**
A：检查 CSV 的列名是否与脚本期望的列名一致（IMU CSV 由应用自动生成，格式固定；视频 CSV 需手动保证列名为 `time_ms, x_m, y_m`）。

**Q：轨迹图显示后脚本卡住了？**
A：关闭 matplotlib 弹出的图表窗口即可继续。图片文件（`.png`）已在关闭前保存。

**Q：闭环误差很大，是哪里出了问题？**
A：常见原因：ZUPT 阈值过高（静止时速度未归零）、加速度计标定偏差、行进过快导致重力补偿误差。可检查速度通道数据，观察静止段速度是否收敛到零附近。
