#![allow(clippy::many_single_char_names)]

use core::ops::{
    Add, AddAssign, Div, DivAssign, Index, IndexMut, Mul, MulAssign, Neg, Sub, SubAssign,
};
use serde::{Deserialize, Serialize};

pub mod f64 {
    pub use core::f64::consts;
}

const NORMALIZE_EPSILON: f64 = 1.0e-15;

#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
#[repr(C)]
pub struct DVec2 {
    pub x: f64,
    pub y: f64,
}

impl DVec2 {
    pub const ZERO: Self = Self { x: 0.0, y: 0.0 };
    pub const ONE: Self = Self { x: 1.0, y: 1.0 };
    pub const X: Self = Self { x: 1.0, y: 0.0 };
    pub const Y: Self = Self { x: 0.0, y: 1.0 };

    pub const fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    pub const fn splat(v: f64) -> Self {
        Self { x: v, y: v }
    }

    pub fn dot(self, rhs: Self) -> f64 {
        self.x * rhs.x + self.y * rhs.y
    }

    pub fn length(self) -> f64 {
        self.length_squared().sqrt()
    }

    pub fn length_squared(self) -> f64 {
        self.dot(self)
    }

    pub fn length_recip(self) -> f64 {
        1.0 / self.length()
    }

    pub fn normalize(self) -> Self {
        let len = self.length();
        if len <= NORMALIZE_EPSILON {
            Self::ZERO
        } else {
            self / len
        }
    }

    pub fn normalize_or_zero(self) -> Self {
        self.normalize()
    }

    pub fn normalize_or(self, fallback: Self) -> Self {
        let len = self.length();
        if len <= NORMALIZE_EPSILON {
            fallback
        } else {
            self / len
        }
    }

    pub fn distance(self, rhs: Self) -> f64 {
        (self - rhs).length()
    }

    pub fn distance_squared(self, rhs: Self) -> f64 {
        (self - rhs).length_squared()
    }

    pub fn min(self, rhs: Self) -> Self {
        Self::new(self.x.min(rhs.x), self.y.min(rhs.y))
    }

    pub fn max(self, rhs: Self) -> Self {
        Self::new(self.x.max(rhs.x), self.y.max(rhs.y))
    }

    pub fn clamp(self, min: Self, max: Self) -> Self {
        Self::new(self.x.clamp(min.x, max.x), self.y.clamp(min.y, max.y))
    }

    pub fn abs(self) -> Self {
        Self::new(self.x.abs(), self.y.abs())
    }

    pub fn signum(self) -> Self {
        Self::new(self.x.signum(), self.y.signum())
    }

    pub fn recip(self) -> Self {
        Self::new(self.x.recip(), self.y.recip())
    }

    pub fn floor(self) -> Self {
        Self::new(self.x.floor(), self.y.floor())
    }

    pub fn ceil(self) -> Self {
        Self::new(self.x.ceil(), self.y.ceil())
    }

    pub fn round(self) -> Self {
        Self::new(self.x.round(), self.y.round())
    }

    pub fn lerp(self, rhs: Self, s: f64) -> Self {
        self + (rhs - self) * s
    }

    pub fn clamp_length(self, min: f64, max: f64) -> Self {
        let len = self.length();
        if len <= NORMALIZE_EPSILON {
            self
        } else {
            self * (len.clamp(min, max) / len)
        }
    }

    pub fn clamp_length_min(self, min: f64) -> Self {
        let len = self.length();
        if len <= NORMALIZE_EPSILON {
            self
        } else if len < min {
            self * (min / len)
        } else {
            self
        }
    }

    pub fn clamp_length_max(self, max: f64) -> Self {
        let len = self.length();
        if len <= NORMALIZE_EPSILON {
            self
        } else if len > max {
            self * (max / len)
        } else {
            self
        }
    }

    pub fn project_onto(self, rhs: Self) -> Self {
        let denom = rhs.length_squared();
        if denom <= NORMALIZE_EPSILON {
            Self::ZERO
        } else {
            rhs * (self.dot(rhs) / denom)
        }
    }

    pub fn reject_from(self, rhs: Self) -> Self {
        self - self.project_onto(rhs)
    }

    pub fn reflect(self, normal: Self) -> Self {
        self - 2.0 * self.dot(normal) * normal
    }

    pub fn angle_between(self, rhs: Self) -> f64 {
        let denom = self.length() * rhs.length();
        if denom <= NORMALIZE_EPSILON {
            0.0
        } else {
            let cos = (self.dot(rhs) / denom).clamp(-1.0, 1.0);
            cos.acos()
        }
    }

    pub fn min_element(self) -> f64 {
        self.x.min(self.y)
    }

    pub fn max_element(self) -> f64 {
        self.x.max(self.y)
    }

    pub const fn to_array(self) -> [f64; 2] {
        [self.x, self.y]
    }

    pub const fn from_array(v: [f64; 2]) -> Self {
        Self::new(v[0], v[1])
    }

