import { Quaternion, ResponseData, Vector3 } from "../types";

export type ImuHistoryWindow = {
  count: number;
  latestTime: number;
  getIndex: (viewIndex: number) => number;
  getTime: (viewIndex: number) => number;
  getValue: (buffer: Float32Array | Float64Array, viewIndex: number) => number;
  timeMs: Float64Array;
  accelX: Float32Array;
  accelY: Float32Array;
  accelZ: Float32Array;
  angleX: Float32Array;
  angleY: Float32Array;
  angleZ: Float32Array;
  attitudeW: Float32Array;
  attitudeX: Float32Array;
  attitudeY: Float32Array;
  attitudeZ: Float32Array;
  velocityX: Float32Array;
  velocityY: Float32Array;
  velocityZ: Float32Array;
  positionX: Float32Array;
  positionY: Float32Array;
  positionZ: Float32Array;
};

const radToDeg = (rad: number) => (rad * 180) / Math.PI;

/**
 * 四元数转换成欧拉角
 * @param quat - 四元数
 * @returns 欧拉角
 */
const quatToEulerDegrees = (quat: Quaternion): Vector3 => {
  const { w, x, y, z } = quat;
  const sinyCosp = 2 * (w * z + x * y);
  const cosyCosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(sinyCosp, cosyCosp);

  const sinp = 2 * (w * y - z * x);
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp);

  const sinrCosp = 2 * (w * x + y * z);
  const cosrCosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinrCosp, cosrCosp);

  return {
    x: radToDeg(roll),
    y: radToDeg(pitch),
    z: radToDeg(yaw),
  };
};

export class ImuHistoryBuffer {
  private capacity: number;
  private count: number;
  private writeIndex: number;
  private timeMs: Float64Array;
  private accelX: Float32Array;
  private accelY: Float32Array;
  private accelZ: Float32Array;
  private angleX: Float32Array;
  private angleY: Float32Array;
  private angleZ: Float32Array;
  private attitudeW: Float32Array;
  private attitudeX: Float32Array;
  private attitudeY: Float32Array;
  private attitudeZ: Float32Array;
  private velocityX: Float32Array;
  private velocityY: Float32Array;
  private velocityZ: Float32Array;
  private positionX: Float32Array;
  private positionY: Float32Array;
  private positionZ: Float32Array;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.count = 0;
    this.writeIndex = 0;
    this.timeMs = new Float64Array(capacity);
    this.accelX = new Float32Array(capacity);
    this.accelY = new Float32Array(capacity);
    this.accelZ = new Float32Array(capacity);
    this.angleX = new Float32Array(capacity);
    this.angleY = new Float32Array(capacity);
    this.angleZ = new Float32Array(capacity);
    this.attitudeW = new Float32Array(capacity);
    this.attitudeX = new Float32Array(capacity);
    this.attitudeY = new Float32Array(capacity);
    this.attitudeZ = new Float32Array(capacity);
    this.velocityX = new Float32Array(capacity);
    this.velocityY = new Float32Array(capacity);
    this.velocityZ = new Float32Array(capacity);
    this.positionX = new Float32Array(capacity);
    this.positionY = new Float32Array(capacity);
    this.positionZ = new Float32Array(capacity);
  }

  clear() {
    this.count = 0;
    this.writeIndex = 0;
  }

  push(msg: ResponseData, streamStartMs: number) {
    const i = this.writeIndex;
    this.timeMs[i] = msg.timestamp_ms - streamStartMs;
    this.accelX[i] = msg.accel.x;
    this.accelY[i] = msg.accel.y;
    this.accelZ[i] = msg.accel.z;

    const angle = quatToEulerDegrees(msg.attitude);
    this.angleX[i] = angle.x;
    this.angleY[i] = angle.y;
    this.angleZ[i] = angle.z;
    this.attitudeW[i] = msg.attitude.w;
    this.attitudeX[i] = msg.attitude.x;
    this.attitudeY[i] = msg.attitude.y;
    this.attitudeZ[i] = msg.attitude.z;
    this.velocityX[i] = msg.velocity.x;
    this.velocityY[i] = msg.velocity.y;
    this.velocityZ[i] = msg.velocity.z;
    this.positionX[i] = msg.position.x;
    this.positionY[i] = msg.position.y;
    this.positionZ[i] = msg.position.z;

    this.writeIndex = (i + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  /**
   * 获取环形缓冲区的时间窗口视图：
   * - 使用二分查找定位时间范围，避免线性扫描。
   * - 返回索引映射与原始缓冲区引用，减少中间数组复制。
   *
   * @param durationMs 视图窗口的时长（毫秒）。
   * @param offsetMs 相对最新数据的回退偏移（毫秒），0 表示跟随最新。
   * @returns 时间窗口视图，包含索引映射、窗口内数量以及原始缓冲区引用。
   */
  getWindow(durationMs: number, offsetMs: number): ImuHistoryWindow {
    const makeWindow = (count: number, latestTime: number, getIndex: (v: number) => number, getTime: (v: number) => number, getValue: (buf: Float32Array | Float64Array, v: number) => number): ImuHistoryWindow => ({
      count,
      latestTime,
      getIndex,
      getTime,
      getValue,
      timeMs: this.timeMs,
      accelX: this.accelX,
      accelY: this.accelY,
      accelZ: this.accelZ,
      angleX: this.angleX,
      angleY: this.angleY,
      angleZ: this.angleZ,
      attitudeW: this.attitudeW,
      attitudeX: this.attitudeX,
      attitudeY: this.attitudeY,
      attitudeZ: this.attitudeZ,
      velocityX: this.velocityX,
      velocityY: this.velocityY,
      velocityZ: this.velocityZ,
      positionX: this.positionX,
      positionY: this.positionY,
      positionZ: this.positionZ,
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
      let lo = 0;
      let hi = this.count;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (getTimeAt(mid) < target) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }
      return lo;
    };

    const upperBound = (target: number) => {
      let lo = 0;
      let hi = this.count;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (getTimeAt(mid) <= target) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
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
    const getValue = (buffer: Float32Array | Float64Array, viewIndex: number) =>
      buffer[getIndex(viewIndex)];

    return makeWindow(count, latestTime, getIndex, getTime, getValue);
  }
}
