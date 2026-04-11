//! ESKF 预测步骤：状态转移矩阵 F、过程噪声 Q 和协方差传播。
//!
//! # 数学推导
//!
//! ## 误差状态动力学
//!
//! 15 维误差向量为 δx = [δθ, δv, δp, δb_g, δb_a]ᵀ，其中：
//! - δθ (0..3)：姿态误差（旋转向量，rad）
//! - δv (3..6)：速度误差 (m/s)
//! - δp (6..9)：位置误差 (m)
//! - δb_g (9..12)：陀螺仪偏差误差 (rad/s)
//! - δb_a (12..15)：加速度计偏差误差 (m/s²)
//!
//! 连续时间误差动力学为：
//!
//! ```text
//! δθ̇   = -δb_g                           (陀螺仪偏差驱动姿态误差)
//! δv̇   = -[a_world×] δθ  - R δb_a        (姿态误差 + 加速度计偏差驱动速度误差)
//! δṗ   = δv                               (速度误差驱动位置误差)
//! δḃ_g = w_bg                             (随机游走)
//! δḃ_a = w_ba                             (随机游走)
//! ```
//!
//! 其中：
//! - `a_world` 是世界坐标系下的线性加速度（移除重力后）
//! - `R` 是从机体系到世界系的旋转矩阵（由名义姿态四元数得到）
//! - `[a_world×]` 是 `a_world` 的反对称（叉乘）矩阵
//! - `w_bg`、`w_ba` 是驱动偏差随机游走的零均值白噪声
//!
//! ## 状态转移矩阵 F
//!
//! 连续时间 Jacobian Fx 是一个 15x15 分块矩阵：
//!
//! ```text
//!         δθ        δv       δp      δb_g     δb_a
//! δθ  [   0    |    0   |   0   |   -I₃   |    0   ]
//! δv  [-[a×]   |    0   |   0   |    0    |   -R   ]
//! δp  [   0    |   I₃   |   0   |    0    |    0   ]
//! δb_g[   0    |    0   |   0   |    0    |    0   ]
//! δb_a[   0    |    0   |   0   |    0    |    0   ]
//! ```
//!
//! 离散时间状态转移矩阵通过一阶近似得到（对较小 dt 足够）：
//!
//! ```text
//! F = I₁₅ + Fx * dt
//! ```
//!
//! 这意味着：
//! - `F[0..3, 9..12]  = -I₃ * dt`（陀螺仪偏差 → 姿态误差）
//! - `F[3..6, 0..3]   = -[a_world×] * dt`（姿态误差 → 速度误差）
//! - `F[3..6, 12..15] = -R * dt`（加速度计偏差 → 速度误差）
//! - `F[6..9, 3..6]   = I₃ * dt`（速度 → 位置）
//! - 所有对角块保持 I₃（来自单位矩阵）
//! - 所有其他非对角块保持 0
//!
//! ## 过程噪声协方差 Q
//!
//! 过程噪声建模为：
//!
//! ```text
//! Q = diag(σ²_gyro * dt, σ²_accel * dt, σ²_pos * dt, σ²_bg * dt, σ²_ba * dt)
//! ```
//!
//! 其中每个 σ² 都是 [`EskfConfig`] 中对应噪声谱密度参数的平方，`dt` 用于将连续时间功率谱密度
//! 转换为离散时间方差。

use math_f64::{DMat3, DQuat, DVec3};

use super::matrix::Mat15;
use crate::processor::navigator::types::EskfConfig;

