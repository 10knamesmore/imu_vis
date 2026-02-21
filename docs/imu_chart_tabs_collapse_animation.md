# IMU Realtime 图表折叠动画实现说明

## 背景

在 `ImuRealtimePanel` 中，图表区域需要支持折叠，让出高度给 `ThreeView`。  
目标是实现“高度逐渐变化”，避免折叠/展开结束时出现“跳一下”的视觉抖动。

## 之前会跳变的原因

常见跳变来自以下写法：

1. 在动画过程中切换 `height: auto` 和 `height: 100%`。
2. 用 `display: none` 直接隐藏内容区。
3. 多个布局维度同时切换（例如外层 grid 行高 + 内层 auto 高度）。

这些值无法稳定插值，浏览器会在动画结束后做一次重新布局，表现成末尾跳变。

## 当前实现思路

### 1) 外层高度动画只走一条通道（`flex-basis`）

文件：`src/pages/ImuRealtimePanel/ImuRealtimePanel.module.scss`

- `mainGrid` 改为纵向 `flex` 布局。
- `topRow` 使用 `flex: 1`，自动吃掉剩余空间。
- `bottomRow` 使用 `flex: 0 0 45%`，并对 `flex-basis` 做过渡：

```scss
.bottomRow {
  flex: 0 0 45%;
  transition: flex-basis 0.3s ease;
}

.bottomRowCollapsed {
  flex-basis: 56px;
}
```

折叠时仅改变一个可插值数值（`flex-basis`），`ThreeView` 高度会连续增长。

### 2) 图表卡片始终占满容器，不切 `auto`

文件：`src/components/ImuChartTabs/ImuChartTabs.module.scss`

- `chartCard` 固定 `height: 100%`。
- 不再切换 `chartCard auto/100%`，避免动画末尾二次重排。

### 3) Tabs 内容区做“软折叠”动画（`max-height + opacity`）

文件：`src/components/ImuChartTabs/ImuChartTabs.module.scss`

```scss
:global(.ant-tabs-content-holder) {
  max-height: 2000px;
  opacity: 1;
  transition: max-height 0.28s ease, opacity 0.22s ease;
}

.chartTabsCollapsed :global(.ant-tabs-content-holder) {
  max-height: 0;
  opacity: 0;
  pointer-events: none;
}
```

说明：

1. 不使用 `display: none`，让浏览器可以逐帧插值。
2. `max-height` 负责高度过渡，`opacity` 负责视觉淡出。

### 4) 状态驱动与渲染控制

文件：`src/pages/ImuRealtimePanel/ImuRealtimePanel.tsx`

- `chartsCollapsed` 作为单一状态源。
- 通过 `bottomRowClassName` 切换 `bottomRow` / `bottomRowCollapsed`。
- `showCharts = !chartsCollapsed`，折叠时暂停图表刷新，减少无效绘制。

## 为什么现在不会“到尽头跳一下”

核心原因是两点：

1. 外层高度变化只由 `flex-basis` 单值驱动，连续可插值。
2. 内层内容隐藏不再使用 `display: none` 或 `auto` 切换，而是可动画属性过渡。

因此，布局与内容都在同一动画周期内连续变化，没有末尾补跳。

## 可调参数

可按体验继续微调以下参数：

1. `bottomRowCollapsed` 的目标高度（当前 `56px`）。
2. `flex-basis` 过渡时长（当前 `0.3s`）。
3. `max-height` / `opacity` 时长与 easing（当前 `0.28s` / `0.22s`）。

## 相关文件

1. `src/pages/ImuRealtimePanel/ImuRealtimePanel.tsx`
2. `src/pages/ImuRealtimePanel/ImuRealtimePanel.module.scss`
3. `src/components/ImuChartTabs/ImuChartTabs.tsx`
4. `src/components/ImuChartTabs/ImuChartTabs.module.scss`
