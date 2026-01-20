import { CalculatedData, IMUData, ImuComparisonHistory, Vector3, Quaternion } from "../types";

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

export class ImuComparisonHistoryBuffer {
  private capacity: number;
  private count: number;
  private writeIndex: number;
  private timeMs: Float64Array;
  private rawAngleX: Float32Array;
  private rawAngleY: Float32Array;
  private rawAngleZ: Float32Array;
  private calcAngleX: Float32Array;
  private calcAngleY: Float32Array;
  private calcAngleZ: Float32Array;
  private deltaAngleX: Float32Array;
  private deltaAngleY: Float32Array;
  private deltaAngleZ: Float32Array;
  private velocityX: Float32Array;
  private velocityY: Float32Array;
  private velocityZ: Float32Array;
  private positionX: Float32Array;
  private positionY: Float32Array;
  private positionZ: Float32Array;

  constructor(capacity = 4096) {
    this.capacity = capacity;
    this.count = 0;
    this.writeIndex = 0;
    this.timeMs = new Float64Array(capacity);
    this.rawAngleX = new Float32Array(capacity);
    this.rawAngleY = new Float32Array(capacity);
    this.rawAngleZ = new Float32Array(capacity);
    this.calcAngleX = new Float32Array(capacity);
    this.calcAngleY = new Float32Array(capacity);
    this.calcAngleZ = new Float32Array(capacity);
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

  push(raw: IMUData, calculated: CalculatedData, streamStartMs: number) {
    const i = this.writeIndex;
    this.timeMs[i] = raw.timestamp_ms - streamStartMs;
    this.rawAngleX[i] = raw.angle.x;
    this.rawAngleY[i] = raw.angle.y;
    this.rawAngleZ[i] = raw.angle.z;

    const calcAngle = quatToEulerDegrees(calculated.attitude);
    this.calcAngleX[i] = calcAngle.x;
    this.calcAngleY[i] = calcAngle.y;
    this.calcAngleZ[i] = calcAngle.z;
    this.deltaAngleX[i] = calcAngle.x - raw.angle.x;
    this.deltaAngleY[i] = calcAngle.y - raw.angle.y;
    this.deltaAngleZ[i] = calcAngle.z - raw.angle.z;

    this.velocityX[i] = calculated.velocity.x;
    this.velocityY[i] = calculated.velocity.y;
    this.velocityZ[i] = calculated.velocity.z;
    this.positionX[i] = calculated.position.x;
    this.positionY[i] = calculated.position.y;
    this.positionZ[i] = calculated.position.z;

    this.writeIndex = (i + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  snapshot(): ImuComparisonHistory {
    if (this.count === 0) {
      return {
        time: [],
        rawAngle: { x: [], y: [], z: [] },
        calculatedAngle: { x: [], y: [], z: [] },
        deltaAngle: { x: [], y: [], z: [] },
        velocity: { x: [], y: [], z: [] },
        position: { x: [], y: [], z: [] },
      };
    }

    const size = this.count;
    const start = (this.writeIndex - size + this.capacity) % this.capacity;
    const time: number[] = new Array(size);
    const rawAngleX: number[] = new Array(size);
    const rawAngleY: number[] = new Array(size);
    const rawAngleZ: number[] = new Array(size);
    const calcAngleX: number[] = new Array(size);
    const calcAngleY: number[] = new Array(size);
    const calcAngleZ: number[] = new Array(size);
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
      rawAngleX[j] = this.rawAngleX[idx];
      rawAngleY[j] = this.rawAngleY[idx];
      rawAngleZ[j] = this.rawAngleZ[idx];
      calcAngleX[j] = this.calcAngleX[idx];
      calcAngleY[j] = this.calcAngleY[idx];
      calcAngleZ[j] = this.calcAngleZ[idx];
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

    return {
      time,
      rawAngle: { x: rawAngleX, y: rawAngleY, z: rawAngleZ },
      calculatedAngle: { x: calcAngleX, y: calcAngleY, z: calcAngleZ },
      deltaAngle: { x: deltaAngleX, y: deltaAngleY, z: deltaAngleZ },
      velocity: { x: velocityX, y: velocityY, z: velocityZ },
      position: { x: positionX, y: positionY, z: positionZ },
    };
  }
}
