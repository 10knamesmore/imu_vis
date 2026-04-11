//! 用于 ESKF 协方差运算的手写 15x15 矩阵和 15 元向量。
//!
//! 该模块提供栈分配的固定尺寸线性代数基础类型，尺寸专门匹配 15 维误差状态卡尔曼滤波（ESKF）。
//!
//! # 存储布局
//!
//! [`Mat15`] 使用扁平 `[f64; 225]` 数组按**行优先**存储。
//! 元素 `(i, j)` 存储在索引 `i * 15 + j` 处。
//!
//! ```text
//! | data[  0] data[  1] ... data[ 14] |   第 0 行
//! | data[ 15] data[ 16] ... data[ 29] |   第 1 行
//! |   ...                              |
//! | data[210] data[211] ... data[224] |   第 14 行
//! ```
//!
//! # 性能说明
//!
//! 所有操作都通过固定尺寸数组上的显式循环实现。编译器可以完全展开小循环并应用 SIMD
//! 自动向量化。不会执行堆分配；`Mat15` 和 `Vec15` 完全位于栈上（`Mat15` 约 1.8 KB，
//! `Vec15` 为 120 字节）。
//!
//! 对于 ZUPT 量测更新，专用访问器（`velocity_cols`、`zupt_update`）在只需要速度块列
//! （索引 3..6）时避免构造完整的中间矩阵。

/// ESKF 误差状态向量的维度。
const N: usize = 15;

/// 15x15 矩阵中的元素总数。
const NN: usize = N * N;

/// 15x15 双精度矩阵（行优先存储）。
///
/// 用于 ESKF 协方差矩阵 P（15x15）和状态转移矩阵 F（15x15）。
/// 行优先布局：元素 `(row, col)` 位于索引 `row * 15 + col`。
#[derive(Clone)]
pub struct Mat15 {
    /// 225 个元素的行优先存储。
    pub data: [f64; NN],
}

impl std::fmt::Debug for Mat15 {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Mat15([...])")
    }
}

impl Mat15 {
    /// 创建零矩阵。
    pub fn zeros() -> Self {
        Self { data: [0.0; NN] }
    }

    /// 创建 15x15 单位矩阵。
    pub fn identity() -> Self {
        let mut m = Self::zeros();
        for i in 0..N {
            m.data[i * N + i] = 1.0;
        }
        m
    }

    /// 根据 15 元数组创建对角矩阵。
    ///
    /// 非对角元素为零。
    pub fn from_diagonal(diag: &[f64; N]) -> Self {
        let mut m = Self::zeros();
        for i in 0..N {
            m.data[i * N + i] = diag[i];
        }
        m
    }

    /// 将对角元素提取为固定尺寸数组。
    ///
    /// 返回 `[P(0,0), P(1,1), ..., P(14,14)]`，表示每个误差状态分量的方差
    /// （不确定性的平方）。
    pub fn diagonal(&self) -> [f64; N] {
        let mut d = [0.0; N];
        for i in 0..N {
            d[i] = self.data[i * N + i];
        }
        d
    }

    /// 获取 `(row, col)` 处的元素。
    #[inline]
    pub fn get(&self, row: usize, col: usize) -> f64 {
        self.data[row * N + col]
    }

    /// 设置 `(row, col)` 处的元素。
    #[inline]
    pub fn set(&mut self, row: usize, col: usize, val: f64) {
        self.data[row * N + col] = val;
    }

    /// 矩阵转置。
    pub fn transpose(&self) -> Self {
        let mut out = Self::zeros();
        for i in 0..N {
            for j in 0..N {
                out.data[j * N + i] = self.data[i * N + j];
            }
        }
        out
    }

    /// 矩阵-矩阵乘法：`self * rhs`。
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

    /// 矩阵-向量乘法：`self * v`。
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

