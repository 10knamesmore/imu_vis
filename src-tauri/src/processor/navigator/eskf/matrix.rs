//! Hand-written 15x15 matrix and 15-element vector for ESKF covariance operations.
//!
//! This module provides stack-allocated, fixed-size linear algebra primitives
//! specifically sized for the 15-state error-state Kalman filter (ESKF).
//!
//! # Storage layout
//!
//! [`Mat15`] uses **row-major** storage in a flat `[f64; 225]` array.
//! Element `(i, j)` is stored at index `i * 15 + j`.
//!
//! ```text
//! | data[  0] data[  1] ... data[ 14] |   row 0
//! | data[ 15] data[ 16] ... data[ 29] |   row 1
//! |   ...                              |
//! | data[210] data[211] ... data[224] |   row 14
//! ```
//!
//! # Performance notes
//!
//! All operations are implemented with explicit loops over fixed-size arrays.
//! The compiler can fully unroll small loops and apply SIMD auto-vectorization.
//! No heap allocation is performed; both `Mat15` and `Vec15` live entirely on
//! the stack (~1.8 KB for `Mat15`, 120 bytes for `Vec15`).
//!
//! For the ZUPT measurement update, specialized accessors (`velocity_cols`,
//! `zupt_update`) avoid constructing full intermediate matrices when only
//! the velocity-block columns (indices 3..6) are needed.

/// Dimension of the ESKF error state vector.
const N: usize = 15;

/// Total number of elements in a 15x15 matrix.
const NN: usize = N * N;

/// 15x15 double-precision matrix (row-major storage).
///
/// Used for the ESKF covariance matrix P (15x15) and the state transition
/// matrix F (15x15). Row-major layout: element (row, col) is at index
/// `row * 15 + col`.
#[derive(Clone)]
pub struct Mat15 {
    /// Row-major storage of 225 elements.
    pub data: [f64; NN],
}

impl std::fmt::Debug for Mat15 {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Mat15([...])")
    }
}

impl Mat15 {
    /// Create a zero matrix.
    pub fn zeros() -> Self {
        Self { data: [0.0; NN] }
    }

    /// Create a 15x15 identity matrix.
    pub fn identity() -> Self {
        let mut m = Self::zeros();
        for i in 0..N {
            m.data[i * N + i] = 1.0;
        }
        m
    }

    /// Create a diagonal matrix from a 15-element array.
    ///
    /// Off-diagonal elements are zero.
    pub fn from_diagonal(diag: &[f64; N]) -> Self {
        let mut m = Self::zeros();
        for i in 0..N {
            m.data[i * N + i] = diag[i];
        }
        m
    }

    /// Get element at `(row, col)`.
    #[inline]
    pub fn get(&self, row: usize, col: usize) -> f64 {
        self.data[row * N + col]
    }

    /// Set element at `(row, col)`.
    #[inline]
    pub fn set(&mut self, row: usize, col: usize, val: f64) {
        self.data[row * N + col] = val;
    }

    /// Matrix transpose.
    pub fn transpose(&self) -> Self {
        let mut out = Self::zeros();
        for i in 0..N {
            for j in 0..N {
                out.data[j * N + i] = self.data[i * N + j];
            }
        }
        out
    }

    /// Matrix-matrix multiplication: `self * rhs`.
    pub fn mul(&self, rhs: &Mat15) -> Mat15 {
        let mut out = Mat15::zeros();
        for i in 0..N {
            for k in 0..N {
                let a_ik = self.data[i * N + k];
                if a_ik == 0.0 {
                    continue;
                }
                for j in 0..N {
                    out.data[i * N + j] += a_ik * rhs.data[k * N + j];
                }
            }
        }
        out
    }

    /// Matrix-vector multiplication: `self * v`.
    pub fn mul_vec15(&self, v: &Vec15) -> Vec15 {
        let mut out = Vec15::zeros();
        for i in 0..N {
            let mut sum = 0.0;
            for j in 0..N {
                sum += self.data[i * N + j] * v.data[j];
            }
            out.data[i] = sum;
        }
        out
    }

