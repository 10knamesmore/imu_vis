//! ESKF prediction step: state transition matrix F, process noise Q, and
//! covariance propagation.
//!
//! # Mathematical derivation
//!
//! ## Error-state dynamics
//!
//! The 15-state error vector is δx = [δθ, δv, δp, δb_g, δb_a]ᵀ where:
//! - δθ (0..3):  attitude error (rotation vector, rad)
//! - δv (3..6):  velocity error (m/s)
//! - δp (6..9):  position error (m)
//! - δb_g (9..12):  gyroscope bias error (rad/s)
//! - δb_a (12..15): accelerometer bias error (m/s²)
//!
//! The continuous-time error dynamics are:
//!
//! ```text
//! δθ̇   = -δb_g                           (gyro bias drives attitude error)
//! δv̇   = -[a_world×] δθ  - R δb_a        (attitude error + accel bias drive velocity error)
//! δṗ   = δv                               (velocity error drives position error)
//! δḃ_g = w_bg                             (random walk)
//! δḃ_a = w_ba                             (random walk)
//! ```
//!
//! where:
//! - `a_world` is the linear acceleration in the world frame (after gravity removal)
//! - `R` is the body-to-world rotation matrix (from the nominal attitude quaternion)
//! - `[a_world×]` is the skew-symmetric (cross-product) matrix of `a_world`
//! - `w_bg`, `w_ba` are zero-mean white noise driving the bias random walks
//!
//! ## State transition matrix F
//!
//! The continuous-time Jacobian Fx is a 15x15 block matrix:
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
//! The discrete-time state transition matrix is obtained via first-order
//! approximation (sufficient for small dt):
//!
//! ```text
//! F = I₁₅ + Fx * dt
//! ```
//!
//! This means:
//! - `F[0..3, 9..12]  = -I₃ * dt`  (gyro bias → attitude error)
//! - `F[3..6, 0..3]   = -[a_world×] * dt`  (attitude error → velocity error)
//! - `F[3..6, 12..15] = -R * dt`  (accel bias → velocity error)
//! - `F[6..9, 3..6]   = I₃ * dt`  (velocity → position)
//! - All diagonal blocks remain I₃ (from the identity)
//! - All other off-diagonal blocks remain 0
//!
//! ## Process noise covariance Q
//!
//! The process noise is modeled as:
//!
//! ```text
//! Q = diag(σ²_gyro * dt, σ²_accel * dt, σ²_pos * dt, σ²_bg * dt, σ²_ba * dt)
//! ```
//!
//! where each σ² is the square of the corresponding noise spectral density
//! parameter from [`EskfConfig`], and `dt` converts from continuous-time
//! power spectral density to discrete-time variance.

use math_f64::{DMat3, DQuat, DVec3};

use super::matrix::Mat15;
use crate::processor::navigator::types::EskfConfig;

/// Build the discrete-time state transition matrix F (15x15).
///
/// Implements `F = I₁₅ + Fx * dt` where Fx is the continuous-time error-state
/// Jacobian. See module-level documentation for the full derivation.
///
/// # Arguments
///
/// * `attitude` - Current nominal attitude quaternion (body → world)
/// * `accel_world` - Linear acceleration in world frame after gravity removal (m/s²)
/// * `dt` - Time step in seconds
///
/// # Returns
///
/// The 15x15 state transition matrix F.
pub fn build_f_matrix(attitude: DQuat, accel_world: DVec3, dt: f64) -> Mat15 {
    let mut f = Mat15::identity();

    // F[0..3, 9..12] = -I₃ * dt  (gyro bias → attitude error)
    // δθ̇ = -δb_g  →  discrete: δθ(k+1) += -I₃ * dt * δb_g(k)
    for i in 0..3 {
        f.set(i, 9 + i, -dt);
    }

    // F[3..6, 0..3] = -[a_world×] * dt  (attitude error → velocity error)
    // δv̇ = -[a_world×] δθ  →  cross-product matrix of acceleration
    let skew_a = DMat3::skew(accel_world);
    for i in 0..3 {
        for j in 0..3 {
            f.set(3 + i, j, -skew_a.get(i, j) * dt);
        }
    }

    // F[3..6, 12..15] = -R * dt  (accel bias → velocity error)
    // δv̇ = -R δb_a  →  rotation matrix transforms bias from body to world frame
    let r = quat_to_rotation_matrix(attitude);
    for i in 0..3 {
        for j in 0..3 {
            f.set(3 + i, 12 + j, -r.get(i, j) * dt);
        }
    }

    // F[6..9, 3..6] = I₃ * dt  (velocity → position)
    // δṗ = δv  →  discrete: δp(k+1) += I₃ * dt * δv(k)
    for i in 0..3 {
        f.set(6 + i, 3 + i, dt);
    }

    f
}

