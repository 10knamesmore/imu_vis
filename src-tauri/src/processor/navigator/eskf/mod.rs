//! 误差状态卡尔曼滤波（ESKF）导航器实现。
//!
//! # 算法概览
//!
//! ESKF（误差状态卡尔曼滤波）也称为间接卡尔曼滤波，是惯性导航中广泛使用的融合算法。
//! 与直接估计完整导航状态的直接（扩展）卡尔曼滤波不同，ESKF 维护两套并行表示：
//!
//! 1. **名义状态** — 通过标准机械化方程传播（四元数积分、速度/位置积分）。
//!    这是对真实状态的“最佳估计”，也是对外输出给使用方的状态。
//!
//! 2. **误差状态** — 一个小扰动向量 δx，用于表示名义状态与真实状态之间的偏差。
//!    卡尔曼滤波器作用在该误差状态上；由于误差保持较小，因此适合线性化处理。
//!
//! # 为什么是 15 维状态？
//!
//! 误差状态向量 δx 包含 15 个元素，由五个三维向量组成：
//!
//! | 索引 | 符号 | 含义                         | 单位   |
//! |------|------|------------------------------|--------|
//! | 0..3 | δθ   | 姿态误差（旋转向量）         | rad    |
//! | 3..6 | δv   | 速度误差                     | m/s    |
//! | 6..9 | δp   | 位置误差                     | m      |
//! | 9..12 | δb_g | 陀螺仪偏差误差              | rad/s  |
//! | 12..15 | δb_a | 加速度计偏差误差           | m/s²   |
//!
//! 偏差状态使滤波器能够估计并补偿缓慢漂移的传感器偏差，这是相对于简单直接积分加 ZUPT
//! 硬约束方案的主要优势。
//!
//! # 与直接积分（旧导航器）的区别
//!
//! 旧导航器执行：
//! - 对加速度计数据直接二次积分
//! - 检测到静止时对速度硬归零或执行指数衰减
//! - 不估计传感器偏差
//!
//! ESKF 则会：
//! - 跟踪完整的 15x15 估计不确定性协方差矩阵
//! - 使用最优（Kalman）增益融合 ZUPT 观测
//! - 在线估计陀螺仪和加速度计偏差
//! - 按不确定性大小生成统计上一致的修正量
//!
//! # 预测 / 更新循环
//!
//! 每个 IMU 采样都会触发：
//!
//! 1. **名义状态传播**：使用偏差修正后的加速度计数据积分速度和位置（物理模型与旧实现相同，
//!    但会扣除偏差）。
//!
//! 2. **误差协方差预测**：通过 `P = F*P*Fᵀ + Q` 传播 P，其中 F 是线性化后的误差状态动力学，
//!    Q 是过程噪声。
//!
//! 3. **ZUPT 检测**：基于迟滞的静止检测（逻辑与旧版 SmoothHysteresis 相同）。
//!
//! 4. **量测更新**（若静止）：根据 P 和 ZUPT 观测模型计算 Kalman 增益，修正误差状态，
//!    将修正量注入名义状态，并更新 P。

/// 手写的 15x15 矩阵和 15 元向量类型。
pub mod matrix;
/// ESKF 预测步骤（F 矩阵、Q 矩阵、协方差传播）。
pub mod predict;
/// ESKF ZUPT 量测更新步骤。
pub mod update;

use math_f64::{DQuat, DVec3};

use self::matrix::Mat15;
use self::predict::{build_f_matrix, build_q_matrix, propagate_covariance};
use self::update::{apply_state_injection, zupt_update};
use crate::processor::filter::ImuSampleFiltered;
use crate::processor::navigator::types::{NavState, NavigatorConfig};

/// 基于 ESKF 的惯性导航器。
///
/// 将名义状态机械化与误差状态卡尔曼滤波结合，用于最优的 ZUPT 辅助行人航位推算。
/// 在线估计并补偿陀螺仪和加速度计偏差。
///
/// 算法细节见模块级文档。
pub struct EskfNavigator {
    /// 导航器配置（轨迹、ZUPT、重力、ESKF 参数）。
    config: NavigatorConfig,
    /// 当前名义导航状态（位置、速度、姿态）。
    nav_state: NavState,
    /// 世界坐标系中的重力参考向量。
    gravity_ref: DVec3,
    /// 估计的陀螺仪偏差 (rad/s)。
    bias_gyro: DVec3,
    /// 估计的加速度计偏差 (m/s²)。
    bias_accel: DVec3,
    /// 15x15 误差状态协方差矩阵。
    covariance: Mat15,
    /// 上一次处理样本的时间戳 (ms)。
    last_timestamp_ms: Option<u64>,
    /// 用于迟滞判断的上一次静止检测结果。
    last_is_static: Option<bool>,
    /// 进入静止状态的计数器（迟滞）。
    static_enter_count: u32,
    /// 退出静止状态的计数器（迟滞）。
    static_exit_count: u32,
    /// 上一帧世界坐标系线性加速度（用于梯形积分）。
    last_accel_lin: Option<DVec3>,

