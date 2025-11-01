use serde::Serialize;

use crate::processor::{parser::data::IMUData, CalculatedData};

#[derive(Debug, Serialize)]
pub struct ResponseData {
    raw_data: IMUData,
    calculated_data: CalculatedData,
}

impl ResponseData {
    pub fn from_parts(raw_data: &IMUData, calculated_data: &CalculatedData) -> Self {
        Self {
            raw_data: *raw_data,
            calculated_data: *calculated_data,
        }
    }
}