    pub fn to_le_bytes(self) -> [u8; 16] {
        let mut out = [0u8; 16];
        out[..8].copy_from_slice(&self.x.to_le_bytes());
        out[8..].copy_from_slice(&self.y.to_le_bytes());
        out
    }

    pub fn from_le_bytes(bytes: [u8; 16]) -> Self {
        let x = f64::from_le_bytes(bytes[..8].try_into().expect("slice length"));
        let y = f64::from_le_bytes(bytes[8..].try_into().expect("slice length"));
        Self::new(x, y)
    }

    pub fn is_finite(self) -> bool {
        self.x.is_finite() && self.y.is_finite()
    }

    pub fn is_nan(self) -> bool {
        self.x.is_nan() || self.y.is_nan()
    }

    pub fn is_normalized(self) -> bool {
        (self.length_squared() - 1.0).abs() <= 1.0e-12
    }
}

impl Index<usize> for DVec2 {
    type Output = f64;

    fn index(&self, index: usize) -> &Self::Output {
        match index {
            0 => &self.x,
            1 => &self.y,
            _ => panic!("DVec2 index out of bounds"),
        }
    }
}

impl IndexMut<usize> for DVec2 {
    fn index_mut(&mut self, index: usize) -> &mut Self::Output {
        match index {
            0 => &mut self.x,
            1 => &mut self.y,
            _ => panic!("DVec2 index out of bounds"),
        }
    }
}

impl Add for DVec2 {
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        Self::new(self.x + rhs.x, self.y + rhs.y)
    }
}

impl AddAssign for DVec2 {
    fn add_assign(&mut self, rhs: Self) {
        self.x += rhs.x;
        self.y += rhs.y;
    }
}

impl Sub for DVec2 {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self::Output {
        Self::new(self.x - rhs.x, self.y - rhs.y)
    }
}

impl SubAssign for DVec2 {
    fn sub_assign(&mut self, rhs: Self) {
        self.x -= rhs.x;
        self.y -= rhs.y;
    }
}

impl Mul for DVec2 {
    type Output = Self;

    fn mul(self, rhs: Self) -> Self::Output {
        Self::new(self.x * rhs.x, self.y * rhs.y)
    }
}

impl MulAssign for DVec2 {
    fn mul_assign(&mut self, rhs: Self) {
        self.x *= rhs.x;
        self.y *= rhs.y;
    }
}

impl Mul<f64> for DVec2 {
    type Output = Self;

    fn mul(self, rhs: f64) -> Self::Output {
        Self::new(self.x * rhs, self.y * rhs)
    }
}

impl Mul<DVec2> for f64 {
    type Output = DVec2;

    fn mul(self, rhs: DVec2) -> Self::Output {
        rhs * self
    }
}

impl MulAssign<f64> for DVec2 {
    fn mul_assign(&mut self, rhs: f64) {
        self.x *= rhs;
        self.y *= rhs;
    }
}

impl Div for DVec2 {
    type Output = Self;

    fn div(self, rhs: Self) -> Self::Output {
        Self::new(self.x / rhs.x, self.y / rhs.y)
    }
}

impl DivAssign for DVec2 {
    fn div_assign(&mut self, rhs: Self) {
        self.x /= rhs.x;
        self.y /= rhs.y;
    }
}

impl Div<f64> for DVec2 {
    type Output = Self;

    fn div(self, rhs: f64) -> Self::Output {
        Self::new(self.x / rhs, self.y / rhs)
    }
}

impl DivAssign<f64> for DVec2 {
    fn div_assign(&mut self, rhs: f64) {
        self.x /= rhs;
        self.y /= rhs;
    }
}

impl Neg for DVec2 {
    type Output = Self;

    fn neg(self) -> Self::Output {
        Self::new(-self.x, -self.y)
    }
}

impl From<[f64; 2]> for DVec2 {
    fn from(value: [f64; 2]) -> Self {
        Self::from_array(value)
    }
}

impl From<(f64, f64)> for DVec2 {
    fn from(value: (f64, f64)) -> Self {
        Self::new(value.0, value.1)
    }
}

