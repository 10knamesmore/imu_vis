import ReactDOM from "react-dom/client";
import App from "./App";
import { ConfigProvider, theme } from "antd";

{ /* <React.StrictMode> */ }
{/* </React.StrictMode>, */ }
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ConfigProvider
    theme={{
      algorithm: theme.darkAlgorithm,
      token: {
        colorBgBase: "#0a0a0a",
        colorTextBase: "#fff",
      },
    }}
  >
    <App />
  </ConfigProvider >
);
