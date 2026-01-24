use core::ops::{
    Add, AddAssign, Div, DivAssign, Mul, MulAssign, Neg, Sub, SubAssign,
};
use serde::{Deserialize, Serialize};
use crate::common::NORMALIZE_EPSILON;
use crate::dvec3::DVec3;

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dvec3::DVec3;
    use core::f64::consts::PI;

    #[test]
    fn test_identity() {
        let q = DQuat::IDENTITY;
        assert_eq!(q.x, 0.0);
        assert_eq!(q.y, 0.0);
        assert_eq!(q.z, 0.0);
        assert_eq!(q.w, 1.0);
    }

    #[test]
    fn test_from_axis_angle() {
        let q = DQuat::from_axis_angle(DVec3::X, PI);
        // Rotation by PI around X should be (1, 0, 0, 0) roughly (sin(PI/2) = 1, cos(PI/2) = 0)
        // DQuat stores x, y, z, w where w is cos(angle/2)
        // q = (sin(PI/2)*1, 0, 0, cos(PI/2)) = (1, 0, 0, 0)
        assert!((q.x - 1.0).abs() < 1e-6);
        assert!(q.y.abs() < 1e-6);
        assert!(q.z.abs() < 1e-6);
        assert!(q.w.abs() < 1e-6);
    }

    #[test]
    fn test_mul_quat() {
        // Rotate 90 deg around X, then 90 deg around Y
        let qx = DQuat::from_rotation_x(PI / 2.0);
        let qy = DQuat::from_rotation_y(PI / 2.0);
        let q = qy * qx; // Apply X then Y

        let v = DVec3::Z;
        let v_rotated = q.rotate_vec3(v);
        // Z -> -Y (rotate X 90) -> -Y (rotate Y 90)
        // Wait, right hand rule.
        // Z axis points out.
        // Rotate X 90: Y -> Z, Z -> -Y. So Z becomes -Y.
        // Rotate Y 90: Z -> X, X -> -Z. Y is unchanged.
        // So -Y stays -Y.
        
        // Let's verify qx * v
        let v_after_x = qx.rotate_vec3(v);
        assert!((v_after_x.x).abs() < 1e-6);
        assert!((v_after_x.y + 1.0).abs() < 1e-6); // y is -1
        assert!((v_after_x.z).abs() < 1e-6);

        // qy * v_after_x
        let v_final = qy.rotate_vec3(v_after_x);
        assert!((v_final.x).abs() < 1e-6);
        assert!((v_final.y + 1.0).abs() < 1e-6); // y is -1
        assert!((v_final.z).abs() < 1e-6);
        
        // q * v should match
        assert!((v_rotated.x - v_final.x).abs() < 1e-6);
        assert!((v_rotated.y - v_final.y).abs() < 1e-6);
        assert!((v_rotated.z - v_final.z).abs() < 1e-6);
    }
}