impl From<DVec2> for [f64; 2] {
    fn from(value: DVec2) -> Self {
        value.to_array()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
#[repr(C)]
pub struct DVec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl DVec3 {
    pub const ZERO: Self = Self::new(0.0, 0.0, 0.0);
    pub const ONE: Self = Self::new(1.0, 1.0, 1.0);
    pub const X: Self = Self::new(1.0, 0.0, 0.0);
    pub const Y: Self = Self::new(0.0, 1.0, 0.0);
    pub const Z: Self = Self::new(0.0, 0.0, 1.0);

    pub const fn new(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }

    pub const fn splat(v: f64) -> Self {
        Self::new(v, v, v)
    }

    pub fn dot(self, rhs: Self) -> f64 {
        self.x * rhs.x + self.y * rhs.y + self.z * rhs.z
    }

    pub fn cross(self, rhs: Self) -> Self {
        Self::new(
            self.y * rhs.z - self.z * rhs.y,
            self.z * rhs.x - self.x * rhs.z,
            self.x * rhs.y - self.y * rhs.x,
        )
    }

    pub fn length(self) -> f64 {
        self.length_squared().sqrt()
    }

    pub fn length_squared(self) -> f64 {
        self.dot(self)
    }

    pub fn length_recip(self) -> f64 {
        1.0 / self.length()
    }

    pub fn normalize(self) -> Self {
        let len = self.length();
        if len <= NORMALIZE_EPSILON {
            Self::ZERO
        } else {
            self / len
        }
    }

    pub fn normalize_or_zero(self) -> Self {
        self.normalize()
    }

    pub fn normalize_or(self, fallback: Self) -> Self {
        let len = self.length();
        if len <= NORMALIZE_EPSILON {
            fallback
        } else {
            self / len
        }
    }

    pub fn distance(self, rhs: Self) -> f64 {
        (self - rhs).length()
    }

    pub fn distance_squared(self, rhs: Self) -> f64 {
        (self - rhs).length_squared()
    }

    pub fn min(self, rhs: Self) -> Self {
        Self::new(self.x.min(rhs.x), self.y.min(rhs.y), self.z.min(rhs.z))
    }

    pub fn max(self, rhs: Self) -> Self {
        Self::new(self.x.max(rhs.x), self.y.max(rhs.y), self.z.max(rhs.z))
    }

    pub fn clamp(self, min: Self, max: Self) -> Self {
        Self::new(
            self.x.clamp(min.x, max.x),
            self.y.clamp(min.y, max.y),
            self.z.clamp(min.z, max.z),
        )
    }

    pub fn abs(self) -> Self {
        Self::new(self.x.abs(), self.y.abs(), self.z.abs())
    }

    pub fn signum(self) -> Self {
        Self::new(self.x.signum(), self.y.signum(), self.z.signum())
    }

    pub fn recip(self) -> Self {
        Self::new(self.x.recip(), self.y.recip(), self.z.recip())
    }

    pub fn floor(self) -> Self {
        Self::new(self.x.floor(), self.y.floor(), self.z.floor())
    }

    pub fn ceil(self) -> Self {
        Self::new(self.x.ceil(), self.y.ceil(), self.z.ceil())
    }

    pub fn round(self) -> Self {
        Self::new(self.x.round(), self.y.round(), self.z.round())
    }

    pub fn lerp(self, rhs: Self, s: f64) -> Self {
        self + (rhs - self) * s
    }

    pub fn clamp_length(self, min: f64, max: f64) -> Self {
        let len = self.length();
        if len <= NORMALIZE_EPSILON {
            self
        } else {
            self * (len.clamp(min, max) / len)
        }
    }

    pub fn clamp_length_min(self, min: f64) -> Self {
        let len = self.length();
        if len <= NORMALIZE_EPSILON {
            self
        } else if len < min {
            self * (min / len)
        } else {
            self
        }
    }

    pub fn clamp_length_max(self, max: f64) -> Self {
        let len = self.length();
        if len <= NORMALIZE_EPSILON {
            self
        } else if len > max {
            self * (max / len)
        } else {
            self
        }
    }

    pub fn project_onto(self, rhs: Self) -> Self {
        let denom = rhs.length_squared();
        if denom <= NORMALIZE_EPSILON {
            Self::ZERO
        } else {
            rhs * (self.dot(rhs) / denom)
        }
    }

    pub fn reject_from(self, rhs: Self) -> Self {
        self - self.project_onto(rhs)
    }

    pub fn reflect(self, normal: Self) -> Self {
        self - 2.0 * self.dot(normal) * normal
    }

    pub fn angle_between(self, rhs: Self) -> f64 {
        let denom = self.length() * rhs.length();
        if denom <= NORMALIZE_EPSILON {
            0.0
        } else {
            let cos = (self.dot(rhs) / denom).clamp(-1.0, 1.0);
            cos.acos()
        }
    }

    pub fn min_element(self) -> f64 {
        self.x.min(self.y.min(self.z))
    }

    pub fn max_element(self) -> f64 {
        self.x.max(self.y.max(self.z))
    }

    pub const fn to_array(self) -> [f64; 3] {
        [self.x, self.y, self.z]
    }

    pub const fn from_array(v: [f64; 3]) -> Self {
        Self::new(v[0], v[1], v[2])
    }

    pub fn to_le_bytes(self) -> [u8; 24] {
        let mut out = [0u8; 24];
        out[..8].copy_from_slice(&self.x.to_le_bytes());
        out[8..16].copy_from_slice(&self.y.to_le_bytes());
        out[16..].copy_from_slice(&self.z.to_le_bytes());
        out
    }

    pub fn from_le_bytes(bytes: [u8; 24]) -> Self {
        let x = f64::from_le_bytes(bytes[..8].try_into().expect("slice length"));
        let y = f64::from_le_bytes(bytes[8..16].try_into().expect("slice length"));
        let z = f64::from_le_bytes(bytes[16..].try_into().expect("slice length"));
        Self::new(x, y, z)
    }

    pub fn is_finite(self) -> bool {
        self.x.is_finite() && self.y.is_finite() && self.z.is_finite()
    }

    pub fn is_nan(self) -> bool {
        self.x.is_nan() || self.y.is_nan() || self.z.is_nan()
    }

    pub fn is_normalized(self) -> bool {
        (self.length_squared() - 1.0).abs() <= 1.0e-12
    }
}

impl Index<usize> for DVec3 {
    type Output = f64;

    fn index(&self, index: usize) -> &Self::Output {
        match index {
            0 => &self.x,
            1 => &self.y,
            2 => &self.z,
            _ => panic!("DVec3 index out of bounds"),
        }
    }
}

impl IndexMut<usize> for DVec3 {
    fn index_mut(&mut self, index: usize) -> &mut Self::Output {
        match index {
            0 => &mut self.x,
            1 => &mut self.y,
            2 => &mut self.z,
            _ => panic!("DVec3 index out of bounds"),
        }
    }
}

impl Add for DVec3 {
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        Self::new(self.x + rhs.x, self.y + rhs.y, self.z + rhs.z)
    }
}

impl AddAssign for DVec3 {
    fn add_assign(&mut self, rhs: Self) {
        self.x += rhs.x;
        self.y += rhs.y;
        self.z += rhs.z;
    }
}

impl Sub for DVec3 {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self::Output {
        Self::new(self.x - rhs.x, self.y - rhs.y, self.z - rhs.z)
    }
}

impl SubAssign for DVec3 {
    fn sub_assign(&mut self, rhs: Self) {
        self.x -= rhs.x;
        self.y -= rhs.y;
        self.z -= rhs.z;
    }
}

impl Mul for DVec3 {
    type Output = Self;

