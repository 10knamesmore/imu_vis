//! ESKF ZUPT 量测更新步骤。
//!
//! 将零速更新（ZUPT）实现为 Kalman 滤波器量测更新。当检测到 IMU 静止时，期望速度为零。
//! 该观测用于修正完整的 15 维误差估计并降低协方差。
//!
//! # 量测模型
//!
//! ZUPT 的观测方程为：
//!
//! ```text
//! z = H * x + v,   v ~ N(0, R)
//! ```
//!
//! 其中：
//! - `z = [0, 0, 0]ᵀ`（静止时测得速度为零）
//! - `H = [0₃ₓ₃ | I₃ | 0₃ₓ₃ | 0₃ₓ₃ | 0₃ₓ₃]`（3x15）用于选择速度状态
//! - `x` 是 15 维误差向量
//! - `v` 是量测噪声，协方差为 R = σ²_zupt * I₃
//!
//! # Kalman 增益计算
//!
//! ```text
//! 创新：      y = z - H * x_nominal = 0 - v_nominal = -v_nominal
//! 创新协方差：S = H * P * Hᵀ + R = P[3..6, 3..6] + R
//! Kalman 增益：K = P * Hᵀ * S⁻¹ = P[:, 3..6] * S⁻¹   (15x3)
//! 误差状态：  δx = K * y                                (15x1)
//! 协方差：    P = (I - K * H) * P
//! ```
//!
//! 由于 H 结构非常稀疏（仅列 3..6 为 I₃），所有运算都会利用该稀疏性以避免完整的 15x15 乘法。
//!
//! # 状态注入
//!
//! 计算误差状态 δx 后，将修正量应用到名义状态：
//!
//! ```text
//! 姿态       ← 姿态 * quat_from_rotation_vector(δθ)
//! 速度       += δv
//! 位置       += δp
//! 陀螺仪偏差 += δb_g
//! 加速度计偏差 += δb_a
//! ```

use math_f64::{DMat3, DQuat, DVec3};

use super::matrix::{Mat15, Vec15};

/// 对协方差执行 ZUPT 量测更新，并计算误差状态修正向量 δx。
///
/// 该函数实现专用于 ZUPT 观测模型 H = [0|I₃|0|0|0] 的标准 Kalman 滤波更新方程。
///
/// # 参数
///
/// * `p` - 指向 15x15 协方差矩阵的可变引用（就地更新）
/// * `v_nominal` - 当前世界系名义速度 (m/s)
/// * `zupt_noise` - ZUPT 速度量测噪声标准差 (m/s)
///
/// # 返回
///
/// 15 元误差状态修正向量 δx = K * y。
///
/// # 创新协方差
///
/// S = P[3..6, 3..6] + R，其中 R = σ² * I₃。由于 S 是 3x3 正定矩阵，
/// 这里使用 `DMat3` 的余子式/伴随矩阵求逆；对于小型良态矩阵，该方式数值稳定。
pub fn zupt_update(p: &mut Mat15, v_nominal: DVec3, zupt_noise: f64) -> Vec15 {
    // 创新：y = 0 - v_nominal。
    let y = DVec3::new(-v_nominal.x, -v_nominal.y, -v_nominal.z);

    // 创新协方差：S = P[3..6, 3..6] + R。
    // R = zupt_noise² * I₃
    let r_diag = zupt_noise * zupt_noise;
    let s = DMat3::new(
        p.get(3, 3) + r_diag,
        p.get(3, 4),
        p.get(3, 5),
        p.get(4, 3),
        p.get(4, 4) + r_diag,
        p.get(4, 5),
        p.get(5, 3),
        p.get(5, 4),
        p.get(5, 5) + r_diag,
    );

    // S⁻¹（3x3 逆矩阵）
    let s_inv = s.inverse().unwrap_or(DMat3::IDENTITY);

    // Kalman 增益：K = P[:, 3..6] * S⁻¹（15x3）。
    // P[:, 3..6] 通过 velocity_cols() 高效提取。
    let p_ht = p.velocity_cols(); // [[f64; 3]; 15] = P * Hᵀ
    let mut k = [[0.0_f64; 3]; 15];
    for i in 0..15 {
        // k[i] = p_ht[i] * S⁻¹（行向量 * 矩阵）
        let row = DVec3::new(p_ht[i][0], p_ht[i][1], p_ht[i][2]);
        // K[i,:] = (Hᵀ 第 i 行)ᵀ * S⁻¹ = 行向量 * S⁻¹ᵀ
        // 由于 S 对称（P 对称，R 为对角矩阵），S⁻¹ 也对称。
        let ki = s_inv.mul_vec3(row);
        k[i][0] = ki.x;
        k[i][1] = ki.y;
        k[i][2] = ki.z;
    }

    // 误差状态：δx = K * y（15x1 = 15x3 * 3x1）。
    let mut dx = Vec15::zeros();
    for i in 0..15 {
        dx.set(i, k[i][0] * y.x + k[i][1] * y.y + k[i][2] * y.z);
    }

    // 更新协方差：P = (I - K * H) * P。
    p.zupt_update(&k);

    dx
}