    // —— 诊断用字段 ——
    /// 最近一帧 ZUPT 检测的陀螺仪范数 (rad/s)。
    diag_gyro_norm: f64,
    /// 最近一帧 ZUPT 检测的线加速度范数 (m/s²)。
    diag_accel_norm: f64,
    /// 最近一帧的世界系线性加速度 (m/s²)。
    diag_linear_accel: DVec3,
    /// 当前积分步长 (s)。
    diag_dt: f64,
    /// 最近一次 ZUPT 更新的创新向量。
    diag_last_innovation: Option<DVec3>,
}

impl EskfNavigator {
    /// 使用给定配置创建新的 ESKF 导航器。
    ///
    /// 根据 [`EskfConfig`](crate::processor::navigator::types::EskfConfig) 中的
    /// `init_sigma_*` 字段初始化协方差矩阵。
    pub fn new(config: NavigatorConfig) -> Self {
        let gravity = config.gravity;
        let eskf = &config.eskf;

        // 根据配置的初始标准差构建初始协方差。
        let sa = eskf.init_sigma_attitude;
        let sv = eskf.init_sigma_velocity;
        let sp = eskf.init_sigma_position;
        let sbg = eskf.init_sigma_gyro_bias;
        let sba = eskf.init_sigma_accel_bias;
        let init_diag = [
            sa * sa, sa * sa, sa * sa, // 姿态
            sv * sv, sv * sv, sv * sv, // 速度
            sp * sp, sp * sp, sp * sp, // 位置
            sbg * sbg, sbg * sbg, sbg * sbg, // 陀螺仪偏差
            sba * sba, sba * sba, sba * sba, // 加速度计偏差
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
            diag_gyro_norm: 0.0,
            diag_accel_norm: 0.0,
            diag_linear_accel: DVec3::ZERO,
            diag_dt: 0.0,
            diag_last_innovation: None,
        }
    }

    /// 使用一个 IMU 样本更新导航器，并返回当前状态。
    ///
    /// 执行完整 ESKF 循环：
    /// 1. 根据时间戳计算 dt
    /// 2. 名义状态传播（偏差修正后的积分）
    /// 3. 误差协方差预测（F、Q、P 传播）
    /// 4. ZUPT 检测（迟滞）
    /// 5. 若静止：执行 ZUPT 量测更新和状态注入
    pub fn update(&mut self, attitude: DQuat, sample: &ImuSampleFiltered) -> NavState {
        self.nav_state.attitude = attitude;
        self.nav_state.timestamp_ms = sample.timestamp_ms;

        if self.config.trajectory.passby {
            self.last_timestamp_ms = Some(sample.timestamp_ms);
            return self.nav_state;
        }

        // --- 步骤 1：计算 dt ---
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
            self.diag_dt = 0.0;
            return self.nav_state;
        }
        self.diag_dt = dt;

        // --- 步骤 2：名义状态传播（梯形积分） ---
        // 从原始（滤波后）量测中扣除估计偏差。
        let accel_corrected = sample.accel_lp - self.bias_accel;
        let a_world = attitude.rotate_vec3(accel_corrected);
        let a_lin = a_world - self.gravity_ref;
        self.diag_linear_accel = a_lin;

        // 梯形积分：对当前和上一帧加速度取平均。
        let a_prev = self.last_accel_lin.unwrap_or(a_lin);
        let v_prev = self.nav_state.velocity;
        let v_next = v_prev + (a_prev + a_lin) * (0.5 * dt);
        self.nav_state.velocity = v_next;
        self.nav_state.position += (v_prev + v_next) * (0.5 * dt);
        self.last_accel_lin = Some(a_lin);

        // --- 步骤 3：误差协方差预测 ---
        let f = build_f_matrix(attitude, a_lin, dt);
        let q = build_q_matrix(&self.config.eskf, dt);
        self.covariance = propagate_covariance(&self.covariance, &f, &q);