    /// Element-wise addition: `self + rhs`.
    pub fn add(&self, rhs: &Mat15) -> Mat15 {
        let mut out = Mat15::zeros();
        for i in 0..NN {
            out.data[i] = self.data[i] + rhs.data[i];
        }
        out
    }

    /// Element-wise subtraction: `self - rhs`.
    pub fn sub(&self, rhs: &Mat15) -> Mat15 {
        let mut out = Mat15::zeros();
        for i in 0..NN {
            out.data[i] = self.data[i] - rhs.data[i];
        }
        out
    }

    /// Scalar multiplication: `self * s`.
    pub fn scale(&self, s: f64) -> Mat15 {
        let mut out = Mat15::zeros();
        for i in 0..NN {
            out.data[i] = self.data[i] * s;
        }
        out
    }

    /// Extract columns 3..6 (velocity block) as an array of 15 row-vectors.
    ///
    /// Returns `P[:, 3..6]` as `[[f64; 3]; 15]`, where `result[i][j]` is
    /// `P(i, 3+j)`. This is the `P * Hᵀ` factor needed for ZUPT Kalman gain
    /// computation (since H = [0|I₃|0|0|0], we have P*Hᵀ = P[:, 3..6]).
    pub fn velocity_cols(&self) -> [[f64; 3]; N] {
        let mut out = [[0.0; 3]; N];
        for i in 0..N {
            out[i][0] = self.data[i * N + 3];
            out[i][1] = self.data[i * N + 4];
            out[i][2] = self.data[i * N + 5];
        }
        out
    }

    /// Apply the ZUPT measurement update to the covariance in-place.
    ///
    /// Computes `P = (I - K * H) * P` where H = \[0|I₃|0|0|0\] selects
    /// velocity rows 3..6. The Kalman gain K is provided as `[[f64; 3]; 15]`
    /// (a 15x3 matrix stored as 15 row-vectors of length 3).
    ///
    /// This avoids building a full 15x15 `K*H` matrix by exploiting the
    /// sparse structure of H: `(K*H)[i][j] = K[i][j-3]` for j in 3..6,
    /// and zero otherwise.
    pub fn zupt_update(&mut self, k: &[[f64; 3]; N]) {
        // Compute (I - K*H) * P
        // (I - K*H)[i][j] = delta(i,j) - K[i][j-3] if j in [3,6), else delta(i,j)
        //
        // We compute row i of the result as:
        //   result_row[i] = P_row[i] - K[i][0]*P_row[3] - K[i][1]*P_row[4] - K[i][2]*P_row[5]
        let old = self.data;
        for i in 0..N {
            let k0 = k[i][0];
            let k1 = k[i][1];
            let k2 = k[i][2];
            for j in 0..N {
                self.data[i * N + j] = old[i * N + j]
                    - k0 * old[3 * N + j]
                    - k1 * old[4 * N + j]
                    - k2 * old[5 * N + j];
            }
        }
    }
}

/// 15-element double-precision vector.
///
/// Represents the ESKF error state δx = [δθ, δv, δp, δb_g, δb_a]ᵀ,
/// where each sub-vector is 3-dimensional (total 15 states).
#[derive(Debug, Clone)]
pub struct Vec15 {
    /// The 15 elements.
    pub data: [f64; N],
}

impl Vec15 {
    /// Create a zero vector.
    pub fn zeros() -> Self {
        Self { data: [0.0; N] }
    }

    /// Get element at index `i`.
    #[inline]
    pub fn get(&self, i: usize) -> f64 {
        self.data[i]
    }

    /// Set element at index `i`.
    #[inline]
    pub fn set(&mut self, i: usize, val: f64) {
        self.data[i] = val;
    }

    /// Element-wise addition.
    pub fn add(&self, rhs: &Vec15) -> Vec15 {
        let mut out = Vec15::zeros();
        for i in 0..N {
            out.data[i] = self.data[i] + rhs.data[i];
        }
        out
    }

    /// Element-wise subtraction.
    pub fn sub(&self, rhs: &Vec15) -> Vec15 {
        let mut out = Vec15::zeros();
        for i in 0..N {
            out.data[i] = self.data[i] - rhs.data[i];
        }
        out
    }

