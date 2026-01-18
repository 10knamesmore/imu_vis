use serde::Serialize;

use crate::processor::{parser::data::IMUData, CalculatedData};

#[derive(Debug, Clone, Copy, Serialize)]
pub struct ResponseData {
    pub raw_data: IMUData,
    pub calculated_data: CalculatedData,
}

impl ResponseData {
    pub fn from_parts(raw_data: &IMUData, calculated_data: &CalculatedData) -> Self {
        Self {
            raw_data: *raw_data,
            calculated_data: *calculated_data,
        }
    }
}