        // --- 步骤 4：ZUPT 检测（迟滞） ---
        //
        // 静止检测用不依赖 bias_accel 估计的线加速度范数，避免 bias 估计
        // 跑偏时 ZUPT 永不触发。
        let gyro_norm = sample.gyro_lp.length();
        let a_world_raw = attitude.rotate_vec3(sample.accel_lp);
        let a_lin_raw = a_world_raw - self.gravity_ref;
        let accel_norm = a_lin_raw.length();
        self.diag_gyro_norm = gyro_norm;
        self.diag_accel_norm = accel_norm;
        self.diag_last_innovation = None; // 每帧重置，仅 ZUPT 帧有值
        let is_static = self.detect_static(gyro_norm, accel_norm);

        // --- 步骤 5：ZUPT 量测更新 ---
        if is_static {
            // 创新向量 = 观测值 - 预测值 = 0 - v_nominal
            self.diag_last_innovation = Some(-self.nav_state.velocity);
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

            // 静止时硬归零速度。
            //
            // 理论上 Kalman 修正后的速度应该接近零，但实际中由于加速度计残差
            // 持续被积分，速度会在零附近偏移（甚至线性增长）。直接归零避免位置
            // 因小幅速度残差而持续漂移。
            //
            // 注意：协方差和偏差估计仍通过上面的 zupt_update/apply_state_injection
            // 正常更新，硬归零只影响最终的名义速度。
            self.nav_state.velocity = DVec3::ZERO;
            self.last_accel_lin = None;

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

    // —— 诊断访问器 ——

    /// 最近一帧 ZUPT 检测的陀螺仪范数 (rad/s)。
    pub fn zupt_gyro_norm(&self) -> f64 {
        self.diag_gyro_norm
    }

    /// 最近一帧 ZUPT 检测的线加速度范数 (m/s²)。
    pub fn zupt_accel_norm(&self) -> f64 {
        self.diag_accel_norm
    }

    /// 迟滞进入计数器。
    pub fn zupt_enter_count(&self) -> u32 {
        self.static_enter_count
    }

    /// 迟滞退出计数器。
    pub fn zupt_exit_count(&self) -> u32 {
        self.static_exit_count
    }

    /// 当前积分步长 (s)。
    pub fn current_dt(&self) -> f64 {
        self.diag_dt
    }

    /// 最近一帧世界系线性加速度 (m/s²)。
    pub fn last_linear_accel(&self) -> DVec3 {
        self.diag_linear_accel
    }

    /// ESKF 协方差对角线（15 个值）。
    pub fn eskf_cov_diag(&self) -> [f64; 15] {
        self.covariance.diagonal()
    }

    /// ESKF 估计的陀螺偏差 (rad/s)。
    pub fn eskf_bias_gyro(&self) -> DVec3 {
        self.bias_gyro
    }

    /// ESKF 估计的加速度计偏差 (m/s²)。
    pub fn eskf_bias_accel(&self) -> DVec3 {
        self.bias_accel
    }

    /// 取出并清除上次 ZUPT 更新的创新向量。
    pub fn take_last_innovation(&mut self) -> Option<DVec3> {
        self.diag_last_innovation.take()
    }

    /// 返回导航器当前是否检测到静止状态。
    pub fn is_static(&self) -> bool {
        self.last_is_static.unwrap_or(false)
    }

    /// 在姿态零点校准后设置重力参考向量。
    ///
    /// `quat_offset` 是用于轴对齐的左乘四元数。
    /// 重力向量会被旋转到与校准后的参考坐标系一致。
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

    /// 手动设置位置（例如用于坐标校正）。
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

    /// 将所有内部状态重置为初始值。
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
        self.diag_gyro_norm = 0.0;
        self.diag_accel_norm = 0.0;
        self.diag_linear_accel = DVec3::ZERO;
        self.diag_dt = 0.0;
        self.diag_last_innovation = None;

        tracing::info!("ESKF 导航器已重置");
    }

    /// 基于迟滞的 ZUPT 静止检测。
    ///
    /// 使用进入/退出阈值和帧计数器，避免静止与运动状态之间快速抖动。
    /// 该逻辑与旧版 `SmoothHysteresis` 检测相同，但不包含平滑衰减修正。
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

/// 将毫秒时间差限制在 `[dt_min_ms, dt_max_ms]` 范围内，并转换为秒。
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

        // 输入若干静止样本。
        for i in 0..20 {
            let sample = ImuSampleFiltered {
                timestamp_ms: i * 20,
                accel_lp: DVec3::new(0.0, 0.0, gravity + 0.01),
                gyro_lp: DVec3::new(0.005, 0.005, 0.005),
            };
            nav.update(attitude, &sample);
        }

        // 多次 ZUPT 更新后，速度应非常接近零。
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
