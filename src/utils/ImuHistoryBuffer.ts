import { Quaternion, ResponseData, Vector3 } from "../types";

export type ImuHistoryWindow = {
  count: number;
  latestTime: number;
  getIndex: (viewIndex: number) => number;
  getTime: (viewIndex: number) => number;
  getValue: (buffer: Float32Array | Float64Array, viewIndex: number) => number;
  timeMs: Float64Array;
  builtin: {
    accelX: Float32Array;
    accelY: Float32Array;
    accelZ: Float32Array;
    accelWithGX: Float32Array;
    accelWithGY: Float32Array;
    accelWithGZ: Float32Array;
    gyroX: Float32Array;
    gyroY: Float32Array;
    gyroZ: Float32Array;
    angleX: Float32Array;
    angleY: Float32Array;
    angleZ: Float32Array;
    quatW: Float32Array;
    quatX: Float32Array;
    quatY: Float32Array;
    quatZ: Float32Array;
    offsetX: Float32Array;
    offsetY: Float32Array;
    offsetZ: Float32Array;
    accelNavX: Float32Array;
    accelNavY: Float32Array;
    accelNavZ: Float32Array;
  };
  calculated: {
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
  deltaAngleX: Float32Array;
  deltaAngleY: Float32Array;
  deltaAngleZ: Float32Array;
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
  private accelWithGX: Float32Array;
  private accelWithGY: Float32Array;
  private accelWithGZ: Float32Array;
  private gyroX: Float32Array;
  private gyroY: Float32Array;
  private gyroZ: Float32Array;
  private angleX: Float32Array;
  private angleY: Float32Array;
  private angleZ: Float32Array;
  private quatW: Float32Array;
  private quatX: Float32Array;
  private quatY: Float32Array;
  private quatZ: Float32Array;
  private offsetX: Float32Array;
  private offsetY: Float32Array;
  private offsetZ: Float32Array;
  private accelNavX: Float32Array;
  private accelNavY: Float32Array;
  private accelNavZ: Float32Array;
  private calcAngleX: Float32Array;
  private calcAngleY: Float32Array;
  private calcAngleZ: Float32Array;
  private attitudeW: Float32Array;
  private attitudeX: Float32Array;
  private attitudeY: Float32Array;
  private attitudeZ: Float32Array;
  private deltaAngleX: Float32Array;
  private deltaAngleY: Float32Array;
  private deltaAngleZ: Float32Array;
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
    this.accelWithGX = new Float32Array(capacity);
    this.accelWithGY = new Float32Array(capacity);
    this.accelWithGZ = new Float32Array(capacity);
    this.gyroX = new Float32Array(capacity);
    this.gyroY = new Float32Array(capacity);
    this.gyroZ = new Float32Array(capacity);
    this.angleX = new Float32Array(capacity);
    this.angleY = new Float32Array(capacity);
    this.angleZ = new Float32Array(capacity);
    this.quatW = new Float32Array(capacity);
    this.quatX = new Float32Array(capacity);
    this.quatY = new Float32Array(capacity);
    this.quatZ = new Float32Array(capacity);
    this.offsetX = new Float32Array(capacity);
    this.offsetY = new Float32Array(capacity);
    this.offsetZ = new Float32Array(capacity);
    this.accelNavX = new Float32Array(capacity);
    this.accelNavY = new Float32Array(capacity);
    this.accelNavZ = new Float32Array(capacity);
    this.calcAngleX = new Float32Array(capacity);
    this.calcAngleY = new Float32Array(capacity);
    this.calcAngleZ = new Float32Array(capacity);
    this.attitudeW = new Float32Array(capacity);
    this.attitudeX = new Float32Array(capacity);
    this.attitudeY = new Float32Array(capacity);
    this.attitudeZ = new Float32Array(capacity);
    this.deltaAngleX = new Float32Array(capacity);
    this.deltaAngleY = new Float32Array(capacity);
    this.deltaAngleZ = new Float32Array(capacity);
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
    const imu = msg.raw_data;
    const calculated = msg.calculated_data;
    const i = this.writeIndex;
    this.timeMs[i] = imu.timestamp_ms - streamStartMs;
    this.accelX[i] = imu.accel_no_g.x;
    this.accelY[i] = imu.accel_no_g.y;
    this.accelZ[i] = imu.accel_no_g.z;
    this.accelWithGX[i] = imu.accel_with_g.x;
    this.accelWithGY[i] = imu.accel_with_g.y;
    this.accelWithGZ[i] = imu.accel_with_g.z;
    this.gyroX[i] = imu.gyro.x;
    this.gyroY[i] = imu.gyro.y;
    this.gyroZ[i] = imu.gyro.z;
    this.angleX[i] = imu.angle.x;
    this.angleY[i] = imu.angle.y;
    this.angleZ[i] = imu.angle.z;
    this.quatW[i] = imu.quat.w;
    this.quatX[i] = imu.quat.x;
    this.quatY[i] = imu.quat.y;
    this.quatZ[i] = imu.quat.z;
    this.offsetX[i] = imu.offset.x;
    this.offsetY[i] = imu.offset.y;
    this.offsetZ[i] = imu.offset.z;
    this.accelNavX[i] = imu.accel_nav.x;
    this.accelNavY[i] = imu.accel_nav.y;
    this.accelNavZ[i] = imu.accel_nav.z;

    const calcAngle = quatToEulerDegrees(calculated.attitude);
    this.calcAngleX[i] = calcAngle.x;
    this.calcAngleY[i] = calcAngle.y;
    this.calcAngleZ[i] = calcAngle.z;
    this.attitudeW[i] = calculated.attitude.w;
    this.attitudeX[i] = calculated.attitude.x;
    this.attitudeY[i] = calculated.attitude.y;
    this.attitudeZ[i] = calculated.attitude.z;
    this.deltaAngleX[i] = calcAngle.x - imu.angle.x;
    this.deltaAngleY[i] = calcAngle.y - imu.angle.y;
    this.deltaAngleZ[i] = calcAngle.z - imu.angle.z;
    this.velocityX[i] = calculated.velocity.x;
    this.velocityY[i] = calculated.velocity.y;
    this.velocityZ[i] = calculated.velocity.z;
    this.positionX[i] = calculated.position.x;
    this.positionY[i] = calculated.position.y;
    this.positionZ[i] = calculated.position.z;

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
    if (this.count === 0) {
      return {
        count: 0,
        latestTime: 0,
        getIndex: () => 0,
        getTime: () => 0,
        getValue: () => 0,
        timeMs: this.timeMs,
        builtin: {
          accelX: this.accelX,
          accelY: this.accelY,
          accelZ: this.accelZ,
          accelWithGX: this.accelWithGX,
          accelWithGY: this.accelWithGY,
          accelWithGZ: this.accelWithGZ,
          gyroX: this.gyroX,
          gyroY: this.gyroY,
          gyroZ: this.gyroZ,
          angleX: this.angleX,
          angleY: this.angleY,
          angleZ: this.angleZ,
          quatW: this.quatW,
          quatX: this.quatX,
          quatY: this.quatY,
          quatZ: this.quatZ,
          offsetX: this.offsetX,
          offsetY: this.offsetY,
          offsetZ: this.offsetZ,
          accelNavX: this.accelNavX,
          accelNavY: this.accelNavY,
          accelNavZ: this.accelNavZ,
        },
        calculated: {
          angleX: this.calcAngleX,
          angleY: this.calcAngleY,
          angleZ: this.calcAngleZ,
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
        },
        deltaAngleX: this.deltaAngleX,
        deltaAngleY: this.deltaAngleY,
        deltaAngleZ: this.deltaAngleZ,
      };
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

    return {
      count,
      latestTime,
      getIndex,
      getTime,
      getValue,
      timeMs: this.timeMs,
      builtin: {
        accelX: this.accelX,
        accelY: this.accelY,
        accelZ: this.accelZ,
        accelWithGX: this.accelWithGX,
        accelWithGY: this.accelWithGY,
        accelWithGZ: this.accelWithGZ,
        gyroX: this.gyroX,
        gyroY: this.gyroY,
        gyroZ: this.gyroZ,
        angleX: this.angleX,
        angleY: this.angleY,
        angleZ: this.angleZ,
        quatW: this.quatW,
        quatX: this.quatX,
        quatY: this.quatY,
        quatZ: this.quatZ,
        offsetX: this.offsetX,
        offsetY: this.offsetY,
        offsetZ: this.offsetZ,
        accelNavX: this.accelNavX,
        accelNavY: this.accelNavY,
        accelNavZ: this.accelNavZ,
      },
      calculated: {
        angleX: this.calcAngleX,
        angleY: this.calcAngleY,
        angleZ: this.calcAngleZ,
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
      },
      deltaAngleX: this.deltaAngleX,
      deltaAngleY: this.deltaAngleY,
      deltaAngleZ: this.deltaAngleZ,
    };
  }
}
