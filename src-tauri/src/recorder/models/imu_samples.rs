//! imu_samples 表实体。

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "imu_samples")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub session_id: i64,
    pub timestamp_ms: i64,
    pub accel_no_g_x: f64,
    pub accel_no_g_y: f64,
    pub accel_no_g_z: f64,
    pub accel_with_g_x: f64,
    pub accel_with_g_y: f64,
    pub accel_with_g_z: f64,
    pub gyro_x: f64,
    pub gyro_y: f64,
    pub gyro_z: f64,
    pub quat_w: f64,
    pub quat_x: f64,
    pub quat_y: f64,
    pub quat_z: f64,
    pub angle_x: f64,
    pub angle_y: f64,
    pub angle_z: f64,
    pub offset_x: f64,
    pub offset_y: f64,
    pub offset_z: f64,
    pub accel_nav_x: f64,
    pub accel_nav_y: f64,
    pub accel_nav_z: f64,
    pub calc_attitude_w: f64,
    pub calc_attitude_x: f64,
    pub calc_attitude_y: f64,
    pub calc_attitude_z: f64,
    pub calc_velocity_x: f64,
    pub calc_velocity_y: f64,
    pub calc_velocity_z: f64,
    pub calc_position_x: f64,
    pub calc_position_y: f64,
    pub calc_position_z: f64,
    pub calc_timestamp_ms: i64,
}

#[derive(Copy, Clone, Debug, EnumIter)]
pub enum Relation {
    RecordingSession,
}

impl RelationTrait for Relation {
    fn def(&self) -> RelationDef {
        match self {
            Self::RecordingSession => Entity::belongs_to(super::recording_sessions::Entity)
                .from(Column::SessionId)
                .to(super::recording_sessions::Column::Id)
                .into(),
        }
    }
}

impl Related<super::recording_sessions::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::RecordingSession.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
