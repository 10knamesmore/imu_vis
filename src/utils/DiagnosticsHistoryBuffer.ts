import type { PipelineDiagnostics } from "../types";

/**
 * 诊断数据时间窗口视图。
 *
 * 与 ImuHistoryWindow 相同的接口约定（count / getIndex / getTime / getValue），
 * 使 ImuChartsCanvas 可直接复用。
 */
export type DiagnosticsHistoryWindow = {
  count: number;
  latestTime: number;
  getIndex: (viewIndex: number) => number;
  getTime: (viewIndex: number) => number;
  getValue: (buffer: Float32Array | Float64Array | Uint8Array, viewIndex: number) => number;
  // 标定阶段
  calAccelBiasX: Float32Array;
  calAccelBiasY: Float32Array;
  calAccelBiasZ: Float32Array;
  calGyroBiasX: Float32Array;
  calGyroBiasY: Float32Array;
  calGyroBiasZ: Float32Array;
  calAccelPreX: Float32Array;
  calAccelPreY: Float32Array;
  calAccelPreZ: Float32Array;
  calAccelPostX: Float32Array;
  calAccelPostY: Float32Array;
  calAccelPostZ: Float32Array;
  calGyroPreX: Float32Array;
  calGyroPreY: Float32Array;
  calGyroPreZ: Float32Array;
  calGyroPostX: Float32Array;
  calGyroPostY: Float32Array;
  calGyroPostZ: Float32Array;
  // 滤波阶段
  filtAccelPreX: Float32Array;
  filtAccelPreY: Float32Array;
  filtAccelPreZ: Float32Array;
  filtAccelPostX: Float32Array;
  filtAccelPostY: Float32Array;
  filtAccelPostZ: Float32Array;
  filtGyroPreX: Float32Array;
  filtGyroPreY: Float32Array;
  filtGyroPreZ: Float32Array;
  filtGyroPostX: Float32Array;
  filtGyroPostY: Float32Array;
  filtGyroPostZ: Float32Array;
  // ZUPT 阶段
  zuptIsStatic: Uint8Array;
  zuptGyroNorm: Float32Array;
  zuptAccelNorm: Float32Array;
  zuptEnterCount: Float32Array;
  zuptExitCount: Float32Array;
  // 导航阶段
  navDt: Float32Array;
  navLinAccelX: Float32Array;
  navLinAccelY: Float32Array;
  navLinAccelZ: Float32Array;
  // 饱和检测
  accelSaturated: Uint8Array;
  // ESKF (速度不确定度 = cov_diag[3..6])
  eskfCovVelX: Float32Array;
  eskfCovVelY: Float32Array;
  eskfCovVelZ: Float32Array;
  eskfBiasGyroX: Float32Array;
  eskfBiasGyroY: Float32Array;
  eskfBiasGyroZ: Float32Array;
  eskfBiasAccelX: Float32Array;
  eskfBiasAccelY: Float32Array;
  eskfBiasAccelZ: Float32Array;
  // 性能
  perfProcessUs: Float32Array;
  perfUpstreamQueueLen: Float32Array;
  perfDownstreamQueueLen: Float32Array;
  perfRecordQueueLen: Float32Array;
  perfBleIntervalMs: Float32Array;
};

/**
 * 诊断数据环形缓冲区。
 *
 * 使用预分配的 TypedArray 存储，避免 GC 抖动。
 * 提供与 ImuHistoryBuffer 相同的 getWindow 接口。
 */
