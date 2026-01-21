use math_f64::DVec3;
use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct EkfConfig {
    pub enabled: bool,
}

impl Default for EkfConfig {
    fn default() -> Self {
        Self { enabled: false }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ErrorState {
    pub delta_p: DVec3,
    pub delta_v: DVec3,
    pub delta_theta: DVec3,
    pub delta_b_g: DVec3,
    pub delta_b_a: DVec3,
}

#[derive(Debug, Clone, Copy)]
pub struct EkfState {
    pub p: [[f64; 15]; 15],
}