    /// 逐元素加法：`self + rhs`。
    pub fn add(&self, rhs: &Mat15) -> Mat15 {
        let mut out = Mat15::zeros();
        for i in 0..NN {
            out.data[i] = self.data[i] + rhs.data[i];
        }
        out
    }

    /// 逐元素减法：`self - rhs`。
    pub fn sub(&self, rhs: &Mat15) -> Mat15 {
        let mut out = Mat15::zeros();
        for i in 0..NN {
            out.data[i] = self.data[i] - rhs.data[i];
        }
        out
    }

    /// 标量乘法：`self * s`。
    pub fn scale(&self, s: f64) -> Mat15 {
        let mut out = Mat15::zeros();
        for i in 0..NN {
            out.data[i] = self.data[i] * s;
        }
        out
    }

    /// 将列 3..6（速度块）提取为包含 15 个行向量的数组。
    ///
    /// 将 `P[:, 3..6]` 作为 `[[f64; 3]; 15]` 返回，其中 `result[i][j]` 为
    /// `P(i, 3+j)`。这是计算 ZUPT Kalman 增益所需的 `P * Hᵀ` 因子
    /// （由于 H = [0|I₃|0|0|0]，有 P*Hᵀ = P[:, 3..6]）。
    pub fn velocity_cols(&self) -> [[f64; 3]; N] {
        let mut out = [[0.0; 3]; N];
        for i in 0..N {
            out[i][0] = self.data[i * N + 3];
            out[i][1] = self.data[i * N + 4];
            out[i][2] = self.data[i * N + 5];
        }
        out
    }

    /// 就地对协方差应用 ZUPT 量测更新。
    ///
    /// 计算 `P = (I - K * H) * P`，其中 H = \[0|I₃|0|0|0\] 用于选择速度行 3..6。
    /// Kalman 增益 K 以 `[[f64; 3]; 15]` 提供（15x3 矩阵，存储为 15 个长度为 3 的行向量）。
    ///
    /// 这会利用 H 的稀疏结构避免构造完整的 15x15 `K*H` 矩阵：
    /// 当 j 位于 3..6 时 `(K*H)[i][j] = K[i][j-3]`，否则为零。
    pub fn zupt_update(&mut self, k: &[[f64; 3]; N]) {
        // 计算 (I - K*H) * P。
        // 若 j 位于 [3,6)，则 (I - K*H)[i][j] = δ(i,j) - K[i][j-3]，否则为 δ(i,j)。
        //
        // 将结果的第 i 行计算为：
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

/// 15 元双精度向量。
///
/// 表示 ESKF 误差状态 δx = [δθ, δv, δp, δb_g, δb_a]ᵀ，
/// 其中每个子向量为三维（共 15 个状态）。
#[derive(Debug, Clone)]
pub struct Vec15 {
    /// 15 个元素。
    pub data: [f64; N],
}

impl Vec15 {
    /// 创建零向量。
    pub fn zeros() -> Self {
        Self { data: [0.0; N] }
    }

    /// 获取索引 `i` 处的元素。
    #[inline]
    pub fn get(&self, i: usize) -> f64 {
        self.data[i]
    }

    /// 设置索引 `i` 处的元素。
    #[inline]
    pub fn set(&mut self, i: usize, val: f64) {
        self.data[i] = val;
    }

    /// 逐元素加法。
    pub fn add(&self, rhs: &Vec15) -> Vec15 {
        let mut out = Vec15::zeros();
        for i in 0..N {
            out.data[i] = self.data[i] + rhs.data[i];
        }
        out
    }

    /// 逐元素减法。
    pub fn sub(&self, rhs: &Vec15) -> Vec15 {
        let mut out = Vec15::zeros();
        for i in 0..N {
            out.data[i] = self.data[i] - rhs.data[i];
        }
        out
    }

    /// 标量乘法。
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
        // 构造三个不同的非平凡矩阵，并验证 (A*B)*C == A*(B*C)。
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