    fn mul(self, rhs: Self) -> Self::Output {
        Self::new(self.x * rhs.x, self.y * rhs.y, self.z * rhs.z)
    }
}

impl MulAssign for DVec3 {
    fn mul_assign(&mut self, rhs: Self) {
        self.x *= rhs.x;
        self.y *= rhs.y;
        self.z *= rhs.z;
    }
}

impl Mul<f64> for DVec3 {
    type Output = Self;

    fn mul(self, rhs: f64) -> Self::Output {
        Self::new(self.x * rhs, self.y * rhs, self.z * rhs)
    }
}

impl Mul<f64> for &DVec3 {
    type Output = DVec3;

    fn mul(self, rhs: f64) -> Self::Output {
        (*self) * rhs
    }
}

impl Mul<DVec3> for f64 {
    type Output = DVec3;

    fn mul(self, rhs: DVec3) -> Self::Output {
        rhs * self
    }
}

impl Mul<&DVec3> for f64 {
    type Output = DVec3;

    fn mul(self, rhs: &DVec3) -> Self::Output {
        self * (*rhs)
    }
}

impl MulAssign<f64> for DVec3 {
    fn mul_assign(&mut self, rhs: f64) {
        self.x *= rhs;
        self.y *= rhs;
        self.z *= rhs;
    }
}

impl Div for DVec3 {
    type Output = Self;

    fn div(self, rhs: Self) -> Self::Output {
        Self::new(self.x / rhs.x, self.y / rhs.y, self.z / rhs.z)
    }
}

impl DivAssign for DVec3 {
    fn div_assign(&mut self, rhs: Self) {
        self.x /= rhs.x;
        self.y /= rhs.y;
        self.z /= rhs.z;
    }
}

impl Div<f64> for DVec3 {
    type Output = Self;

    fn div(self, rhs: f64) -> Self::Output {
        Self::new(self.x / rhs, self.y / rhs, self.z / rhs)
    }
}

impl DivAssign<f64> for DVec3 {
    fn div_assign(&mut self, rhs: f64) {
        self.x /= rhs;
        self.y /= rhs;
        self.z /= rhs;
    }
}

impl Neg for DVec3 {
    type Output = Self;

    fn neg(self) -> Self::Output {
        Self::new(-self.x, -self.y, -self.z)
    }
}

impl From<[f64; 3]> for DVec3 {
    fn from(value: [f64; 3]) -> Self {
        Self::from_array(value)
    }
}

impl From<(f64, f64, f64)> for DVec3 {
    fn from(value: (f64, f64, f64)) -> Self {
        Self::new(value.0, value.1, value.2)
    }
}

impl From<DVec3> for [f64; 3] {
    fn from(value: DVec3) -> Self {
        value.to_array()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
#[repr(C)]
pub struct DVec4 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub w: f64,
}

impl DVec4 {
    pub const ZERO: Self = Self::new(0.0, 0.0, 0.0, 0.0);
    pub const ONE: Self = Self::new(1.0, 1.0, 1.0, 1.0);
    pub const X: Self = Self::new(1.0, 0.0, 0.0, 0.0);
    pub const Y: Self = Self::new(0.0, 1.0, 0.0, 0.0);
    pub const Z: Self = Self::new(0.0, 0.0, 1.0, 0.0);
    pub const W: Self = Self::new(0.0, 0.0, 0.0, 1.0);

