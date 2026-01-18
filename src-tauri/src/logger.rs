use tracing::level_filters::LevelFilter;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{
    filter::Targets,
    fmt::{self, format::FmtSpan},
    layer::SubscriberExt,
    util::SubscriberInitExt,
    Layer,
};

pub fn init_tracing() -> WorkerGuard {
    let stdout_layer = if cfg!(debug_assertions) {
        let targets = Targets::new()
            .with_target("bluez_async::events", LevelFilter::INFO)
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
    let (file_writer, guard) = tracing_appender::non_blocking(file_appender);
    let json_layer = fmt::layer()
        .json()
        .with_writer(file_writer)
        .with_current_span(true)
        .with_span_list(true)
        .with_span_events(FmtSpan::CLOSE);

    tracing_subscriber::registry()
        .with(stdout_layer)
        .with(json_layer)
        .init();

    guard
}
