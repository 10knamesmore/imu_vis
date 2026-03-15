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

### 安装依赖

```bash
pip install numpy pandas matplotlib
```

### 脚本位置

```
scripts/validate_trajectory.py
```

### 用法一：仅 IMU 分析（无视频真值）

适用于静置漂移、直线往返、矩形/圆形闭环等实验。

```bash
python scripts/validate_trajectory.py --imu exports/imu_session_1.csv
```

**输出内容**：

- 控制台打印：样本数、时长、**闭环误差**（终点距起点距离）、**漂移速率**（cm/s）
- 自动保存 `imu_trajectory.png`：XZ 俯视轨迹图 + 位移-时间曲线

### 用法二：与视频真值对比

适用于羽毛球拍挥拍验证实验。

```bash
python scripts/validate_trajectory.py \
  --imu exports/imu_session_3.csv \
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

### 实验一：静置漂移测试

**验证目标**：测量 IMU 完全静止时的位置漂移速率。

**操作步骤**：

1. IMU 固定在桌面，保持静置。
2. 在 IMU Vis 中开始录制，静置 **60 秒**后停止。
3. 导出 CSV，运行脚本：

```bash
python scripts/validate_trajectory.py --imu exports/imu_session_1.csv
```

**关注指标**：

- 漂移速率 < **0.083 cm/s**（即 60 s 漂移 < 5 cm）

---

### 实验二：直线往返测试

**验证目标**：验证直线位移测量精度和 ZUPT 效果。

**操作步骤**：

1. 在地面用卷尺标记 1 米的起点和终点。
2. IMU 从起点出发，沿直线运动到终点后**停顿 2 秒**，再返回起点停顿。
3. 导出 CSV，运行脚本查看轨迹和闭环误差。

**关注指标**：

- 峰值位移（脚本图表中曲线最高点）误差 < **10%**（即 > 0.9 m）
- 闭环误差 < **5 cm**

---

### 实验三：矩形轨迹闭环测试

**验证目标**：测试二维轨迹累积误差与形状保真度。

**操作步骤**：

1. 在地面贴胶带标记 **1 m × 0.5 m** 矩形。
2. 从某角落出发，沿矩形走一圈，每个角落**短暂停顿**（触发 ZUPT），回到起点停止。
3. 导出 CSV，运行脚本查看 XZ 俯视轨迹。

**关注指标**：

- 闭环误差 < **10 cm**
- XZ 俯视轨迹形状可辨认为矩形

---

### 实验四：圆形轨迹测试

**验证目标**：测试曲线轨迹的形状保真度。

**操作步骤**：

1. 在地面标记直径 **1 m** 的圆（可用绳子和粉笔辅助）。
2. 从起点出发，沿圆形轨迹匀速走一圈，回到起点停止。
3. 导出 CSV，运行脚本查看俯视轨迹，目视判断是否呈圆形。

**关注指标**：

- 闭环误差 < **10 cm**
- 俯视轨迹近似圆形，无明显顺/逆时针系统性偏转

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
python scripts/validate_trajectory.py \
  --imu exports/imu_session_3.csv \
  --video video_tracker.csv \
  --plane xz
```

**关注指标**：

| 指标 | 验收标准 |
|------|----------|
| RMSE | < **15 cm** |
| 最大偏差 | < **30 cm** |
| 闭环误差 | 动作结束后 < **10 cm** |

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
