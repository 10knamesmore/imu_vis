# IMU 轨迹处理架构说明

当前系统假定姿态四元数来自可信来源，不再进行二次姿态融合或扩展卡尔曼滤波。系统仅进行坐标变换与数值积分处理。

## 数据链路

`RawPacket -> parse -> calibrate -> filter -> trajectory -> zupt -> output`

## 核心原则

- 姿态直接使用原始 `quat` 与 `angle`
- 轨迹计算基于 `quat` 进行坐标变换
- 保留原始 `gyro` 与原始加速度输入
- 保留 `accel_nav` 输出链路
- 不引入额外姿态估计与状态预测模块
