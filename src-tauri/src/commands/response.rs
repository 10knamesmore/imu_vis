use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct Response<T>
where
    T: Serialize,
{
    pub success: bool,
    pub data: Option<T>,
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
