import { HeartbeatMonitor } from "./components/HeartbeatMonitor";
import { ConfigProvider, Result, Button, Spin } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { useHeartbeat } from "./hooks/useWebSocket";
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import zhCN from 'antd/locale/zh_CN';

import './index.css';

dayjs.locale('zh-cn');

const App: React.FC = () => {
  const { connected } = useHeartbeat();

  return (
    <ConfigProvider locale={zhCN}>
      <div style={{ padding: "20px", background: "#0a0a0a", minHeight: "100vh" }}>
        {!connected ? (
          // 未连接状态：显示连接提示页面
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "80vh"
          }}>
            <Result
              icon={<Spin size="large" />}
              title="正在连接后端服务..."
              subTitle="请确保后端服务运行在 http://127.0.0.1:8081"
              extra={
                <Button
                  type="primary"
                  icon={<ReloadOutlined />}
                  onClick={() => window.location.reload()}
                >
                  重新加载
                </Button>
              }
            />
          </div>
        ) : (
          // 已连接状态：显示主界面
          <>
            <h2 style={{ marginBottom: "24px", color: "#fff" }}>
              🎯 IMU 可视化仪表盘
            </h2>

            {/* <Space direction="vertical" size="large" style={{ display: "flex", maxWidth: "1200px" }}> */}
            <HeartbeatMonitor />
            {/**/}
            {/*   <ImuDataDisplay /> */}
            {/* </Space> */}
          </>
        )}
      </div>
    </ConfigProvider>
  );
};

export default App;

