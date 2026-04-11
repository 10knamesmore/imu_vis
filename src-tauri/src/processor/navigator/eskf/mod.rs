//! Error-State Kalman Filter (ESKF) navigator implementation.
//!
//! # Algorithm overview
//!
//! The ESKF (Error-State Kalman Filter), also known as the indirect Kalman
//! filter, is a widely used fusion algorithm for inertial navigation. Unlike
//! a direct (extended) Kalman filter that estimates the full navigation state,
//! the ESKF maintains two parallel representations:
//!
//! 1. **Nominal state** — propagated via standard mechanization equations
//!    (quaternion integration, velocity/position integration). This is the
//!    "best guess" of the true state and is what gets reported to consumers.
//!
//! 2. **Error state** — a small perturbation vector δx that captures the
//!    deviation between the nominal state and the true state. The Kalman
//!    filter operates on this error state, which remains small and therefore
//!    well-suited to linearization.
//!
//! # Why 15 states?
//!
//! The error state vector δx has 15 elements organized in five 3-vectors:
//!
//! | Index | Symbol | Meaning                        | Units  |
//! |-------|--------|--------------------------------|--------|
//! | 0..3  | δθ     | Attitude error (rotation vec)  | rad    |
//! | 3..6  | δv     | Velocity error                 | m/s    |
//! | 6..9  | δp     | Position error                 | m      |
//! | 9..12 | δb_g   | Gyroscope bias error           | rad/s  |
//! | 12..15| δb_a   | Accelerometer bias error       | m/s²   |
//!
//! The bias states allow the filter to estimate and compensate for slowly
//! drifting sensor biases, which is the primary advantage over simple
//! direct integration with ZUPT hard-lock.
//!
//! # How it differs from direct integration (legacy navigator)
//!
//! The legacy navigator performs:
//! - Direct double-integration of accelerometer data
//! - Hard velocity zeroing or exponential decay during detected standstill
//! - No sensor bias estimation
//!
//! The ESKF instead:
//! - Tracks a full 15x15 covariance matrix of estimation uncertainty
//! - Uses optimal (Kalman) gain to fuse ZUPT observations
//! - Estimates gyroscope and accelerometer biases online
//! - Produces statistically consistent corrections proportional to uncertainty
//!
//! # Prediction / update cycle
//!
//! Each IMU sample triggers:
//!
//! 1. **Nominal state propagation**: integrate velocity and position using
//!    bias-corrected accelerometer data (same physics as legacy, but with
//!    bias subtraction).
//!
//! 2. **Error covariance prediction**: propagate P via `P = F*P*Fᵀ + Q`
//!    where F is the linearized error-state dynamics and Q is process noise.
//!
//! 3. **ZUPT detection**: hysteresis-based static detection (same logic as
//!    legacy SmoothHysteresis).
//!
//! 4. **Measurement update** (if static): compute Kalman gain from P and
//!    the ZUPT observation model, correct the error state, inject corrections
//!    into the nominal state, and update P.

/// Hand-written 15x15 matrix and 15-element vector types.
pub mod matrix;
/// ESKF prediction step (F matrix, Q matrix, covariance propagation).
pub mod predict;
/// ESKF ZUPT measurement update step.
pub mod update;

use math_f64::{DQuat, DVec3};

use self::matrix::Mat15;
use self::predict::{build_f_matrix, build_q_matrix, propagate_covariance};
use self::update::{apply_state_injection, zupt_update};
use crate::processor::filter::ImuSampleFiltered;
use crate::processor::navigator::types::{NavState, NavigatorConfig};

/// ESKF-based inertial navigator.
///
/// Combines nominal state mechanization with error-state Kalman filtering
/// for optimal ZUPT-aided pedestrian dead reckoning. Estimates and
/// compensates gyroscope and accelerometer biases online.
///
/// See module-level documentation for algorithm details.
pub struct EskfNavigator {
    /// Navigator configuration (trajectory, ZUPT, gravity, ESKF params).
    config: NavigatorConfig,
    /// Current nominal navigation state (position, velocity, attitude).
    nav_state: NavState,
    /// Gravity reference vector in the world frame.
    gravity_ref: DVec3,
    /// Estimated gyroscope bias (rad/s).
    bias_gyro: DVec3,
    /// Estimated accelerometer bias (m/s²).
    bias_accel: DVec3,
    /// 15x15 error-state covariance matrix.
    covariance: Mat15,
    /// Timestamp of the last processed sample (ms).
    last_timestamp_ms: Option<u64>,
    /// Previous static detection result for hysteresis.
    last_is_static: Option<bool>,
    /// Counter for entering static state (hysteresis).
    static_enter_count: u32,
    /// Counter for exiting static state (hysteresis).
    static_exit_count: u32,
    /// Previous frame's linear acceleration in world frame (for trapezoid integration).
    last_accel_lin: Option<DVec3>,
}

