//! Debug 监控事件 Layer 与 1Hz 聚合发送。

use std::{
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, OnceLock,
    },
    thread,
    time::Duration,
};

use tracing::{
    field::{Field, Visit},
    Event, Subscriber,
};
use tracing_subscriber::{layer::Context, Layer};

use crate::types::debug::{DebugMonitorTick, QueueDepth};

/// Debug 监控事件目标名。
pub const DEBUG_MONITOR_TARGET: &str = "imu_app.debug_monitor";

/// 创建 Debug 监控 Layer。
pub fn create_monitor_layer() -> DebugMonitorLayer {
    DebugMonitorLayer {
        state: monitor_state().clone(),
    }
}

/// 安装监控流发送通道。
pub fn install_monitor_sender(sender: flume::Sender<DebugMonitorTick>) {
    let state = monitor_state();
    let mut guard = state
        .sender
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *guard = Some(sender);
}

#[derive(Clone)]
/// 负责接收 tracing 事件并更新监控计数的 Layer。
pub struct DebugMonitorLayer {
    state: Arc<MonitorState>,
}

impl<S> Layer<S> for DebugMonitorLayer
where
    S: Subscriber,
{
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        if event.metadata().target() != DEBUG_MONITOR_TARGET {
            return;
        }

        let mut visitor = MonitorEventVisitor::default();
        event.record(&mut visitor);

        match visitor.metric.as_deref() {
            Some("input") => {
                self.state.input_count.fetch_add(1, Ordering::Relaxed);
            }
            Some("pipeline") => {
                self.state.pipeline_count.fetch_add(1, Ordering::Relaxed);
            }
            Some("output") => {
                self.state.output_count.fetch_add(1, Ordering::Relaxed);
            }
            Some("queue_depth") => {
                if let (Some(upstream), Some(downstream), Some(record)) =
                    (visitor.upstream, visitor.downstream, visitor.record)
                {
                    self.state.update_depth(upstream, downstream, record);
                }
            }
            _ => {}
        }
    }
}

#[derive(Default)]
struct MonitorEventVisitor {
    metric: Option<String>,
    upstream: Option<u64>,
    downstream: Option<u64>,
    record: Option<u64>,
}

impl Visit for MonitorEventVisitor {
    fn record_str(&mut self, field: &Field, value: &str) {
        if field.name() == "metric" {
            self.metric = Some(value.to_string());
        }
    }

    fn record_u64(&mut self, field: &Field, value: u64) {
        match field.name() {
            "upstream" => self.upstream = Some(value),
            "downstream" => self.downstream = Some(value),
            "record" => self.record = Some(value),
            _ => {}
        }
    }

    fn record_i64(&mut self, field: &Field, value: i64) {
        if value < 0 {
            return;
        }
        self.record_u64(field, value as u64);
    }

    fn record_debug(&mut self, _field: &Field, _value: &dyn std::fmt::Debug) {}
}

#[derive(Default)]
struct MonitorState {
    input_count: AtomicU64,
    pipeline_count: AtomicU64,
    output_count: AtomicU64,
    depth_upstream: AtomicU64,
    depth_downstream: AtomicU64,
    depth_record: AtomicU64,
    peak_upstream: AtomicU64,
    peak_downstream: AtomicU64,
    peak_record: AtomicU64,
    sender: Mutex<Option<flume::Sender<DebugMonitorTick>>>,
}

impl MonitorState {
    fn update_depth(&self, upstream: u64, downstream: u64, record: u64) {
        self.depth_upstream.store(upstream, Ordering::Relaxed);
        self.depth_downstream.store(downstream, Ordering::Relaxed);
        self.depth_record.store(record, Ordering::Relaxed);
        update_peak(&self.peak_upstream, upstream);
        update_peak(&self.peak_downstream, downstream);
        update_peak(&self.peak_record, record);
    }

    fn flush_tick(&self) {
        let input_hz = self.input_count.swap(0, Ordering::Relaxed) as f64;
        let pipeline_hz = self.pipeline_count.swap(0, Ordering::Relaxed) as f64;
        let output_hz = self.output_count.swap(0, Ordering::Relaxed) as f64;
        let queue_depth = QueueDepth {
            upstream: self.depth_upstream.load(Ordering::Relaxed),
            downstream: self.depth_downstream.load(Ordering::Relaxed),
            record: self.depth_record.load(Ordering::Relaxed),
        };
        let queue_peak = QueueDepth {
            upstream: self.peak_upstream.swap(0, Ordering::Relaxed),
            downstream: self.peak_downstream.swap(0, Ordering::Relaxed),
            record: self.peak_record.swap(0, Ordering::Relaxed),
        };

        let sender = {
            let guard = self
                .sender
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            guard.clone()
        };

        if let Some(tx) = sender {
            let tick = DebugMonitorTick {
                ts_ms: now_ms(),
                input_hz,
                pipeline_hz,
                output_hz,
                frontend_rx_hz: 0.0,
                queue_depth,
                queue_peak,
                ext: None,
            };
            if let Err(error) = tx.try_send(tick) {
                tracing::debug!("Debug 监控帧发送失败: {:?}", error);
            }
        }
    }
}

fn monitor_state() -> &'static Arc<MonitorState> {
    static STATE: OnceLock<Arc<MonitorState>> = OnceLock::new();

    STATE.get_or_init(|| {
        let state = Arc::new(MonitorState::default());
        let thread_state = state.clone();
        let spawn_result = thread::Builder::new()
            .name("DebugMonitorTicker".to_string())
            .spawn(move || loop {
                thread::sleep(Duration::from_secs(1));
                thread_state.flush_tick();
            });
        if let Err(error) = spawn_result {
            tracing::error!("创建 DebugMonitorTicker 线程失败: {:?}", error);
        }
        state
    })
}

fn update_peak(peak: &AtomicU64, candidate: u64) {
    let mut current = peak.load(Ordering::Relaxed);
    while candidate > current {
        match peak.compare_exchange(current, candidate, Ordering::Relaxed, Ordering::Relaxed) {
            Ok(_) => break,
            Err(observed) => current = observed,
        }
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}
