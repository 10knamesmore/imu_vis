//! 3×3 双精度浮点矩阵。
//!
//! 行优先存储 (row-major)，用于旋转矩阵、反对称矩阵等 IMU 运算。
//! 与 `DVec3` 配合使用，提供矩阵-向量乘法、转置、求逆等基本操作。

use crate::DVec3;
use core::ops::{Add, Mul, Sub};

/// 3×3 双精度矩阵（行优先存储）。
///
/// 内部数据按行排列：
/// ```text
/// | data[0] data[1] data[2] |     | m00 m01 m02 |
/// | data[3] data[4] data[5] |  =  | m10 m11 m12 |
/// | data[6] data[7] data[8] |     | m20 m21 m22 |
/// ```
#[derive(Debug, Clone, Copy)]
pub struct DMat3 {
    /// 行优先存储的 9 个元素。
    pub data: [f64; 9],
}

impl DMat3 {
    /// 零矩阵。
    pub const ZERO: Self = Self { data: [0.0; 9] };

    /// 单位矩阵。
    pub const IDENTITY: Self = Self {
        data: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
    };

    /// 从 9 个元素构造（行优先）。
    #[inline]
    pub const fn new(
        m00: f64, m01: f64, m02: f64,
        m10: f64, m11: f64, m12: f64,
        m20: f64, m21: f64, m22: f64,
    ) -> Self {
        Self {
            data: [m00, m01, m02, m10, m11, m12, m20, m21, m22],
        }
    }

    /// 从对角线元素构造对角矩阵。
    #[inline]
    pub const fn from_diagonal(d0: f64, d1: f64, d2: f64) -> Self {
        Self::new(d0, 0.0, 0.0, 0.0, d1, 0.0, 0.0, 0.0, d2)
    }

    /// 从标量构造 `s * I`。
    #[inline]
    pub const fn from_scale(s: f64) -> Self {
        Self::from_diagonal(s, s, s)
    }

    /// 获取元素 `(row, col)`。
    #[inline]
    pub fn get(&self, row: usize, col: usize) -> f64 {
        self.data[row * 3 + col]
    }

    /// 设置元素 `(row, col)`。
    #[inline]
    pub fn set(&mut self, row: usize, col: usize, val: f64) {
        self.data[row * 3 + col] = val;
    }

    /// 构造向量 `v` 的反对称矩阵（skew-symmetric / cross-product matrix）。
    ///
    /// ```text
    /// [v×] = |  0   -v.z   v.y |
    ///        |  v.z   0   -v.x |
    ///        | -v.y  v.x    0  |
    /// ```
    ///
    /// 满足 `[v×] * w = v.cross(w)`。
    #[inline]
    pub fn skew(v: DVec3) -> Self {
        Self::new(
            0.0, -v.z, v.y,
            v.z, 0.0, -v.x,
            -v.y, v.x, 0.0,
        )
    }

    /// 矩阵转置。
    #[inline]
    pub fn transpose(&self) -> Self {
        let d = &self.data;
        Self::new(
            d[0], d[3], d[6],
            d[1], d[4], d[7],
            d[2], d[5], d[8],
        )
    }

    /// 矩阵-向量乘法：`M * v`。
    #[inline]
    pub fn mul_vec3(&self, v: DVec3) -> DVec3 {
        let d = &self.data;
        DVec3 {
            x: d[0] * v.x + d[1] * v.y + d[2] * v.z,
            y: d[3] * v.x + d[4] * v.y + d[5] * v.z,
            z: d[6] * v.x + d[7] * v.y + d[8] * v.z,
        }
    }

    /// 标量乘法：`M * s`。
    #[inline]
    pub fn scale(&self, s: f64) -> Self {
        let mut out = [0.0; 9];
        for i in 0..9 {
            out[i] = self.data[i] * s;
        }
        Self { data: out }
    }

    /// 矩阵行列式。
    pub fn determinant(&self) -> f64 {
        let d = &self.data;
        d[0] * (d[4] * d[8] - d[5] * d[7])
            - d[1] * (d[3] * d[8] - d[5] * d[6])
            + d[2] * (d[3] * d[7] - d[4] * d[6])
    }