    pub const fn new(x: f64, y: f64, z: f64, w: f64) -> Self {
        Self { x, y, z, w }
    }

    pub const fn splat(v: f64) -> Self {
        Self::new(v, v, v, v)
    }

    pub fn dot(self, rhs: Self) -> f64 {
        self.x * rhs.x + self.y * rhs.y + self.z * rhs.z + self.w * rhs.w
    }

    pub fn length(self) -> f64 {
        self.length_squared().sqrt()
    }

    pub fn length_squared(self) -> f64 {
        self.dot(self)
    }

    pub fn length_recip(self) -> f64 {
        1.0 / self.length()
    }

    pub fn normalize(self) -> Self {
        let len = self.length();
        if len <= NORMALIZE_EPSILON {
            Self::ZERO
        } else {
            self / len
        }
    }

    pub fn normalize_or_zero(self) -> Self {
        self.normalize()
    }

    pub fn normalize_or(self, fallback: Self) -> Self {
        let len = self.length();
        if len <= NORMALIZE_EPSILON {
            fallback
        } else {
            self / len
        }
    }

    pub fn distance(self, rhs: Self) -> f64 {
        (self - rhs).length()
    }

    pub fn distance_squared(self, rhs: Self) -> f64 {
        (self - rhs).length_squared()
    }

    pub fn min(self, rhs: Self) -> Self {
        Self::new(
            self.x.min(rhs.x),
            self.y.min(rhs.y),
            self.z.min(rhs.z),
            self.w.min(rhs.w),
        )
    }

    pub fn max(self, rhs: Self) -> Self {
        Self::new(
            self.x.max(rhs.x),
            self.y.max(rhs.y),
            self.z.max(rhs.z),
            self.w.max(rhs.w),
        )
    }

    pub fn clamp(self, min: Self, max: Self) -> Self {
        Self::new(
            self.x.clamp(min.x, max.x),
            self.y.clamp(min.y, max.y),
            self.z.clamp(min.z, max.z),
            self.w.clamp(min.w, max.w),
        )
    }

    pub fn abs(self) -> Self {
        Self::new(self.x.abs(), self.y.abs(), self.z.abs(), self.w.abs())
    }

    pub fn signum(self) -> Self {
        Self::new(
            self.x.signum(),
            self.y.signum(),
            self.z.signum(),
            self.w.signum(),
        )
    }

    pub fn recip(self) -> Self {
        Self::new(self.x.recip(), self.y.recip(), self.z.recip(), self.w.recip())
    }

    pub fn floor(self) -> Self {
        Self::new(
            self.x.floor(),
            self.y.floor(),
            self.z.floor(),
            self.w.floor(),
        )
    }

    pub fn ceil(self) -> Self {
        Self::new(self.x.ceil(), self.y.ceil(), self.z.ceil(), self.w.ceil())
    }

    pub fn round(self) -> Self {
        Self::new(
            self.x.round(),
            self.y.round(),
            self.z.round(),
            self.w.round(),
        )
    }

    pub fn lerp(self, rhs: Self, s: f64) -> Self {
        self + (rhs - self) * s
    }

    pub fn clamp_length(self, min: f64, max: f64) -> Self {
        let len = self.length();
        if len <= NORMALIZE_EPSILON {
            self
        } else {
            self * (len.clamp(min, max) / len)
        }
    }

    pub fn clamp_length_min(self, min: f64) -> Self {
        let len = self.length();
        if len <= NORMALIZE_EPSILON {
            self
        } else if len < min {
            self * (min / len)
        } else {
            self
        }
    }

    pub fn clamp_length_max(self, max: f64) -> Self {
        let len = self.length();
        if len <= NORMALIZE_EPSILON {
            self
        } else if len > max {
            self * (max / len)
        } else {
            self
        }
    }

    pub fn project_onto(self, rhs: Self) -> Self {
        let denom = rhs.length_squared();
        if denom <= NORMALIZE_EPSILON {
            Self::ZERO
        } else {
            rhs * (self.dot(rhs) / denom)
        }
    }

    pub fn reject_from(self, rhs: Self) -> Self {
        self - self.project_onto(rhs)
    }

    pub fn reflect(self, normal: Self) -> Self {
        self - 2.0 * self.dot(normal) * normal
    }

    pub fn angle_between(self, rhs: Self) -> f64 {
        let denom = self.length() * rhs.length();
        if denom <= NORMALIZE_EPSILON {
            0.0
        } else {
            let cos = (self.dot(rhs) / denom).clamp(-1.0, 1.0);
            cos.acos()
        }
    }

