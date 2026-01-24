use core::ops::{
    Add, AddAssign, Div, DivAssign, Index, IndexMut, Mul, MulAssign, Neg, Sub, SubAssign,
};
use serde::{Deserialize, Serialize};
use crate::common::NORMALIZE_EPSILON;

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


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new() {
        let v = DVec3::new(1.0, 2.0, 3.0);
        assert_eq!(v.x, 1.0);
        assert_eq!(v.y, 2.0);
        assert_eq!(v.z, 3.0);
    }

    #[test]
    fn test_cross() {
        let v1 = DVec3::X;
        let v2 = DVec3::Y;
        assert_eq!(v1.cross(v2), DVec3::Z);
    }

    #[test]
    fn test_dot() {
        let v1 = DVec3::new(1.0, 2.0, 3.0);
        let v2 = DVec3::new(4.0, 5.0, 6.0);
        assert_eq!(v1.dot(v2), 1.0*4.0 + 2.0*5.0 + 3.0*6.0);
    }

    #[test]
    fn test_length() {
        let v = DVec3::new(1.0, 2.0, 2.0);
        assert_eq!(v.length(), 3.0);
    }

    #[test]
    fn test_normalize() {
        let v = DVec3::new(2.0, 0.0, 0.0);
        assert_eq!(v.normalize(), DVec3::X);
    }
}