    /// 矩阵求逆（使用伴随矩阵 / cofactor 方法）。
    ///
    /// 对于正定矩阵（如卡尔曼滤波中的协方差子块 S = HPHᵀ + R），
    /// 此方法数值稳定且高效。
    ///
    /// 返回 `None` 如果矩阵奇异（行列式接近零）。
    pub fn inverse(&self) -> Option<Self> {
        let det = self.determinant();
        if det.abs() < 1e-30 {
            return None;
        }
        let d = &self.data;
        let inv_det = 1.0 / det;

        // 余子式矩阵的转置（伴随矩阵）
        Some(Self::new(
            (d[4] * d[8] - d[5] * d[7]) * inv_det,
            (d[2] * d[7] - d[1] * d[8]) * inv_det,
            (d[1] * d[5] - d[2] * d[4]) * inv_det,
            (d[5] * d[6] - d[3] * d[8]) * inv_det,
            (d[0] * d[8] - d[2] * d[6]) * inv_det,
            (d[2] * d[3] - d[0] * d[5]) * inv_det,
            (d[3] * d[7] - d[4] * d[6]) * inv_det,
            (d[1] * d[6] - d[0] * d[7]) * inv_det,
            (d[0] * d[4] - d[1] * d[3]) * inv_det,
        ))
    }
}

/// 矩阵乘法：`A * B`。
impl Mul for DMat3 {
    type Output = Self;
    fn mul(self, rhs: Self) -> Self {
        let a = &self.data;
        let b = &rhs.data;
        let mut out = [0.0; 9];
        for i in 0..3 {
            for j in 0..3 {
                out[i * 3 + j] =
                    a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
            }
        }
        Self { data: out }
    }
}

/// 矩阵加法。
impl Add for DMat3 {
    type Output = Self;
    fn add(self, rhs: Self) -> Self {
        let mut out = [0.0; 9];
        for i in 0..9 {
            out[i] = self.data[i] + rhs.data[i];
        }
        Self { data: out }
    }
}

/// 矩阵减法。
impl Sub for DMat3 {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self {
        let mut out = [0.0; 9];
        for i in 0..9 {
            out[i] = self.data[i] - rhs.data[i];
        }
        Self { data: out }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_mul() {
        let m = DMat3::new(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0);
        let result = DMat3::IDENTITY * m;
        for i in 0..9 {
            assert!((result.data[i] - m.data[i]).abs() < 1e-12);
        }
    }

    #[test]
    fn skew_cross_product() {
        let v = DVec3::new(1.0, 2.0, 3.0);
        let w = DVec3::new(4.0, 5.0, 6.0);
        let skew_result = DMat3::skew(v).mul_vec3(w);
        let cross_result = v.cross(w);
        assert!((skew_result.x - cross_result.x).abs() < 1e-12);
        assert!((skew_result.y - cross_result.y).abs() < 1e-12);
        assert!((skew_result.z - cross_result.z).abs() < 1e-12);
    }

    #[test]
    fn inverse_identity() {
        let inv = DMat3::IDENTITY.inverse().unwrap();
        for i in 0..9 {
            assert!((inv.data[i] - DMat3::IDENTITY.data[i]).abs() < 1e-12);
        }
    }

    #[test]
    fn inverse_roundtrip() {
        let m = DMat3::new(2.0, 1.0, 0.0, 0.0, 3.0, 1.0, 1.0, 0.0, 2.0);
        let inv = m.inverse().unwrap();
        let product = m * inv;
        for i in 0..3 {
            for j in 0..3 {
                let expected = if i == j { 1.0 } else { 0.0 };
                assert!(
                    (product.get(i, j) - expected).abs() < 1e-12,
                    "({},{}) = {} expected {}",
                    i, j, product.get(i, j), expected
                );
            }
        }
    }

    #[test]
    fn transpose() {
        let m = DMat3::new(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0);
        let t = m.transpose();
        assert!((t.get(0, 1) - 4.0).abs() < 1e-12);
        assert!((t.get(1, 0) - 2.0).abs() < 1e-12);
    }
}