    pub fn min_element(self) -> f64 {
        self.x.min(self.y.min(self.z.min(self.w)))
    }

    pub fn max_element(self) -> f64 {
        self.x.max(self.y.max(self.z.max(self.w)))
    }

    pub const fn to_array(self) -> [f64; 4] {
        [self.x, self.y, self.z, self.w]
    }

    pub const fn from_array(v: [f64; 4]) -> Self {
        Self::new(v[0], v[1], v[2], v[3])
    }

    pub fn to_le_bytes(self) -> [u8; 32] {
        let mut out = [0u8; 32];
        out[..8].copy_from_slice(&self.x.to_le_bytes());
        out[8..16].copy_from_slice(&self.y.to_le_bytes());
        out[16..24].copy_from_slice(&self.z.to_le_bytes());
        out[24..].copy_from_slice(&self.w.to_le_bytes());
        out
    }

    pub fn from_le_bytes(bytes: [u8; 32]) -> Self {
        let x = f64::from_le_bytes(bytes[..8].try_into().expect("slice length"));
        let y = f64::from_le_bytes(bytes[8..16].try_into().expect("slice length"));
        let z = f64::from_le_bytes(bytes[16..24].try_into().expect("slice length"));
        let w = f64::from_le_bytes(bytes[24..].try_into().expect("slice length"));
        Self::new(x, y, z, w)
    }

    pub fn is_finite(self) -> bool {
        self.x.is_finite() && self.y.is_finite() && self.z.is_finite() && self.w.is_finite()
    }

    pub fn is_nan(self) -> bool {
        self.x.is_nan() || self.y.is_nan() || self.z.is_nan() || self.w.is_nan()
    }

    pub fn is_normalized(self) -> bool {
        (self.length_squared() - 1.0).abs() <= 1.0e-12
    }
}

impl Index<usize> for DVec4 {
    type Output = f64;

    fn index(&self, index: usize) -> &Self::Output {
        match index {
            0 => &self.x,
            1 => &self.y,
            2 => &self.z,
            3 => &self.w,
            _ => panic!("DVec4 index out of bounds"),
        }
    }
}

impl IndexMut<usize> for DVec4 {
    fn index_mut(&mut self, index: usize) -> &mut Self::Output {
        match index {
            0 => &mut self.x,
            1 => &mut self.y,
            2 => &mut self.z,
            3 => &mut self.w,
            _ => panic!("DVec4 index out of bounds"),
        }
    }
}

impl Add for DVec4 {
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        Self::new(self.x + rhs.x, self.y + rhs.y, self.z + rhs.z, self.w + rhs.w)
    }
}

impl AddAssign for DVec4 {
    fn add_assign(&mut self, rhs: Self) {
        self.x += rhs.x;
        self.y += rhs.y;
        self.z += rhs.z;
        self.w += rhs.w;
    }
}

impl Sub for DVec4 {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self::Output {
        Self::new(self.x - rhs.x, self.y - rhs.y, self.z - rhs.z, self.w - rhs.w)
    }
}

impl SubAssign for DVec4 {
    fn sub_assign(&mut self, rhs: Self) {
        self.x -= rhs.x;
        self.y -= rhs.y;
        self.z -= rhs.z;
        self.w -= rhs.w;
    }
}

impl Mul for DVec4 {
    type Output = Self;

    fn mul(self, rhs: Self) -> Self::Output {
        Self::new(self.x * rhs.x, self.y * rhs.y, self.z * rhs.z, self.w * rhs.w)
    }
}

impl MulAssign for DVec4 {
    fn mul_assign(&mut self, rhs: Self) {
        self.x *= rhs.x;
        self.y *= rhs.y;
        self.z *= rhs.z;
        self.w *= rhs.w;
    }
}

impl Mul<f64> for DVec4 {
    type Output = Self;

    fn mul(self, rhs: f64) -> Self::Output {
        Self::new(self.x * rhs, self.y * rhs, self.z * rhs, self.w * rhs)
    }
}

impl Mul<DVec4> for f64 {
    type Output = DVec4;

    fn mul(self, rhs: DVec4) -> Self::Output {
        rhs * self
    }
}

impl MulAssign<f64> for DVec4 {
    fn mul_assign(&mut self, rhs: f64) {
        self.x *= rhs;
        self.y *= rhs;
        self.z *= rhs;
        self.w *= rhs;
    }
}

impl Div for DVec4 {
    type Output = Self;

    fn div(self, rhs: Self) -> Self::Output {
        Self::new(self.x / rhs.x, self.y / rhs.y, self.z / rhs.z, self.w / rhs.w)
    }
}

impl DivAssign for DVec4 {
    fn div_assign(&mut self, rhs: Self) {
        self.x /= rhs.x;
        self.y /= rhs.y;
        self.z /= rhs.z;
        self.w /= rhs.w;
    }
}

impl Div<f64> for DVec4 {
    type Output = Self;