export class DiagnosticsHistoryBuffer {
  private capacity: number;
  private count = 0;
  private writeIndex = 0;
  private timeMs: Float64Array;
  // 标定
  private calAccelBiasX: Float32Array;
  private calAccelBiasY: Float32Array;
  private calAccelBiasZ: Float32Array;
  private calGyroBiasX: Float32Array;
  private calGyroBiasY: Float32Array;
  private calGyroBiasZ: Float32Array;
  private calAccelPreX: Float32Array;
  private calAccelPreY: Float32Array;
  private calAccelPreZ: Float32Array;
  private calAccelPostX: Float32Array;
  private calAccelPostY: Float32Array;
  private calAccelPostZ: Float32Array;
  private calGyroPreX: Float32Array;
  private calGyroPreY: Float32Array;
  private calGyroPreZ: Float32Array;
  private calGyroPostX: Float32Array;
  private calGyroPostY: Float32Array;
  private calGyroPostZ: Float32Array;
  // 滤波
  private filtAccelPreX: Float32Array;
  private filtAccelPreY: Float32Array;
  private filtAccelPreZ: Float32Array;
  private filtAccelPostX: Float32Array;
  private filtAccelPostY: Float32Array;
  private filtAccelPostZ: Float32Array;
  private filtGyroPreX: Float32Array;
  private filtGyroPreY: Float32Array;
  private filtGyroPreZ: Float32Array;
  private filtGyroPostX: Float32Array;
  private filtGyroPostY: Float32Array;
  private filtGyroPostZ: Float32Array;
  // ZUPT
  private zuptIsStatic: Uint8Array;
  private zuptGyroNorm: Float32Array;
  private zuptAccelNorm: Float32Array;
  private zuptEnterCount: Float32Array;
  private zuptExitCount: Float32Array;
  // 导航
  private navDt: Float32Array;
  private navLinAccelX: Float32Array;
  private navLinAccelY: Float32Array;
  private navLinAccelZ: Float32Array;
  // 饱和检测
  private accelSaturated: Uint8Array;
  // ESKF
  private eskfCovVelX: Float32Array;
  private eskfCovVelY: Float32Array;
  private eskfCovVelZ: Float32Array;
  private eskfBiasGyroX: Float32Array;
  private eskfBiasGyroY: Float32Array;
  private eskfBiasGyroZ: Float32Array;
  private eskfBiasAccelX: Float32Array;
  private eskfBiasAccelY: Float32Array;
  private eskfBiasAccelZ: Float32Array;
  // 性能
  private perfProcessUs: Float32Array;
  private perfUpstreamQueueLen: Float32Array;
  private perfDownstreamQueueLen: Float32Array;
  private perfRecordQueueLen: Float32Array;
  private perfBleIntervalMs: Float32Array;

  constructor(capacity: number) {
    this.capacity = capacity;
    const f32 = (n: number) => new Float32Array(n);
    this.timeMs = new Float64Array(capacity);
    this.calAccelBiasX = f32(capacity); this.calAccelBiasY = f32(capacity); this.calAccelBiasZ = f32(capacity);
    this.calGyroBiasX = f32(capacity); this.calGyroBiasY = f32(capacity); this.calGyroBiasZ = f32(capacity);
    this.calAccelPreX = f32(capacity); this.calAccelPreY = f32(capacity); this.calAccelPreZ = f32(capacity);
    this.calAccelPostX = f32(capacity); this.calAccelPostY = f32(capacity); this.calAccelPostZ = f32(capacity);
    this.calGyroPreX = f32(capacity); this.calGyroPreY = f32(capacity); this.calGyroPreZ = f32(capacity);
    this.calGyroPostX = f32(capacity); this.calGyroPostY = f32(capacity); this.calGyroPostZ = f32(capacity);
    this.filtAccelPreX = f32(capacity); this.filtAccelPreY = f32(capacity); this.filtAccelPreZ = f32(capacity);
    this.filtAccelPostX = f32(capacity); this.filtAccelPostY = f32(capacity); this.filtAccelPostZ = f32(capacity);
    this.filtGyroPreX = f32(capacity); this.filtGyroPreY = f32(capacity); this.filtGyroPreZ = f32(capacity);
    this.filtGyroPostX = f32(capacity); this.filtGyroPostY = f32(capacity); this.filtGyroPostZ = f32(capacity);
    this.zuptIsStatic = new Uint8Array(capacity);
    this.zuptGyroNorm = f32(capacity); this.zuptAccelNorm = f32(capacity);
    this.zuptEnterCount = f32(capacity); this.zuptExitCount = f32(capacity);
    this.navDt = f32(capacity);
    this.navLinAccelX = f32(capacity); this.navLinAccelY = f32(capacity); this.navLinAccelZ = f32(capacity);
    this.accelSaturated = new Uint8Array(capacity);
    this.eskfCovVelX = f32(capacity); this.eskfCovVelY = f32(capacity); this.eskfCovVelZ = f32(capacity);
    this.eskfBiasGyroX = f32(capacity); this.eskfBiasGyroY = f32(capacity); this.eskfBiasGyroZ = f32(capacity);
    this.eskfBiasAccelX = f32(capacity); this.eskfBiasAccelY = f32(capacity); this.eskfBiasAccelZ = f32(capacity);
    this.perfProcessUs = f32(capacity);
    this.perfUpstreamQueueLen = f32(capacity); this.perfDownstreamQueueLen = f32(capacity);
    this.perfRecordQueueLen = f32(capacity); this.perfBleIntervalMs = f32(capacity);
  }

  clear() {
    this.count = 0;
    this.writeIndex = 0;
  }