impl EskfNavigator {
    /// Create a new ESKF navigator with the given configuration.
    ///
    /// Initializes the covariance matrix from the `init_sigma_*` fields in
    /// [`EskfConfig`](crate::processor::navigator::types::EskfConfig).
    pub fn new(config: NavigatorConfig) -> Self {
        let gravity = config.gravity;
        let eskf = &config.eskf;

        // Build initial covariance from configured initial standard deviations
        let sa = eskf.init_sigma_attitude;
        let sv = eskf.init_sigma_velocity;
        let sp = eskf.init_sigma_position;
        let sbg = eskf.init_sigma_gyro_bias;
        let sba = eskf.init_sigma_accel_bias;
        let init_diag = [
            sa * sa, sa * sa, sa * sa, // attitude
            sv * sv, sv * sv, sv * sv, // velocity
            sp * sp, sp * sp, sp * sp, // position
            sbg * sbg, sbg * sbg, sbg * sbg, // gyro bias
            sba * sba, sba * sba, sba * sba, // accel bias
        ];

        Self {
            config,
            nav_state: NavState {
                timestamp_ms: 0,
                position: DVec3::ZERO,
                velocity: DVec3::ZERO,
                attitude: DQuat::IDENTITY,
            },
            gravity_ref: DVec3::new(0.0, 0.0, gravity),
            bias_gyro: DVec3::ZERO,
            bias_accel: DVec3::ZERO,
            covariance: Mat15::from_diagonal(&init_diag),
            last_timestamp_ms: None,
            last_is_static: None,
            static_enter_count: 0,
            static_exit_count: 0,
            last_accel_lin: None,
        }
    }

    /// Update the navigator with one IMU sample and return the current state.
    ///
    /// Executes the full ESKF cycle:
    /// 1. Compute dt from timestamps
    /// 2. Nominal state propagation (bias-corrected integration)
    /// 3. Error covariance prediction (F, Q, P propagation)
    /// 4. ZUPT detection (hysteresis)
    /// 5. If static: ZUPT measurement update + state injection
    pub fn update(&mut self, attitude: DQuat, sample: &ImuSampleFiltered) -> NavState {
        self.nav_state.attitude = attitude;
        self.nav_state.timestamp_ms = sample.timestamp_ms;

        if self.config.trajectory.passby {
            self.last_timestamp_ms = Some(sample.timestamp_ms);
            return self.nav_state;
        }

        // --- Step 1: Compute dt ---
        let dt = self
            .last_timestamp_ms
            .map(|ts| {
                clamp_dt_s(
                    sample.timestamp_ms.saturating_sub(ts),
                    self.config.trajectory.dt_min_ms,
                    self.config.trajectory.dt_max_ms,
                )
            })
            .unwrap_or(0.0);
        self.last_timestamp_ms = Some(sample.timestamp_ms);

        if dt <= 0.0 {
            return self.nav_state;
        }

        // --- Step 2: Nominal state propagation (trapezoid integration) ---
        // Subtract estimated biases from the raw (filtered) measurements
        let accel_corrected = sample.accel_lp - self.bias_accel;
        let a_world = attitude.rotate_vec3(accel_corrected);
        let a_lin = a_world - self.gravity_ref;

        // Trapezoid integration: average current and previous acceleration
        let a_prev = self.last_accel_lin.unwrap_or(a_lin);
        let v_prev = self.nav_state.velocity;
        let v_next = v_prev + (a_prev + a_lin) * (0.5 * dt);
        self.nav_state.velocity = v_next;
        self.nav_state.position += (v_prev + v_next) * (0.5 * dt);
        self.last_accel_lin = Some(a_lin);

        // --- Step 3: Error covariance prediction ---
        let f = build_f_matrix(attitude, a_lin, dt);
        let q = build_q_matrix(&self.config.eskf, dt);
        self.covariance = propagate_covariance(&self.covariance, &f, &q);

        // --- Step 4: ZUPT detection (hysteresis) ---
        let gyro_norm = sample.gyro_lp.length();
        let accel_norm = a_lin.length();
        let is_static = self.detect_static(gyro_norm, accel_norm);

        // --- Step 5: ZUPT measurement update ---
        if is_static {
            let dx = zupt_update(
                &mut self.covariance,
                self.nav_state.velocity,
                self.config.eskf.zupt_velocity_noise,
            );

            apply_state_injection(
                &dx,
                &mut self.nav_state.attitude,
                &mut self.nav_state.velocity,
                &mut self.nav_state.position,
                &mut self.bias_gyro,
                &mut self.bias_accel,
            );

            if sample.timestamp_ms % 1000 < 4 {
                tracing::info!(
                    "ESKF ZUPT 更新 | vel=[{:.4}, {:.4}, {:.4}] | bias_g=[{:.5}, {:.5}, {:.5}] | bias_a=[{:.4}, {:.4}, {:.4}]",
                    self.nav_state.velocity.x,
                    self.nav_state.velocity.y,
                    self.nav_state.velocity.z,
                    self.bias_gyro.x,
                    self.bias_gyro.y,
                    self.bias_gyro.z,
                    self.bias_accel.x,
                    self.bias_accel.y,
                    self.bias_accel.z
                );
            }
        }

        self.nav_state
    }

