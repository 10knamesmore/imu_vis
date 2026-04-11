//! device_calibrations 表实体。

use sea_orm::entity::prelude::*;

/// 设备标定数据模型。
#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "device_calibrations")]
pub struct Model {
    /// 设备 ID（蓝牙 UUID）。
    #[sea_orm(primary_key, auto_increment = false)]
    pub device_id: String,
    /// 加速度计 X 轴偏置。
    pub accel_bias_x: f64,
    /// 加速度计 Y 轴偏置。
    pub accel_bias_y: f64,
    /// 加速度计 Z 轴偏置。
    pub accel_bias_z: f64,
    /// 加速度计 X 轴比例因子（2g/(a⁺-a⁻)）。
    pub accel_scale_x: f64,
    /// 加速度计 Y 轴比例因子。
    pub accel_scale_y: f64,
    /// 加速度计 Z 轴比例因子。
    pub accel_scale_z: f64,
    /// 陀螺仪 X 轴零偏（rad/s）。
    pub gyro_bias_x: f64,
    /// 陀螺仪 Y 轴零偏（rad/s）。
    pub gyro_bias_y: f64,
    /// 陀螺仪 Z 轴零偏（rad/s）。
    pub gyro_bias_z: f64,
    /// 标定质量误差（max |‖a_cal‖ - g|）。
    pub quality_error: f64,
    /// 标定时间戳（ms）。
    pub created_at_ms: i64,
}

/// 无关联关系。
#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
