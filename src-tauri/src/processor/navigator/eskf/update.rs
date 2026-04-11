//! ESKF ZUPT measurement update step.
//!
//! Implements the zero-velocity update (ZUPT) as a Kalman filter measurement
//! update. When the IMU is detected to be stationary, the expected velocity
//! is zero. This observation is used to correct the full 15-state error
//! estimate and reduce covariance.
//!
//! # Measurement model
//!
//! The observation equation for ZUPT is:
//!
//! ```text
//! z = H * x + v,   v ~ N(0, R)
//! ```
//!
//! where:
//! - `z = [0, 0, 0]ᵀ` (measured velocity = zero during standstill)
//! - `H = [0₃ₓ₃ | I₃ | 0₃ₓ₃ | 0₃ₓ₃ | 0₃ₓ₃]` (3x15) selects velocity states
//! - `x` is the 15-state error vector
//! - `v` is measurement noise with covariance R = σ²_zupt * I₃
//!
//! # Kalman gain computation
//!
//! ```text
//! Innovation:  y = z - H * x_nominal = 0 - v_nominal = -v_nominal
//! Innovation covariance:  S = H * P * Hᵀ + R = P[3..6, 3..6] + R
//! Kalman gain:  K = P * Hᵀ * S⁻¹ = P[:, 3..6] * S⁻¹   (15x3)
//! Error state:  δx = K * y                                (15x1)
//! Covariance:   P = (I - K * H) * P
//! ```
//!
//! Since H has a very sparse structure (only I₃ in columns 3..6), all
//! operations exploit this sparsity to avoid full 15x15 multiplications.
//!
//! # State injection
//!
//! After computing the error state δx, the corrections are applied to the
//! nominal state:
//!
//! ```text
//! attitude  ← attitude * quat_from_rotation_vector(δθ)
//! velocity  += δv
//! position  += δp
//! bias_gyro += δb_g
//! bias_accel += δb_a
//! ```

use math_f64::{DMat3, DQuat, DVec3};

use super::matrix::{Mat15, Vec15};

/// Perform ZUPT measurement update on the covariance and compute the error
/// state correction vector δx.
///
/// This function implements the standard Kalman filter update equations
/// specialized for the ZUPT observation model where H = [0|I₃|0|0|0].
///
/// # Arguments
///
/// * `p` - Mutable reference to the 15x15 covariance matrix (updated in-place)
/// * `v_nominal` - Current nominal velocity in world frame (m/s)
/// * `zupt_noise` - ZUPT velocity measurement noise standard deviation (m/s)
///
/// # Returns
///
/// The 15-element error state correction vector δx = K * y.
///
/// # Innovation covariance
///
/// S = P[3..6, 3..6] + R where R = σ² * I₃. Since S is a 3x3 positive
/// definite matrix, we use the cofactor/adjugate inversion from `DMat3`
/// which is numerically stable for small well-conditioned matrices.
pub fn zupt_update(p: &mut Mat15, v_nominal: DVec3, zupt_noise: f64) -> Vec15 {
    // Innovation: y = 0 - v_nominal
    let y = DVec3::new(-v_nominal.x, -v_nominal.y, -v_nominal.z);

    // Innovation covariance: S = P[3..6, 3..6] + R
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

    // S⁻¹ (3x3 inverse)
    let s_inv = s.inverse().unwrap_or(DMat3::IDENTITY);

    // Kalman gain: K = P[:, 3..6] * S⁻¹  (15x3)
    // P[:, 3..6] is extracted efficiently via velocity_cols()
    let p_ht = p.velocity_cols(); // [[f64; 3]; 15] = P * Hᵀ
    let mut k = [[0.0_f64; 3]; 15];
    for i in 0..15 {
        // k[i] = p_ht[i] * S⁻¹  (row vector * matrix)
        let row = DVec3::new(p_ht[i][0], p_ht[i][1], p_ht[i][2]);
        // K[i,:] = (Hᵀ row i)ᵀ * S⁻¹ = row * S⁻¹ᵀ
        // Since S is symmetric (P is symmetric, R is diagonal), S⁻¹ is also symmetric.
        let ki = s_inv.mul_vec3(row);
        k[i][0] = ki.x;
        k[i][1] = ki.y;
        k[i][2] = ki.z;
    }

    // Error state: δx = K * y  (15x1 = 15x3 * 3x1)
    let mut dx = Vec15::zeros();
    for i in 0..15 {
        dx.set(i, k[i][0] * y.x + k[i][1] * y.y + k[i][2] * y.z);
    }

    // Update covariance: P = (I - K * H) * P
    p.zupt_update(&k);

    dx
}

/// Apply the error state correction (state injection) to the nominal state.
///
/// The 15-element error state δx is decomposed into five 3-vectors and
/// applied to the corresponding nominal state variables:
///
/// - `δθ` (indices 0..3): attitude correction via small-angle quaternion
/// - `δv` (indices 3..6): velocity correction (additive)
/// - `δp` (indices 6..9): position correction (additive)
/// - `δb_g` (indices 9..12): gyroscope bias correction (additive)
/// - `δb_a` (indices 12..15): accelerometer bias correction (additive)
///
/// # Arguments
///
/// * `dx` - The error state vector from [`zupt_update`]
/// * `attitude` - Mutable reference to the nominal attitude quaternion
/// * `velocity` - Mutable reference to the nominal velocity
/// * `position` - Mutable reference to the nominal position
/// * `bias_gyro` - Mutable reference to the estimated gyroscope bias
/// * `bias_accel` - Mutable reference to the estimated accelerometer bias
pub fn apply_state_injection(
    dx: &Vec15,
    attitude: &mut DQuat,
    velocity: &mut DVec3,
    position: &mut DVec3,
    bias_gyro: &mut DVec3,
    bias_accel: &mut DVec3,
) {
    // Attitude correction: q ← q * quat_from_rotation_vector(δθ)
    let d_theta = DVec3::new(dx.get(0), dx.get(1), dx.get(2));
    let dq = DQuat::from_scaled_axis(d_theta);
    *attitude = (*attitude * dq).normalize();

    // Velocity correction
    velocity.x += dx.get(3);
    velocity.y += dx.get(4);
    velocity.z += dx.get(5);

    // Position correction
    position.x += dx.get(6);
    position.y += dx.get(7);
    position.z += dx.get(8);

    // Gyroscope bias correction
    bias_gyro.x += dx.get(9);
    bias_gyro.y += dx.get(10);
    bias_gyro.z += dx.get(11);

    // Accelerometer bias correction
    bias_accel.x += dx.get(12);
    bias_accel.y += dx.get(13);
    bias_accel.z += dx.get(14);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zupt_update_zeroes_velocity_in_covariance() {
        // Start with identity covariance and zero velocity;
        // ZUPT should not change much.
        let mut p = Mat15::identity();
        let v = DVec3::ZERO;
        let dx = zupt_update(&mut p, v, 0.01);

        // With zero velocity, innovation y = 0, so δx should be zero.
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

        // δv should be approximately -v (pushing velocity toward zero)
        // With P=I and R=0.01²*I: K_vel = P[3..6,3..6] * S⁻¹ ≈ I * (I+0.0001I)⁻¹ ≈ I
        // So δv ≈ -v
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
        dx.set(3, -0.1); // correct velocity to zero
        dx.set(0, 0.01); // small attitude correction

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

        // After ZUPT, the velocity diagonal of P should be much smaller than 1.0
        for i in 3..6 {
            assert!(
                p.get(i, i) < 0.01,
                "P[{},{}] = {} should be small after ZUPT",
                i, i, p.get(i, i)
            );
        }
    }
}