    /// Return whether the navigator currently detects static (standstill).
    pub fn is_static(&self) -> bool {
        self.last_is_static.unwrap_or(false)
    }

    /// Set the gravity reference vector after attitude zero-point calibration.
    ///
    /// `quat_offset` is the left-multiply quaternion used for axis alignment.
    /// The gravity vector is rotated to match the calibrated reference frame.
    pub fn set_gravity_reference(&mut self, quat_offset: DQuat) {
        let gravity_world = DVec3::new(0.0, 0.0, self.config.gravity);
        self.gravity_ref = quat_offset.rotate_vec3(gravity_world);
        tracing::info!(
            "ESKF 重力参考更新 | g_ref=[{:.3}, {:.3}, {:.3}]",
            self.gravity_ref.x,
            self.gravity_ref.y,
            self.gravity_ref.z
        );
    }

    /// Manually set the position (e.g., for coordinate correction).
    pub fn set_position(&mut self, position: DVec3) {
        tracing::info!(
            "ESKF 位置手动校正 | old=[{:.3}, {:.3}, {:.3}] | new=[{:.3}, {:.3}, {:.3}]",
            self.nav_state.position.x,
            self.nav_state.position.y,
            self.nav_state.position.z,
            position.x,
            position.y,
            position.z
        );
        self.nav_state.position = position;
        self.nav_state.velocity = DVec3::ZERO;
    }

    /// Reset all internal state to initial values.
    pub fn reset(&mut self) {
        let eskf = &self.config.eskf;
        let sa = eskf.init_sigma_attitude;
        let sv = eskf.init_sigma_velocity;
        let sp = eskf.init_sigma_position;
        let sbg = eskf.init_sigma_gyro_bias;
        let sba = eskf.init_sigma_accel_bias;
        let init_diag = [
            sa * sa, sa * sa, sa * sa,
            sv * sv, sv * sv, sv * sv,
            sp * sp, sp * sp, sp * sp,
            sbg * sbg, sbg * sbg, sbg * sbg,
            sba * sba, sba * sba, sba * sba,
        ];

        self.nav_state = NavState {
            timestamp_ms: 0,
            position: DVec3::ZERO,
            velocity: DVec3::ZERO,
            attitude: DQuat::IDENTITY,
        };
        self.gravity_ref = DVec3::new(0.0, 0.0, self.config.gravity);
        self.bias_gyro = DVec3::ZERO;
        self.bias_accel = DVec3::ZERO;
        self.covariance = Mat15::from_diagonal(&init_diag);
        self.last_timestamp_ms = None;
        self.last_is_static = None;
        self.static_enter_count = 0;
        self.static_exit_count = 0;
        self.last_accel_lin = None;

        tracing::info!("ESKF 导航器已重置");
    }

