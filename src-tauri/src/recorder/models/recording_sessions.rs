//! recording_sessions 表实体。

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "recording_sessions")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub started_at_ms: i64,
    pub stopped_at_ms: Option<i64>,
    pub device_id: Option<String>,
    pub name: Option<String>,
    pub tags: Option<String>,
    pub sample_count: i64,
}

#[derive(Copy, Clone, Debug, EnumIter)]
pub enum Relation {
    ImuSamples,
}

impl RelationTrait for Relation {
    fn def(&self) -> RelationDef {
        match self {
            Self::ImuSamples => Entity::has_many(super::imu_samples::Entity).into(),
        }
    }
}

impl ActiveModelBehavior for ActiveModel {}
