#![allow(clippy::many_single_char_names)]

mod common;
pub mod dquat;
pub mod dvec2;
pub mod dvec3;
pub mod dvec4;

pub use dquat::DQuat;
pub use dvec2::DVec2;
pub use dvec3::DVec3;
pub use dvec4::DVec4;

pub mod f64 {
    pub use core::f64::consts;
}

