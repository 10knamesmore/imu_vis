//! tracing 初始化与日志输出配置。

use tracing::level_filters::LevelFilter;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{
    filter::Targets, fmt::format::FmtSpan, layer::SubscriberExt, util::SubscriberInitExt, Layer,
};

use crate::debug_monitor;

/// 初始化 tracing 并返回 guard。
pub fn init_tracing() -> WorkerGuard {
    let stdout_layer = if cfg!(debug_assertions) {
        let targets = Targets::new()
            .with_target("bluez_async::events", LevelFilter::INFO)
            .with_target("sqlx", LevelFilter::WARN)
            .with_default(LevelFilter::DEBUG);
        Some(
            tracing_subscriber::fmt::layer()
                .with_target(true)
                .with_thread_ids(true)
                .with_line_number(true)
                .with_span_events(FmtSpan::CLOSE)
                .with_filter(LevelFilter::TRACE)
                .with_filter(targets),
        )
    } else {
        None
    };

    let file_appender = tracing_appender::rolling::daily("logs", "app.jsonl");
    let (_, guard) = tracing_appender::non_blocking(file_appender);
    // let json_layer = fmt::layer()
    //     .json()
    //     .with_writer(file_writer)
    //     .with_current_span(true)
    //     .with_span_list(true)
    //     .with_span_events(FmtSpan::CLOSE)
    //     .with_filter(LevelFilter::INFO);

    tracing_subscriber::registry()
        .with(debug_monitor::create_monitor_layer())
        .with(stdout_layer)
        // .with(json_layer)
        .init();

    guard
}
