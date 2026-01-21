//! IPC 通用响应类型。

use serde::Serialize;

#[derive(Debug, Serialize)]
/// IPC 响应包装。
pub struct Response<T>
where
    T: Serialize,
{
    /// 是否成功。
    pub success: bool,
    /// 返回数据。
    pub data: Option<T>,
    /// 提示消息。
    pub message: String,
}

impl<T> Response<T>
where
    T: Serialize,
{
    /// 快速构造成功响应
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            message: "ok".to_string(),
            data: Some(data),
        }
    }

    /// 构造失败响应
    pub fn error<S: Into<String>>(message: S) -> Self {
        Self {
            success: false,
            message: message.into(),
            data: None,
        }
    }
}

impl<T> From<anyhow::Result<T>> for Response<T>
where
    T: Serialize,
{
    fn from(result: anyhow::Result<T>) -> Self {
        match result {
            Ok(data) => Response::success(data),
            // Use alternate Display to include the full context chain.
            Err(e) => Response::error(format!("{:#}", e)),
        }
    }
}

impl<T> From<anyhow::Error> for Response<T>
where
    T: Serialize,
{
    fn from(e: anyhow::Error) -> Self {
        // Use alternate Display to include the full context chain.
        Response::error(format!("{:#}", e))
    }
}
