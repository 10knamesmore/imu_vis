import { IMUData, ImuDataHistory } from "../types";

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

  constructor(capacity = 4096) {
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
  }

  clear() {
    this.count = 0;
    this.writeIndex = 0;
  }

  push(imu: IMUData, streamStartMs: number) {
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

    this.writeIndex = (i + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  snapshot(windowMs?: number): ImuDataHistory {
    if (this.count === 0) {
      return {
        time: [],
        accel: { x: [], y: [], z: [] },
        accelWithG: { x: [], y: [], z: [] },
        gyro: { x: [], y: [], z: [] },
        angle: { x: [], y: [], z: [] },
        quat: { w: [], x: [], y: [], z: [] },
        offset: { x: [], y: [], z: [] },
        accelNav: { x: [], y: [], z: [] },
      };
    }

    const size = this.count;
    const start = (this.writeIndex - size + this.capacity) % this.capacity;
    const time: number[] = new Array(size);
    const accelX: number[] = new Array(size);
    const accelY: number[] = new Array(size);
    const accelZ: number[] = new Array(size);
    const accelWithGX: number[] = new Array(size);
    const accelWithGY: number[] = new Array(size);
    const accelWithGZ: number[] = new Array(size);
    const gyroX: number[] = new Array(size);
    const gyroY: number[] = new Array(size);
    const gyroZ: number[] = new Array(size);
    const angleX: number[] = new Array(size);
    const angleY: number[] = new Array(size);
    const angleZ: number[] = new Array(size);
    const quatW: number[] = new Array(size);
    const quatX: number[] = new Array(size);
    const quatY: number[] = new Array(size);
    const quatZ: number[] = new Array(size);
    const offsetX: number[] = new Array(size);
    const offsetY: number[] = new Array(size);
    const offsetZ: number[] = new Array(size);
    const accelNavX: number[] = new Array(size);
    const accelNavY: number[] = new Array(size);
    const accelNavZ: number[] = new Array(size);

    for (let j = 0; j < size; j += 1) {
      const idx = (start + j) % this.capacity;
      time[j] = this.timeMs[idx];
      accelX[j] = this.accelX[idx];
      accelY[j] = this.accelY[idx];
      accelZ[j] = this.accelZ[idx];
      accelWithGX[j] = this.accelWithGX[idx];
      accelWithGY[j] = this.accelWithGY[idx];
      accelWithGZ[j] = this.accelWithGZ[idx];
      gyroX[j] = this.gyroX[idx];
      gyroY[j] = this.gyroY[idx];
      gyroZ[j] = this.gyroZ[idx];
      angleX[j] = this.angleX[idx];
      angleY[j] = this.angleY[idx];
      angleZ[j] = this.angleZ[idx];
      quatW[j] = this.quatW[idx];
      quatX[j] = this.quatX[idx];
      quatY[j] = this.quatY[idx];
      quatZ[j] = this.quatZ[idx];
      offsetX[j] = this.offsetX[idx];
      offsetY[j] = this.offsetY[idx];
      offsetZ[j] = this.offsetZ[idx];
      accelNavX[j] = this.accelNavX[idx];
      accelNavY[j] = this.accelNavY[idx];
      accelNavZ[j] = this.accelNavZ[idx];
    }

    if (windowMs === undefined || time.length === 0) {
      return {
        time,
        accel: { x: accelX, y: accelY, z: accelZ },
        accelWithG: { x: accelWithGX, y: accelWithGY, z: accelWithGZ },
        gyro: { x: gyroX, y: gyroY, z: gyroZ },
        angle: { x: angleX, y: angleY, z: angleZ },
        quat: { w: quatW, x: quatX, y: quatY, z: quatZ },
        offset: { x: offsetX, y: offsetY, z: offsetZ },
        accelNav: { x: accelNavX, y: accelNavY, z: accelNavZ },
      };
    }

    const lastTime = time[time.length - 1];
    const windowStart = lastTime - windowMs;
    let sliceStart = 0;
    while (sliceStart < time.length && time[sliceStart] < windowStart) {
      sliceStart += 1;
    }

    return {
      time: time.slice(sliceStart),
      accel: {
        x: accelX.slice(sliceStart),
        y: accelY.slice(sliceStart),
        z: accelZ.slice(sliceStart),
      },
      accelWithG: {
        x: accelWithGX.slice(sliceStart),
        y: accelWithGY.slice(sliceStart),
        z: accelWithGZ.slice(sliceStart),
      },
      gyro: {
        x: gyroX.slice(sliceStart),
        y: gyroY.slice(sliceStart),
        z: gyroZ.slice(sliceStart),
      },
      angle: {
        x: angleX.slice(sliceStart),
        y: angleY.slice(sliceStart),
        z: angleZ.slice(sliceStart),
      },
      quat: {
        w: quatW.slice(sliceStart),
        x: quatX.slice(sliceStart),
        y: quatY.slice(sliceStart),
        z: quatZ.slice(sliceStart),
      },
      offset: {
        x: offsetX.slice(sliceStart),
        y: offsetY.slice(sliceStart),
        z: offsetZ.slice(sliceStart),
      },
      accelNav: {
        x: accelNavX.slice(sliceStart),
        y: accelNavY.slice(sliceStart),
        z: accelNavZ.slice(sliceStart),
      },
    };
  }
}