    fn div(self, rhs: f64) -> Self::Output {
        Self::new(self.x / rhs, self.y / rhs, self.z / rhs, self.w / rhs)
    }
}

impl DivAssign<f64> for DVec4 {
    fn div_assign(&mut self, rhs: f64) {
        self.x /= rhs;
        self.y /= rhs;
        self.z /= rhs;
        self.w /= rhs;
    }
}

impl Neg for DVec4 {
    type Output = Self;

    fn neg(self) -> Self::Output {
        Self::new(-self.x, -self.y, -self.z, -self.w)
    }
}

impl From<[f64; 4]> for DVec4 {
    fn from(value: [f64; 4]) -> Self {
        Self::from_array(value)
    }
}

impl From<(f64, f64, f64, f64)> for DVec4 {
    fn from(value: (f64, f64, f64, f64)) -> Self {
        Self::new(value.0, value.1, value.2, value.3)
    }
}

impl From<DVec4> for [f64; 4] {
    fn from(value: DVec4) -> Self {
        value.to_array()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[repr(C)]
pub struct DQuat {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub w: f64,
}

impl DQuat {
    pub const IDENTITY: Self = Self::from_xyzw(0.0, 0.0, 0.0, 1.0);

    pub const fn new(x: f64, y: f64, z: f64, w: f64) -> Self {
        Self { x, y, z, w }
    }

    pub const fn from_xyzw(x: f64, y: f64, z: f64, w: f64) -> Self {
        Self { x, y, z, w }
    }

    pub fn from_axis_angle(axis: DVec3, angle: f64) -> Self {
        let half = angle * 0.5;
        let (s, c) = half.sin_cos();
        let v = axis.normalize() * s;
        Self::new(v.x, v.y, v.z, c)
    }

    pub fn from_rotation_x(angle: f64) -> Self {
        Self::from_axis_angle(DVec3::X, angle)
    }

    pub fn from_rotation_y(angle: f64) -> Self {
        Self::from_axis_angle(DVec3::Y, angle)
    }

    pub fn from_rotation_z(angle: f64) -> Self {
        Self::from_axis_angle(DVec3::Z, angle)
    }

    pub fn from_scaled_axis(v: DVec3) -> Self {
        let angle = v.length();
        if angle <= NORMALIZE_EPSILON {
            Self::IDENTITY
        } else {
            Self::from_axis_angle(v / angle, angle)
        }
    }

    pub fn dot(self, rhs: Self) -> f64 {
        self.x * rhs.x + self.y * rhs.y + self.z * rhs.z + self.w * rhs.w
    }

    pub fn length(self) -> f64 {
        self.length_squared().sqrt()
    }

    pub fn length_squared(self) -> f64 {
        self.dot(self)
    }

    pub fn conjugate(self) -> Self {
        Self::new(-self.x, -self.y, -self.z, self.w)
    }

    pub fn inverse(self) -> Self {
        let len_sq = self.length_squared();
        if len_sq <= NORMALIZE_EPSILON {
            Self::IDENTITY
        } else {
            self.conjugate() / len_sq
        }
    }

    pub fn normalize(self) -> Self {
        let len = self.length();
        if len <= NORMALIZE_EPSILON {
            Self::IDENTITY
        } else {
            self / len
        }
    }

    pub fn normalize_or_identity(self) -> Self {
        self.normalize()
    }

    pub fn lerp(self, rhs: Self, s: f64) -> Self {
        (self + (rhs - self) * s).normalize()
    }

    pub fn slerp(self, rhs: Self, s: f64) -> Self {
        let mut cos = self.dot(rhs);
        let mut rhs_adj = rhs;
        if cos < 0.0 {
            cos = -cos;
            rhs_adj = -rhs;
        }

        if cos > 0.9995 {
            return self.lerp(rhs_adj, s);
        }

        let theta = cos.acos();
        let sin = theta.sin();
        let w1 = ((1.0 - s) * theta).sin() / sin;
        let w2 = (s * theta).sin() / sin;
        (self * w1 + rhs_adj * w2).normalize()
    }

    pub fn rotate_vec3(self, v: DVec3) -> DVec3 {
        let qv = DVec3::new(self.x, self.y, self.z);
        let t = 2.0 * qv.cross(v);
        v + t * self.w + qv.cross(t)
    }

    pub const fn to_array(self) -> [f64; 4] {
        [self.x, self.y, self.z, self.w]
    }

    pub const fn from_array(v: [f64; 4]) -> Self {
        Self::new(v[0], v[1], v[2], v[3])
    }

    pub fn to_le_bytes(self) -> [u8; 32] {
        let mut out = [0u8; 32];
        out[..8].copy_from_slice(&self.x.to_le_bytes());
        out[8..16].copy_from_slice(&self.y.to_le_bytes());
        out[16..24].copy_from_slice(&self.z.to_le_bytes());
        out[24..].copy_from_slice(&self.w.to_le_bytes());
        out
    }

    pub fn from_le_bytes(bytes: [u8; 32]) -> Self {
        let x = f64::from_le_bytes(bytes[..8].try_into().expect("slice length"));
        let y = f64::from_le_bytes(bytes[8..16].try_into().expect("slice length"));
        let z = f64::from_le_bytes(bytes[16..24].try_into().expect("slice length"));
        let w = f64::from_le_bytes(bytes[24..].try_into().expect("slice length"));
        Self::new(x, y, z, w)
    }

    pub fn is_finite(self) -> bool {
        self.x.is_finite()
            && self.y.is_finite()
            && self.z.is_finite()
            && self.w.is_finite()
    }

    pub fn is_nan(self) -> bool {
        self.x.is_nan() || self.y.is_nan() || self.z.is_nan() || self.w.is_nan()
    }

    pub fn is_normalized(self) -> bool {
        (self.length_squared() - 1.0).abs() <= 1.0e-12
    }
}

impl Default for DQuat {
    fn default() -> Self {
        Self::IDENTITY
    }
}

impl Add for DQuat {
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        Self::new(self.x + rhs.x, self.y + rhs.y, self.z + rhs.z, self.w + rhs.w)
    }
}

impl AddAssign for DQuat {
    fn add_assign(&mut self, rhs: Self) {
        self.x += rhs.x;
        self.y += rhs.y;
        self.z += rhs.z;
        self.w += rhs.w;
    }
}

impl Sub for DQuat {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self::Output {
        Self::new(self.x - rhs.x, self.y - rhs.y, self.z - rhs.z, self.w - rhs.w)
    }
}

impl SubAssign for DQuat {
    fn sub_assign(&mut self, rhs: Self) {
        self.x -= rhs.x;
        self.y -= rhs.y;
        self.z -= rhs.z;
        self.w -= rhs.w;
    }
}

impl Mul for DQuat {
    type Output = Self;

