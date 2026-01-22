import React from "react";
import { Card, Tabs } from "antd";
import type { TabsProps } from "antd";

import styles from "./ImuChartTabs.module.scss";

type ImuChartTabsProps = {
  items: TabsProps["items"];
};

export const ImuChartTabs: React.FC<ImuChartTabsProps> = ({ items }) => {
  return (
    <Card
      size="small"
      variant="outlined"
      className={styles.chartCard}
      style={{ background: "#141414", border: "1px solid #303030" }}
      styles={{ header: { color: "blue" }, body: { paddingTop: 0 } }}
    >
      <Tabs className={styles.chartTabs} items={items} destroyOnHidden />
    </Card>
  );
};