/// 将误差状态修正量（状态注入）应用到名义状态。
///
/// 15 元误差状态 δx 会拆分为五个三维向量，并应用到对应的名义状态变量：
///
/// - `δθ`（索引 0..3）：通过小角度四元数修正姿态
/// - `δv`（索引 3..6）：速度修正（加性）
/// - `δp`（索引 6..9）：位置修正（加性）
/// - `δb_g`（索引 9..12）：陀螺仪偏差修正（加性）
/// - `δb_a`（索引 12..15）：加速度计偏差修正（加性）
///
/// # 参数
///
/// * `dx` - 来自 [`zupt_update`] 的误差状态向量
/// * `attitude` - 指向名义姿态四元数的可变引用
/// * `velocity` - 指向名义速度的可变引用
/// * `position` - 指向名义位置的可变引用
/// * `bias_gyro` - 指向估计陀螺仪偏差的可变引用
/// * `bias_accel` - 指向估计加速度计偏差的可变引用
pub fn apply_state_injection(
    dx: &Vec15,
    attitude: &mut DQuat,
    velocity: &mut DVec3,
    _position: &mut DVec3,
    bias_gyro: &mut DVec3,
    bias_accel: &mut DVec3,
) {
    // 姿态修正：q ← q * quat_from_rotation_vector(δθ)
    let d_theta = DVec3::new(dx.get(0), dx.get(1), dx.get(2));
    let dq = DQuat::from_scaled_axis(d_theta);
    *attitude = (*attitude * dq).normalize();

    // 速度修正。
    velocity.x += dx.get(3);
    velocity.y += dx.get(4);
    velocity.z += dx.get(5);

    // 位置修正：跳过。
    //
    // ZUPT 只观测"速度=0"，对正确位置没有任何信息。δp 来自协方差耦合的间接推断，
    // 在 MEMS IMU 上这个推断经常不准确，会导致静止时位置跳变或持续漂移到错误位置。
    //
    // 正确行为：速度归零后，位置自然停止变化。位置误差需要外部观测（GPS/UWB）才能修正。
    //
    // dx.get(6..9) 被忽略，不注入到位置。
    let _ = (dx.get(6), dx.get(7), dx.get(8));

    // 陀螺仪偏差修正。
    bias_gyro.x += dx.get(9);
    bias_gyro.y += dx.get(10);
    bias_gyro.z += dx.get(11);

    // 加速度计偏差修正。
    bias_accel.x += dx.get(12);
    bias_accel.y += dx.get(13);
    bias_accel.z += dx.get(14);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zupt_update_zeroes_velocity_in_covariance() {
        // 从单位协方差和零速度开始；ZUPT 不应产生明显变化。
        let mut p = Mat15::identity();
        let v = DVec3::ZERO;
        let dx = zupt_update(&mut p, v, 0.01);

        // 零速度下创新 y = 0，因此 δx 应为零。
        for i in 0..15 {
            assert!(
                dx.get(i).abs() < 1e-10,
                "dx[{}] = {} should be ~0 for zero velocity",
                i,
                dx.get(i)
            );
        }
    }

    #[test]
    fn zupt_update_corrects_nonzero_velocity() {
        let mut p = Mat15::identity();
        let v = DVec3::new(1.0, 0.0, 0.0);
        let dx = zupt_update(&mut p, v, 0.01);

        // δv 应近似为 -v（将速度推向零）。
        // 当 P=I 且 R=0.01²*I 时：K_vel = P[3..6,3..6] * S⁻¹ ≈ I * (I+0.0001I)⁻¹ ≈ I
        // 因此 δv ≈ -v。
        assert!(
            (dx.get(3) - (-1.0)).abs() < 0.01,
            "δv_x should be ~-1.0, got {}",
            dx.get(3)
        );
        assert!(dx.get(4).abs() < 0.01);
        assert!(dx.get(5).abs() < 0.01);
    }

    #[test]
    fn state_injection_corrects_attitude() {
        let mut attitude = DQuat::IDENTITY;
        let mut velocity = DVec3::new(0.1, 0.0, 0.0);
        let mut position = DVec3::ZERO;
        let mut bias_gyro = DVec3::ZERO;
        let mut bias_accel = DVec3::ZERO;

        let mut dx = Vec15::zeros();
        dx.set(3, -0.1); // 将速度修正为零
        dx.set(0, 0.01); // 小幅姿态修正

        apply_state_injection(&dx, &mut attitude, &mut velocity, &mut position, &mut bias_gyro, &mut bias_accel);

        assert!((velocity.x).abs() < 1e-12, "velocity should be corrected to ~0");
        assert!(
            (attitude.length() - 1.0).abs() < 1e-10,
            "attitude should remain unit quaternion"
        );
    }

    #[test]
    fn covariance_velocity_block_shrinks_after_zupt() {
        let mut p = Mat15::identity();
        let v = DVec3::new(0.5, -0.3, 0.1);
        let _ = zupt_update(&mut p, v, 0.01);

        // ZUPT 后，P 的速度对角线应远小于 1.0。
        for i in 3..6 {
            assert!(
                p.get(i, i) < 0.01,
                "P[{},{}] = {} should be small after ZUPT",
                i, i, p.get(i, i)
            );
        }
    }
}