    fn mul(self, rhs: Self) -> Self::Output {
        Self::new(
            self.w * rhs.x + self.x * rhs.w + self.y * rhs.z - self.z * rhs.y,
            self.w * rhs.y - self.x * rhs.z + self.y * rhs.w + self.z * rhs.x,
            self.w * rhs.z + self.x * rhs.y - self.y * rhs.x + self.z * rhs.w,
            self.w * rhs.w - self.x * rhs.x - self.y * rhs.y - self.z * rhs.z,
        )
    }
}

impl MulAssign for DQuat {
    fn mul_assign(&mut self, rhs: Self) {
        *self = *self * rhs;
    }
}

impl Mul<f64> for DQuat {
    type Output = Self;

    fn mul(self, rhs: f64) -> Self::Output {
        Self::new(self.x * rhs, self.y * rhs, self.z * rhs, self.w * rhs)
    }
}

impl Mul<DQuat> for f64 {
    type Output = DQuat;

    fn mul(self, rhs: DQuat) -> Self::Output {
        rhs * self
    }
}

impl MulAssign<f64> for DQuat {
    fn mul_assign(&mut self, rhs: f64) {
        self.x *= rhs;
        self.y *= rhs;
        self.z *= rhs;
        self.w *= rhs;
    }
}

impl Mul<DVec3> for DQuat {
    type Output = DVec3;

    fn mul(self, rhs: DVec3) -> Self::Output {
        self.rotate_vec3(rhs)
    }
}

impl Div for DQuat {
    type Output = Self;

    fn div(self, rhs: Self) -> Self::Output {
        Self::new(self.x / rhs.x, self.y / rhs.y, self.z / rhs.z, self.w / rhs.w)
    }
}

impl DivAssign for DQuat {
    fn div_assign(&mut self, rhs: Self) {
        self.x /= rhs.x;
        self.y /= rhs.y;
        self.z /= rhs.z;
        self.w /= rhs.w;
    }
}

impl Div<f64> for DQuat {
    type Output = Self;

    fn div(self, rhs: f64) -> Self::Output {
        Self::new(self.x / rhs, self.y / rhs, self.z / rhs, self.w / rhs)
    }
}

impl DivAssign<f64> for DQuat {
    fn div_assign(&mut self, rhs: f64) {
        self.x /= rhs;
        self.y /= rhs;
        self.z /= rhs;
        self.w /= rhs;
    }
}

impl Neg for DQuat {
    type Output = Self;

    fn neg(self) -> Self::Output {
        Self::new(-self.x, -self.y, -self.z, -self.w)
    }
}

impl From<[f64; 4]> for DQuat {
    fn from(value: [f64; 4]) -> Self {
        Self::from_array(value)
    }
}

impl From<(f64, f64, f64, f64)> for DQuat {
    fn from(value: (f64, f64, f64, f64)) -> Self {
        Self::new(value.0, value.1, value.2, value.3)
    }
}

impl From<DQuat> for [f64; 4] {
    fn from(value: DQuat) -> Self {
        value.to_array()
    }
}
