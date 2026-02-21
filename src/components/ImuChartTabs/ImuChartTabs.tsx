import { DownOutlined } from "@ant-design/icons";
import { Button, Card, Tabs } from "antd";
import type { TabsProps } from "antd";

import styles from "./ImuChartTabs.module.scss";

type ImuChartTabsProps = {
  /** 图表页签项配置，直接透传给 Ant Design Tabs。 */
  items: TabsProps["items"];
  /** 是否折叠图表内容区域。 */
  collapsed: boolean;
  /** 切换折叠状态。 */
  onToggleCollapsed: () => void;
};

export const ImuChartTabs = ({ items, collapsed, onToggleCollapsed }: ImuChartTabsProps) => {
  /** Tabs 类名：折叠时隐藏内容区，仅保留标签栏。 */
  const chartTabsClassName = collapsed
    ? `${styles.chartTabs} ${styles.chartTabsCollapsed}`
    : styles.chartTabs;
  /** 折叠按钮图标类名：通过旋转实现状态切换动画。 */
  const collapseIconClassName = collapsed
    ? `${styles.collapseIcon} ${styles.collapseIconCollapsed}`
    : `${styles.collapseIcon} ${styles.collapseIconExpanded}`;

  return (
    <Card
      size="small"
      variant="outlined"
      className={styles.chartCard}
      style={{ background: "#141414", border: "1px solid #303030" }}
      styles={{ body: { paddingTop: 0 } }}
    >
      <Tabs
        className={chartTabsClassName}
        items={items}
        destroyOnHidden
        tabBarExtraContent={
          <Button
            className={styles.collapseButton}
            type="text"
            size="small"
            onClick={onToggleCollapsed}
            icon={<DownOutlined className={collapseIconClassName} />}
            aria-label={collapsed ? "展开图表" : "收起图表"}
            title={collapsed ? "展开图表" : "收起图表"}
          />
        }
      />
    </Card>
  );
};
