export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  w: number;
  x: number;
  y: number;
  z: number;
}

export interface IMUData {
  timestamp_ms: number;
  accel_no_g: Vector3;
  accel_with_g: Vector3;
  gyro: Vector3;
  quat: Quaternion;
  angle: Vector3;
  offset: Vector3;
  accel_nav: Vector3;
}

export interface CalculatedData {
  attitude: any; // Refine if needed, likely quat or euler
  velocity: any; // Likely Vector3
  position: any; // Likely Vector3
  timestamp_ms: number;
}

export interface ResponseData {
  raw_data: IMUData;
  calculated_data: CalculatedData;
}

export interface RecordingStatus {
  recording: boolean;
  session_id?: number | null;
  db_path?: string | null;
  sample_count?: number | null;
  started_at_ms?: number | null;
  name?: string | null;
  tags?: string[] | null;
}

export interface RecordingMeta {
  id: number;
  started_at_ms: number;
  stopped_at_ms?: number | null;
  sample_count: number;
  name?: string | null;
  tags: string[];
}

export interface PeripheralInfo {
  id: string;
  address: string;
  local_name?: string;
  rssi?: number;
}