/// 构建离散时间状态转移矩阵 F（15x15）。
///
/// 实现 `F = I₁₅ + Fx * dt`，其中 Fx 是连续时间误差状态 Jacobian。
/// 完整推导见模块级文档。
///
/// # 参数
///
/// * `attitude` - 当前名义姿态四元数（机体系 → 世界系）
/// * `accel_world` - 移除重力后的世界系线性加速度 (m/s²)
/// * `dt` - 时间步长（秒）
///
/// # 返回
///
/// 15x15 状态转移矩阵 F。
pub fn build_f_matrix(attitude: DQuat, accel_world: DVec3, dt: f64) -> Mat15 {
    let mut f = Mat15::identity();

    // F[0..3, 9..12] = -I₃ * dt（陀螺仪偏差 → 姿态误差）
    // δθ̇ = -δb_g  →  离散形式：δθ(k+1) += -I₃ * dt * δb_g(k)
    for i in 0..3 {
        f.set(i, 9 + i, -dt);
    }

    // F[3..6, 0..3] = -[a_world×] * dt（姿态误差 → 速度误差）
    // δv̇ = -[a_world×] δθ  →  加速度的叉乘矩阵
    let skew_a = DMat3::skew(accel_world);
    for i in 0..3 {
        for j in 0..3 {
            f.set(3 + i, j, -skew_a.get(i, j) * dt);
        }
    }

    // F[3..6, 12..15] = -R * dt（加速度计偏差 → 速度误差）
    // δv̇ = -R δb_a  →  旋转矩阵将偏差从机体系转换到世界系
    let r = quat_to_rotation_matrix(attitude);
    for i in 0..3 {
        for j in 0..3 {
            f.set(3 + i, 12 + j, -r.get(i, j) * dt);
        }
    }

    // F[6..9, 3..6] = I₃ * dt（速度 → 位置）
    // δṗ = δv  →  离散形式：δp(k+1) += I₃ * dt * δv(k)
    for i in 0..3 {
        f.set(6 + i, 3 + i, dt);
    }

    f
}

/// 构建离散时间过程噪声协方差矩阵 Q（15x15，对角矩阵）。
///
/// 每个对角块对应配置中连续时间噪声谱密度在一个时间步长 `dt` 内累积的方差。
///
/// ```text
/// Q = diag(
///     σ²_gyro * dt * [1,1,1],     // 姿态过程噪声 (0..3)
///     σ²_accel * dt * [1,1,1],    // 速度过程噪声 (3..6)
///     σ²_pos * dt * [1,1,1],      // 位置过程噪声 (6..9)
///     σ²_bg_walk * dt * [1,1,1],  // 陀螺仪偏差随机游走 (9..12)
///     σ²_ba_walk * dt * [1,1,1],  // 加速度计偏差随机游走 (12..15)
/// )
/// ```
///
/// # 参数
///
/// * `config` - ESKF 噪声参数
/// * `dt` - 时间步长（秒）
pub fn build_q_matrix(config: &EskfConfig, dt: f64) -> Mat15 {
    let mut diag = [0.0; 15];

    let q_gyro = config.gyro_noise * config.gyro_noise * dt;
    let q_accel = config.accel_noise * config.accel_noise * dt;
    let q_pos = config.pos_noise * config.pos_noise * dt;
    let q_bg = config.gyro_bias_walk * config.gyro_bias_walk * dt;
    let q_ba = config.accel_bias_walk * config.accel_bias_walk * dt;

    // 姿态误差 (0..3)
    diag[0] = q_gyro;
    diag[1] = q_gyro;
    diag[2] = q_gyro;

    // 速度误差 (3..6)
    diag[3] = q_accel;
    diag[4] = q_accel;
    diag[5] = q_accel;

    // 位置误差 (6..9)
    diag[6] = q_pos;
    diag[7] = q_pos;
    diag[8] = q_pos;

    // 陀螺仪偏差随机游走 (9..12)
    diag[9] = q_bg;
    diag[10] = q_bg;
    diag[11] = q_bg;

    // 加速度计偏差随机游走 (12..15)
    diag[12] = q_ba;
    diag[13] = q_ba;
    diag[14] = q_ba;

    Mat15::from_diagonal(&diag)
}

/// 传播误差状态协方差：`P = F * P * Fᵀ + Q`。
///
/// 这是标准离散时间 Kalman 滤波器的协方差预测步骤。状态转移矩阵 F 编码误差在一个时间步内
/// 如何传播，Q 则加入该时间步内累积的过程噪声。
///
/// # 参数
///
/// * `p` - 当前协方差矩阵（15x15，对称半正定）
/// * `f` - 来自 [`build_f_matrix`] 的状态转移矩阵
/// * `q` - 来自 [`build_q_matrix`] 的过程噪声矩阵
///
/// # 返回
///
/// 传播后的协方差矩阵。
pub fn propagate_covariance(p: &Mat15, f: &Mat15, q: &Mat15) -> Mat15 {
    // P_new = F * P * F^T + Q
    let fp = f.mul(p);
    let ft = f.transpose();
    let fpft = fp.mul(&ft);
    fpft.add(q)
}

