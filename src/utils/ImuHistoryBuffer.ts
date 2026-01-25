import { ImuHistorySnapshot, Quaternion, ResponseData, Vector3 } from "../types";

const radToDeg = (rad: number) => (rad * 180) / Math.PI;

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

  snapshot(windowMs?: number): ImuHistorySnapshot {
    if (this.count === 0) {
      return {
        time: [],
        builtin: {
          accel: { x: [], y: [], z: [] },
          accelWithG: { x: [], y: [], z: [] },
          gyro: { x: [], y: [], z: [] },
          angle: { x: [], y: [], z: [] },
          quat: { w: [], x: [], y: [], z: [] },
          offset: { x: [], y: [], z: [] },
          accelNav: { x: [], y: [], z: [] },
        },
        calculated: {
          angle: { x: [], y: [], z: [] },
          attitude: { w: [], x: [], y: [], z: [] },
          velocity: { x: [], y: [], z: [] },
          position: { x: [], y: [], z: [] },
        },
        deltaAngle: { x: [], y: [], z: [] },
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
    const calcAngleX: number[] = new Array(size);
    const calcAngleY: number[] = new Array(size);
    const calcAngleZ: number[] = new Array(size);
    const attitudeW: number[] = new Array(size);
    const attitudeX: number[] = new Array(size);
    const attitudeY: number[] = new Array(size);
    const attitudeZ: number[] = new Array(size);
    const deltaAngleX: number[] = new Array(size);
    const deltaAngleY: number[] = new Array(size);
    const deltaAngleZ: number[] = new Array(size);
    const velocityX: number[] = new Array(size);
    const velocityY: number[] = new Array(size);
    const velocityZ: number[] = new Array(size);
    const positionX: number[] = new Array(size);
    const positionY: number[] = new Array(size);
    const positionZ: number[] = new Array(size);

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
      calcAngleX[j] = this.calcAngleX[idx];
      calcAngleY[j] = this.calcAngleY[idx];
      calcAngleZ[j] = this.calcAngleZ[idx];
      attitudeW[j] = this.attitudeW[idx];
      attitudeX[j] = this.attitudeX[idx];
      attitudeY[j] = this.attitudeY[idx];
      attitudeZ[j] = this.attitudeZ[idx];
      deltaAngleX[j] = this.deltaAngleX[idx];
      deltaAngleY[j] = this.deltaAngleY[idx];
      deltaAngleZ[j] = this.deltaAngleZ[idx];
      velocityX[j] = this.velocityX[idx];
      velocityY[j] = this.velocityY[idx];
      velocityZ[j] = this.velocityZ[idx];
      positionX[j] = this.positionX[idx];
      positionY[j] = this.positionY[idx];
      positionZ[j] = this.positionZ[idx];
    }

    if (windowMs === undefined || time.length === 0) {
      return {
        time,
        builtin: {
          accel: { x: accelX, y: accelY, z: accelZ },
          accelWithG: { x: accelWithGX, y: accelWithGY, z: accelWithGZ },
          gyro: { x: gyroX, y: gyroY, z: gyroZ },
          angle: { x: angleX, y: angleY, z: angleZ },
          quat: { w: quatW, x: quatX, y: quatY, z: quatZ },
          offset: { x: offsetX, y: offsetY, z: offsetZ },
          accelNav: { x: accelNavX, y: accelNavY, z: accelNavZ },
        },
        calculated: {
          angle: { x: calcAngleX, y: calcAngleY, z: calcAngleZ },
          attitude: { w: attitudeW, x: attitudeX, y: attitudeY, z: attitudeZ },
          velocity: { x: velocityX, y: velocityY, z: velocityZ },
          position: { x: positionX, y: positionY, z: positionZ },
        },
        deltaAngle: { x: deltaAngleX, y: deltaAngleY, z: deltaAngleZ },
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
      builtin: {
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
      },
      calculated: {
        angle: {
          x: calcAngleX.slice(sliceStart),
          y: calcAngleY.slice(sliceStart),
          z: calcAngleZ.slice(sliceStart),
        },
        attitude: {
          w: attitudeW.slice(sliceStart),
          x: attitudeX.slice(sliceStart),
          y: attitudeY.slice(sliceStart),
          z: attitudeZ.slice(sliceStart),
        },
        velocity: {
          x: velocityX.slice(sliceStart),
          y: velocityY.slice(sliceStart),
          z: velocityZ.slice(sliceStart),
        },
        position: {
          x: positionX.slice(sliceStart),
          y: positionY.slice(sliceStart),
          z: positionZ.slice(sliceStart),
        },
      },
      deltaAngle: {
        x: deltaAngleX.slice(sliceStart),
        y: deltaAngleY.slice(sliceStart),
        z: deltaAngleZ.slice(sliceStart),
      },
    };
  }
}