/// Build the discrete-time process noise covariance matrix Q (15x15, diagonal).
///
/// Each diagonal block corresponds to the variance accumulated over one time step
/// `dt` from the continuous-time noise spectral densities specified in the config.
///
/// ```text
/// Q = diag(
///     σ²_gyro * dt * [1,1,1],     // attitude process noise (0..3)
///     σ²_accel * dt * [1,1,1],    // velocity process noise (3..6)
///     σ²_pos * dt * [1,1,1],      // position process noise (6..9)
///     σ²_bg_walk * dt * [1,1,1],  // gyro bias random walk (9..12)
///     σ²_ba_walk * dt * [1,1,1],  // accel bias random walk (12..15)
/// )
/// ```
///
/// # Arguments
///
/// * `config` - ESKF noise parameters
/// * `dt` - Time step in seconds
pub fn build_q_matrix(config: &EskfConfig, dt: f64) -> Mat15 {
    let mut diag = [0.0; 15];

    let q_gyro = config.gyro_noise * config.gyro_noise * dt;
    let q_accel = config.accel_noise * config.accel_noise * dt;
    let q_pos = config.pos_noise * config.pos_noise * dt;
    let q_bg = config.gyro_bias_walk * config.gyro_bias_walk * dt;
    let q_ba = config.accel_bias_walk * config.accel_bias_walk * dt;

    // Attitude error (0..3)
    diag[0] = q_gyro;
    diag[1] = q_gyro;
    diag[2] = q_gyro;

    // Velocity error (3..6)
    diag[3] = q_accel;
    diag[4] = q_accel;
    diag[5] = q_accel;

    // Position error (6..9)
    diag[6] = q_pos;
    diag[7] = q_pos;
    diag[8] = q_pos;

    // Gyro bias random walk (9..12)
    diag[9] = q_bg;
    diag[10] = q_bg;
    diag[11] = q_bg;

    // Accel bias random walk (12..15)
    diag[12] = q_ba;
    diag[13] = q_ba;
    diag[14] = q_ba;

    Mat15::from_diagonal(&diag)
}

/// Propagate the error-state covariance: `P = F * P * Fᵀ + Q`.
///
/// This is the standard discrete-time Kalman filter prediction step for the
/// covariance. The state transition matrix F encodes how errors propagate
/// over one time step, and Q adds the process noise accumulated during that step.
///
/// # Arguments
///
/// * `p` - Current covariance matrix (15x15, symmetric positive semi-definite)
/// * `f` - State transition matrix from [`build_f_matrix`]
/// * `q` - Process noise matrix from [`build_q_matrix`]
///
/// # Returns
///
/// The propagated covariance matrix.
pub fn propagate_covariance(p: &Mat15, f: &Mat15, q: &Mat15) -> Mat15 {
    // P_new = F * P * F^T + Q
    let fp = f.mul(p);
    let ft = f.transpose();
    let fpft = fp.mul(&ft);
    fpft.add(q)
}

/// Convert a unit quaternion to a 3x3 rotation matrix (body → world).
///
/// Uses the standard quaternion-to-DCM formula. The quaternion is assumed
/// to be unit-length (not explicitly normalized here for performance).
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
        // F[0,9], F[1,10], F[2,11] should be -dt
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
        // F[6,3], F[7,4], F[8,5] should be dt
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