    /// Hysteresis-based ZUPT static detection.
    ///
    /// Uses enter/exit thresholds with frame counters to avoid rapid toggling
    /// between static and moving states. This is the same logic as the legacy
    /// `SmoothHysteresis` detection but without the smooth decay correction.
    fn detect_static(&mut self, gyro_norm: f64, accel_norm: f64) -> bool {
        let zupt = &self.config.zupt;
        let entering = gyro_norm < zupt.gyro_enter_thresh
            && accel_norm < zupt.accel_enter_thresh;
        let exiting = gyro_norm > zupt.gyro_exit_thresh
            || accel_norm > zupt.accel_exit_thresh;

        let prev_is_static = self.last_is_static.unwrap_or(false);
        let mut is_static = prev_is_static;

        if prev_is_static {
            if exiting {
                self.static_exit_count = self.static_exit_count.saturating_add(1);
            } else {
                self.static_exit_count = 0;
            }
            if self.static_exit_count >= zupt.exit_frames.max(1) {
                is_static = false;
                self.static_exit_count = 0;
                tracing::info!(
                    "ESKF ZUPT: 退出静止状态 | gyro={:.4} rad/s | accel_lin={:.4} m/s²",
                    gyro_norm,
                    accel_norm
                );
            }
        } else {
            if entering {
                self.static_enter_count = self.static_enter_count.saturating_add(1);
            } else {
                self.static_enter_count = 0;
            }
            if self.static_enter_count >= zupt.enter_frames.max(1) {
                is_static = true;
                self.static_enter_count = 0;
                tracing::info!(
                    "ESKF ZUPT: 进入静止状态 | gyro={:.4} rad/s | accel_lin={:.4} m/s²",
                    gyro_norm,
                    accel_norm
                );
            }
        }

        self.last_is_static = Some(is_static);
        is_static
    }
}

/// Clamp a millisecond time delta to `[dt_min_ms, dt_max_ms]` and convert to seconds.
fn clamp_dt_s(delta_ms: u64, dt_min_ms: u64, dt_max_ms: u64) -> f64 {
    let lower = dt_min_ms.max(1);
    let upper = dt_max_ms.max(lower);
    let clamped = delta_ms.clamp(lower, upper);
    clamped as f64 / 1000.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::processor::navigator::types::{
        EskfConfig, NavigatorImplType, TrajectoryConfig, ZuptConfig,
    };

    fn test_config() -> NavigatorConfig {
        NavigatorConfig {
            gravity: 9.80665,
            trajectory: TrajectoryConfig {
                passby: false,
                dt_max_ms: 1000,
                ..TrajectoryConfig::default()
            },
            zupt: ZuptConfig {
                passby: false,
                gyro_enter_thresh: 0.15,
                accel_enter_thresh: 0.22,
                gyro_exit_thresh: 0.2,
                accel_exit_thresh: 0.3,
                enter_frames: 1,
                exit_frames: 1,
                ..ZuptConfig::default()
            },
            navigator_impl: NavigatorImplType::Eskf,
            eskf: EskfConfig::default(),
        }
    }

    #[test]
    fn eskf_static_converges_velocity_to_zero() {
        let mut nav = EskfNavigator::new(test_config());
        let attitude = DQuat::IDENTITY;
        let gravity = 9.80665;

        // Feed several static samples
        for i in 0..20 {
            let sample = ImuSampleFiltered {
                timestamp_ms: i * 20,
                accel_lp: DVec3::new(0.0, 0.0, gravity + 0.01),
                gyro_lp: DVec3::new(0.005, 0.005, 0.005),
            };
            nav.update(attitude, &sample);
        }

        // After many ZUPT updates, velocity should be very close to zero
        assert!(
            nav.nav_state.velocity.length() < 0.05,
            "velocity should converge toward zero, got length={}",
            nav.nav_state.velocity.length()
        );
    }

    #[test]
    fn eskf_reset_clears_state() {
        let mut nav = EskfNavigator::new(test_config());
        let attitude = DQuat::IDENTITY;
        let gravity = 9.80665;

        let sample = ImuSampleFiltered {
            timestamp_ms: 0,
            accel_lp: DVec3::new(0.0, 0.0, gravity + 1.0),
            gyro_lp: DVec3::new(0.0, 0.0, 0.3),
        };
        nav.update(attitude, &sample);

        let sample2 = ImuSampleFiltered {
            timestamp_ms: 100,
            accel_lp: DVec3::new(0.0, 0.0, gravity + 1.0),
            gyro_lp: DVec3::new(0.0, 0.0, 0.3),
        };
        nav.update(attitude, &sample2);

        nav.reset();

        assert!(nav.nav_state.velocity.length() < 1e-12);
        assert!(nav.nav_state.position.length() < 1e-12);
        assert!(nav.bias_gyro.length() < 1e-12);
        assert!(nav.bias_accel.length() < 1e-12);
        assert!(nav.last_timestamp_ms.is_none());
    }
}