/// 将单位四元数转换为 3x3 旋转矩阵（机体系 → 世界系）。
///
/// 使用标准四元数到方向余弦矩阵公式。这里假设四元数为单位长度（出于性能考虑不显式归一化）。
fn quat_to_rotation_matrix(q: DQuat) -> DMat3 {
    let x = q.x;
    let y = q.y;
    let z = q.z;
    let w = q.w;

    let xx = x * x;
    let yy = y * y;
    let zz = z * z;
    let xy = x * y;
    let xz = x * z;
    let yz = y * z;
    let wx = w * x;
    let wy = w * y;
    let wz = w * z;

    DMat3::new(
        1.0 - 2.0 * (yy + zz),
        2.0 * (xy - wz),
        2.0 * (xz + wy),
        2.0 * (xy + wz),
        1.0 - 2.0 * (xx + zz),
        2.0 * (yz - wx),
        2.0 * (xz - wy),
        2.0 * (yz + wx),
        1.0 - 2.0 * (xx + yy),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use math_f64::DQuat;

    #[test]
    fn f_matrix_identity_at_zero_dt() {
        let f = build_f_matrix(DQuat::IDENTITY, DVec3::ZERO, 0.0);
        for i in 0..15 {
            for j in 0..15 {
                let expected = if i == j { 1.0 } else { 0.0 };
                assert!(
                    (f.get(i, j) - expected).abs() < 1e-12,
                    "F at dt=0 should be identity, got ({},{})={}",
                    i, j, f.get(i, j)
                );
            }
        }
    }

    #[test]
    fn f_matrix_gyro_bias_block() {
        let dt = 0.01;
        let f = build_f_matrix(DQuat::IDENTITY, DVec3::ZERO, dt);
        // F[0,9]、F[1,10]、F[2,11] 应为 -dt。
        for i in 0..3 {
            assert!(
                (f.get(i, 9 + i) - (-dt)).abs() < 1e-12,
                "gyro bias block F[{},{}] = {}, expected {}",
                i, 9 + i, f.get(i, 9 + i), -dt
            );
        }
    }

    #[test]
    fn f_matrix_velocity_position_block() {
        let dt = 0.02;
        let f = build_f_matrix(DQuat::IDENTITY, DVec3::ZERO, dt);
        // F[6,3]、F[7,4]、F[8,5] 应为 dt。
        for i in 0..3 {
            assert!(
                (f.get(6 + i, 3 + i) - dt).abs() < 1e-12,
                "vel->pos block F[{},{}] = {}, expected {}",
                6 + i, 3 + i, f.get(6 + i, 3 + i), dt
            );
        }
    }

    #[test]
    fn q_matrix_is_diagonal_and_positive() {
        let config = EskfConfig::default();
        let q = build_q_matrix(&config, 0.01);
        for i in 0..15 {
            assert!(q.get(i, i) > 0.0, "Q diagonal [{}] should be positive", i);
            for j in 0..15 {
                if i != j {
                    assert!(
                        q.get(i, j).abs() < 1e-15,
                        "Q off-diagonal [{},{}] should be zero",
                        i, j
                    );
                }
            }
        }
    }

    #[test]
    fn propagate_covariance_with_identity_f() {
        let config = EskfConfig::default();
        let q = build_q_matrix(&config, 0.01);
        let p = Mat15::identity();
        let f = Mat15::identity();
        let p_new = propagate_covariance(&p, &f, &q);
        // P_new = I * I * I + Q = I + Q
        for i in 0..15 {
            assert!(
                (p_new.get(i, i) - (1.0 + q.get(i, i))).abs() < 1e-12,
                "P_new diagonal [{}] wrong",
                i
            );
        }
    }

    #[test]
    fn quat_to_rotation_matrix_identity() {
        let r = quat_to_rotation_matrix(DQuat::IDENTITY);
        for i in 0..3 {
            for j in 0..3 {
                let expected = if i == j { 1.0 } else { 0.0 };
                assert!(
                    (r.get(i, j) - expected).abs() < 1e-12,
                    "Identity quat should give identity rotation matrix"
                );
            }
        }
    }
}
