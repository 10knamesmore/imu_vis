use core::ops::{
    Add, AddAssign, Div, DivAssign, Index, IndexMut, Mul, MulAssign, Neg, Sub, SubAssign,
};
use serde::{Deserialize, Serialize};
use crate::common::NORMALIZE_EPSILON;

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


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new() {
        let v = DVec2::new(1.0, 2.0);
        assert_eq!(v.x, 1.0);
        assert_eq!(v.y, 2.0);
    }

    #[test]
    fn test_consts() {
        assert_eq!(DVec2::ZERO, DVec2::new(0.0, 0.0));
        assert_eq!(DVec2::ONE, DVec2::new(1.0, 1.0));
        assert_eq!(DVec2::X, DVec2::new(1.0, 0.0));
        assert_eq!(DVec2::Y, DVec2::new(0.0, 1.0));
    }

    #[test]
    fn test_splat() {
        let v = DVec2::splat(1.5);
        assert_eq!(v, DVec2::new(1.5, 1.5));
    }

    #[test]
    fn test_dot() {
        let v1 = DVec2::new(1.0, 2.0);
        let v2 = DVec2::new(3.0, 4.0);
        assert_eq!(v1.dot(v2), 11.0);
    }

    #[test]
    fn test_length() {
        let v = DVec2::new(3.0, 4.0);
        assert_eq!(v.length(), 5.0);
        assert_eq!(v.length_squared(), 25.0);
        assert_eq!(v.length_recip(), 0.2);
    }

    #[test]
    fn test_normalize() {
        let v = DVec2::new(3.0, 4.0);
        let n = v.normalize();
        assert!((n.length() - 1.0).abs() < 1e-6);
        assert_eq!(n.x, 0.6);
        assert_eq!(n.y, 0.8);

        let z = DVec2::ZERO;
        assert_eq!(z.normalize(), DVec2::ZERO);
    }

    #[test]
    fn test_distance() {
        let v1 = DVec2::new(1.0, 1.0);
        let v2 = DVec2::new(4.0, 5.0);
        assert_eq!(v1.distance(v2), 5.0);
        assert_eq!(v1.distance_squared(v2), 25.0);
    }

    #[test]
    fn test_min_max_clamp() {
        let v1 = DVec2::new(1.0, 5.0);
        let v2 = DVec2::new(3.0, 2.0);
        assert_eq!(v1.min(v2), DVec2::new(1.0, 2.0));
        assert_eq!(v1.max(v2), DVec2::new(3.0, 5.0));

        let v = DVec2::new(0.5, 2.5);
        let min = DVec2::new(1.0, 1.0);
        let max = DVec2::new(2.0, 2.0);
        assert_eq!(v.clamp(min, max), DVec2::new(1.0, 2.0));
    }
}
