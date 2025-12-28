import { useHeartbeat } from "../hooks/useWebSocket";
import { Card, Badge, Statistic, Row, Col, Alert } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";

/**
 * Component: Display service heartbeat status
 */
export function HeartbeatMonitor() {
  const { heartbeat, connected } = useHeartbeat();

  if (!connected || !heartbeat) {
    return (
      <Alert
        message="Service Disconnected"
        description="Unable to connect to backend service"
        type="error"
        showIcon
        icon={<CloseCircleOutlined />}
      />
    );
  }

  return (
    <Card
      title={
        <span>
          <Badge status="success" />
          Service Status
        </span>
      }
      extra={<CheckCircleOutlined style={{ color: "#52c41a", fontSize: "20px" }} />}
    >
      <Row gutter={16}>
        <Col span={8}>
          <Statistic title="Message" value={heartbeat.message} />
        </Col>
        <Col span={8}>
          <Statistic title="timestamp" value={new Date(heartbeat.timestamp).toLocaleString()} />
        </Col>
        <Col span={8}>
          <Statistic
            title="Uptime"
            value={heartbeat.service_uptime_sec}
            suffix="s"
          />
        </Col>
        <Col span={8}>
          <Statistic
            title="Subscribers"
            value={heartbeat.imu_subscribers}
          />
        </Col>
        <Col span={8}>
          <Statistic
            title="Device"
            value={heartbeat.device_connected ? "Connected" : "Disconnected"}
            valueStyle={{ color: heartbeat.device_connected ? "#52c41a" : "#ff4d4f" }}
          />
        </Col>

      </Row>
    </Card>
  );
}