    /// Scalar multiplication.
    pub fn scale(&self, s: f64) -> Vec15 {
        let mut out = Vec15::zeros();
        for i in 0..N {
            out.data[i] = self.data[i] * s;
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_times_identity_is_identity() {
        let i = Mat15::identity();
        let result = i.mul(&i);
        for r in 0..15 {
            for c in 0..15 {
                let expected = if r == c { 1.0 } else { 0.0 };
                assert!(
                    (result.get(r, c) - expected).abs() < 1e-12,
                    "({},{}) = {}, expected {}",
                    r, c, result.get(r, c), expected
                );
            }
        }
    }

    #[test]
    fn mul_associativity() {
        // Build three distinct non-trivial matrices and verify (A*B)*C == A*(B*C)
        let mut a = Mat15::zeros();
        let mut b = Mat15::zeros();
        let mut c = Mat15::zeros();
        for i in 0..15 {
            for j in 0..15 {
                a.set(i, j, ((i * 17 + j * 13 + 3) % 29) as f64 - 14.0);
                b.set(i, j, ((i * 7 + j * 23 + 11) % 31) as f64 - 15.0);
                c.set(i, j, ((i * 11 + j * 19 + 5) % 37) as f64 - 18.0);
            }
        }
        let ab_c = a.mul(&b).mul(&c);
        let a_bc = a.mul(&b.mul(&c));
        for i in 0..15 {
            for j in 0..15 {
                assert!(
                    (ab_c.get(i, j) - a_bc.get(i, j)).abs() < 1e-6,
                    "associativity failed at ({},{}): {} vs {}",
                    i, j, ab_c.get(i, j), a_bc.get(i, j)
                );
            }
        }
    }

    #[test]
    fn transpose_is_involution() {
        let mut m = Mat15::zeros();
        for i in 0..15 {
            for j in 0..15 {
                m.set(i, j, (i * 15 + j) as f64);
            }
        }
        let mt = m.transpose();
        let mtt = mt.transpose();
        for i in 0..15 {
            for j in 0..15 {
                assert!(
                    (m.get(i, j) - mtt.get(i, j)).abs() < 1e-12,
                    "transpose involution failed at ({},{})",
                    i, j
                );
                assert!(
                    (m.get(i, j) - mt.get(j, i)).abs() < 1e-12,
                    "transpose swap failed at ({},{})",
                    i, j
                );
            }
        }
    }

    #[test]
    fn from_diagonal_produces_correct_matrix() {
        let diag: [f64; 15] = [
            1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0,
        ];
        let m = Mat15::from_diagonal(&diag);
        for i in 0..15 {
            for j in 0..15 {
                let expected = if i == j { diag[i] } else { 0.0 };
                assert!(
                    (m.get(i, j) - expected).abs() < 1e-12,
                    "from_diagonal failed at ({},{}): {} vs {}",
                    i, j, m.get(i, j), expected
                );
            }
        }
    }

    #[test]
    fn mul_vec15_with_identity() {
        let id = Mat15::identity();
        let mut v = Vec15::zeros();
        for i in 0..15 {
            v.set(i, (i + 1) as f64);
        }
        let result = id.mul_vec15(&v);
        for i in 0..15 {
            assert!(
                (result.get(i) - v.get(i)).abs() < 1e-12,
                "identity * v failed at {}",
                i
            );
        }
    }

    #[test]
    fn velocity_cols_extracts_correct_columns() {
        let mut m = Mat15::zeros();
        for i in 0..15 {
            m.set(i, 3, (i * 10) as f64);
            m.set(i, 4, (i * 10 + 1) as f64);
            m.set(i, 5, (i * 10 + 2) as f64);
        }
        let cols = m.velocity_cols();
        for i in 0..15 {
            assert!((cols[i][0] - (i * 10) as f64).abs() < 1e-12);
            assert!((cols[i][1] - (i * 10 + 1) as f64).abs() < 1e-12);
            assert!((cols[i][2] - (i * 10 + 2) as f64).abs() < 1e-12);
        }
    }
}