  push(msg: PipelineDiagnostics, streamStartMs: number) {
    const i = this.writeIndex;
    this.timeMs[i] = msg.timestamp_ms - streamStartMs;
    // 标定
    this.calAccelBiasX[i] = msg.cal_accel_bias.x; this.calAccelBiasY[i] = msg.cal_accel_bias.y; this.calAccelBiasZ[i] = msg.cal_accel_bias.z;
    this.calGyroBiasX[i] = msg.cal_gyro_bias.x; this.calGyroBiasY[i] = msg.cal_gyro_bias.y; this.calGyroBiasZ[i] = msg.cal_gyro_bias.z;
    this.calAccelPreX[i] = msg.cal_accel_pre.x; this.calAccelPreY[i] = msg.cal_accel_pre.y; this.calAccelPreZ[i] = msg.cal_accel_pre.z;
    this.calAccelPostX[i] = msg.cal_accel_post.x; this.calAccelPostY[i] = msg.cal_accel_post.y; this.calAccelPostZ[i] = msg.cal_accel_post.z;
    this.calGyroPreX[i] = msg.cal_gyro_pre.x; this.calGyroPreY[i] = msg.cal_gyro_pre.y; this.calGyroPreZ[i] = msg.cal_gyro_pre.z;
    this.calGyroPostX[i] = msg.cal_gyro_post.x; this.calGyroPostY[i] = msg.cal_gyro_post.y; this.calGyroPostZ[i] = msg.cal_gyro_post.z;
    // 滤波
    this.filtAccelPreX[i] = msg.filt_accel_pre.x; this.filtAccelPreY[i] = msg.filt_accel_pre.y; this.filtAccelPreZ[i] = msg.filt_accel_pre.z;
    this.filtAccelPostX[i] = msg.filt_accel_post.x; this.filtAccelPostY[i] = msg.filt_accel_post.y; this.filtAccelPostZ[i] = msg.filt_accel_post.z;
    this.filtGyroPreX[i] = msg.filt_gyro_pre.x; this.filtGyroPreY[i] = msg.filt_gyro_pre.y; this.filtGyroPreZ[i] = msg.filt_gyro_pre.z;
    this.filtGyroPostX[i] = msg.filt_gyro_post.x; this.filtGyroPostY[i] = msg.filt_gyro_post.y; this.filtGyroPostZ[i] = msg.filt_gyro_post.z;
    // ZUPT
    this.zuptIsStatic[i] = msg.zupt_is_static ? 1 : 0;
    this.zuptGyroNorm[i] = msg.zupt_gyro_norm; this.zuptAccelNorm[i] = msg.zupt_accel_norm;
    this.zuptEnterCount[i] = msg.zupt_enter_count; this.zuptExitCount[i] = msg.zupt_exit_count;
    // 导航
    this.navDt[i] = msg.nav_dt;
    this.navLinAccelX[i] = msg.nav_linear_accel.x; this.navLinAccelY[i] = msg.nav_linear_accel.y; this.navLinAccelZ[i] = msg.nav_linear_accel.z;
    // 饱和检测
    this.accelSaturated[i] = msg.accel_saturated ? 1 : 0;
    // ESKF
    const cov = msg.eskf_cov_diag;
    this.eskfCovVelX[i] = cov ? cov[3] : 0; this.eskfCovVelY[i] = cov ? cov[4] : 0; this.eskfCovVelZ[i] = cov ? cov[5] : 0;
    const bg = msg.eskf_bias_gyro;
    this.eskfBiasGyroX[i] = bg ? bg.x : 0; this.eskfBiasGyroY[i] = bg ? bg.y : 0; this.eskfBiasGyroZ[i] = bg ? bg.z : 0;
    const ba = msg.eskf_bias_accel;
    this.eskfBiasAccelX[i] = ba ? ba.x : 0; this.eskfBiasAccelY[i] = ba ? ba.y : 0; this.eskfBiasAccelZ[i] = ba ? ba.z : 0;
    // 性能
    this.perfProcessUs[i] = msg.perf_process_us;
    this.perfUpstreamQueueLen[i] = msg.perf_upstream_queue_len;
    this.perfDownstreamQueueLen[i] = msg.perf_downstream_queue_len;
    this.perfRecordQueueLen[i] = msg.perf_record_queue_len;
    this.perfBleIntervalMs[i] = msg.perf_ble_interval_ms;

    this.writeIndex = (i + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  getWindow(durationMs: number, offsetMs: number): DiagnosticsHistoryWindow {
    const self = this;
    const makeWindow = (
      count: number, latestTime: number,
      getIndex: (v: number) => number,
      getTime: (v: number) => number,
      getValue: (buf: Float32Array | Float64Array | Uint8Array, v: number) => number,
    ): DiagnosticsHistoryWindow => ({
      count, latestTime, getIndex, getTime, getValue,
      calAccelBiasX: self.calAccelBiasX, calAccelBiasY: self.calAccelBiasY, calAccelBiasZ: self.calAccelBiasZ,
      calGyroBiasX: self.calGyroBiasX, calGyroBiasY: self.calGyroBiasY, calGyroBiasZ: self.calGyroBiasZ,
      calAccelPreX: self.calAccelPreX, calAccelPreY: self.calAccelPreY, calAccelPreZ: self.calAccelPreZ,
      calAccelPostX: self.calAccelPostX, calAccelPostY: self.calAccelPostY, calAccelPostZ: self.calAccelPostZ,
      calGyroPreX: self.calGyroPreX, calGyroPreY: self.calGyroPreY, calGyroPreZ: self.calGyroPreZ,
      calGyroPostX: self.calGyroPostX, calGyroPostY: self.calGyroPostY, calGyroPostZ: self.calGyroPostZ,
      filtAccelPreX: self.filtAccelPreX, filtAccelPreY: self.filtAccelPreY, filtAccelPreZ: self.filtAccelPreZ,
      filtAccelPostX: self.filtAccelPostX, filtAccelPostY: self.filtAccelPostY, filtAccelPostZ: self.filtAccelPostZ,
      filtGyroPreX: self.filtGyroPreX, filtGyroPreY: self.filtGyroPreY, filtGyroPreZ: self.filtGyroPreZ,
      filtGyroPostX: self.filtGyroPostX, filtGyroPostY: self.filtGyroPostY, filtGyroPostZ: self.filtGyroPostZ,
      zuptIsStatic: self.zuptIsStatic, zuptGyroNorm: self.zuptGyroNorm, zuptAccelNorm: self.zuptAccelNorm,
      zuptEnterCount: self.zuptEnterCount, zuptExitCount: self.zuptExitCount,
      navDt: self.navDt, navLinAccelX: self.navLinAccelX, navLinAccelY: self.navLinAccelY, navLinAccelZ: self.navLinAccelZ,
      accelSaturated: self.accelSaturated,
      eskfCovVelX: self.eskfCovVelX, eskfCovVelY: self.eskfCovVelY, eskfCovVelZ: self.eskfCovVelZ,
      eskfBiasGyroX: self.eskfBiasGyroX, eskfBiasGyroY: self.eskfBiasGyroY, eskfBiasGyroZ: self.eskfBiasGyroZ,
      eskfBiasAccelX: self.eskfBiasAccelX, eskfBiasAccelY: self.eskfBiasAccelY, eskfBiasAccelZ: self.eskfBiasAccelZ,
      perfProcessUs: self.perfProcessUs, perfUpstreamQueueLen: self.perfUpstreamQueueLen,
      perfDownstreamQueueLen: self.perfDownstreamQueueLen, perfRecordQueueLen: self.perfRecordQueueLen,
      perfBleIntervalMs: self.perfBleIntervalMs,
    });

    if (this.count === 0) {
      return makeWindow(0, 0, () => 0, () => 0, () => 0);
    }

    const baseIndex = (this.writeIndex - this.count + this.capacity) % this.capacity;
    const getTimeAt = (logicalIndex: number) =>
      this.timeMs[(baseIndex + logicalIndex) % this.capacity];
    const latestTime = getTimeAt(this.count - 1);
    const clampedDuration = Math.max(0, durationMs);
    const clampedOffset = Math.max(0, offsetMs);
    const endTime = latestTime - clampedOffset;
    const startTime = endTime - clampedDuration;

    const lowerBound = (target: number) => {
      let lo = 0, hi = this.count;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (getTimeAt(mid) < target) lo = mid + 1; else hi = mid;
      }
      return lo;
    };
    const upperBound = (target: number) => {
      let lo = 0, hi = this.count;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (getTimeAt(mid) <= target) lo = mid + 1; else hi = mid;
      }
      return lo;
    };

    let startLogical = lowerBound(startTime);
    let endLogical = clampedOffset > 0 ? upperBound(endTime) : this.count;
    if (endLogical - startLogical < 2 && this.count >= 2) {
      endLogical = Math.min(this.count, startLogical + 2);
      startLogical = Math.max(0, endLogical - 2);
    }

    const count = Math.max(0, endLogical - startLogical);
    const startIndex = (baseIndex + startLogical) % this.capacity;
    const getIndex = (viewIndex: number) => (startIndex + viewIndex) % this.capacity;
    const getTime = (viewIndex: number) => this.timeMs[getIndex(viewIndex)];
    const getValue = (buffer: Float32Array | Float64Array | Uint8Array, viewIndex: number) =>
      buffer[getIndex(viewIndex)];

    return makeWindow(count, latestTime, getIndex, getTime, getValue);
  }
}
