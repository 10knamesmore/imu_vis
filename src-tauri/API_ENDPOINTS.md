# API Endpoints Documentation

## Base URL
`http://127.0.0.1:8081`

## HTTP REST API

### Health & Status

#### GET `/api/health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "imu-vis-backend"
}
```

#### GET `/api/status`
Get service status and version.

**Response:**
```json
{
  "uptime_sec": 12345,
  "version": "0.1.0"
}
```

### BLE Device Management

#### POST `/api/scan/start`
Start scanning for BLE peripherals.

**Response:**
```json
{
  "success": true,
  "data": null,
  "message": "ok"
}
```

#### POST `/api/scan/stop`
Stop scanning for BLE peripherals.

**Response:**
```json
{
  "success": true,
  "data": null,
  "message": "ok"
}
```

#### GET `/api/peripherals`
List discovered peripherals.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "uuid": "device-uuid-here",
      "name": "IMU Device",
      "rssi": -45
    }
  ],
  "message": "ok"
}
```

#### POST `/api/peripheral/connect`
Connect to a specific peripheral.

**Request Body:**
```json
{
  "target_uuid": "device-uuid-here"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "uuid": "device-uuid-here",
    "name": "IMU Device",
    "rssi": -45
  },
  "message": "ok"
}
```

#### POST `/api/peripheral/disconnect`
Disconnect from current peripheral.

**Response:**
```json
{
  "success": true,
  "data": {
    "uuid": "device-uuid-here",
    "name": "IMU Device",
    "rssi": -45
  },
  "message": "ok"
}
```

## WebSocket Endpoints

### WS `/ws/imu`
High-frequency IMU data stream (~250Hz).

**Message Format:**
```json
{
  "timestamp_us": 1234567890,
  "accel": [0.1, 0.2, 9.8],
  "gyro": [0.01, 0.02, 0.03],
  "mag": [0.3, 0.0, 0.5],
  "message": "Heavy computation took 1.2ms"
}
```

### WS `/ws/heartbeat`
Service heartbeat (~1Hz).

**Message Format:**
```json
{
  "service_uptime_sec": 123,
  "imu_subscribers": 2,
  "device_connected": true
}
```

## Migration from Legacy Commands

Previously, these operations were Tauri commands:
- `start_scan` → now `POST /api/scan/start`
- `stop_scan` → now `POST /api/scan/stop`
- `list_peripherals` → now `GET /api/peripherals`
- `connect_peripheral` → now `POST /api/peripheral/connect`
- `disconnect_peripheral` → now `POST /api/peripheral/disconnect`

The mock data from `test::mock_imu_data` is now served through `WS /ws/imu`.
