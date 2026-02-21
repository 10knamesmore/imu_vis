import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { ImuSource } from "../../../hooks/useImuSource";
import { TrajectoryOption } from "./types";
import { useThreeBase } from "./useThreeBase";
import styles from "./ImuThreeView.module.scss";

type ImuTrajectoryViewProps = {
  /** IMU 数据源，提供最新位置/姿态数据。 */
  source: ImuSource;
  /** 是否显示轨迹。 */
  showTrajectory: boolean;
  /** 轨迹各分量开关配置。 */
  trajectoryOption: TrajectoryOption;
  /** 是否使用后端计算结果（位置）。 */
  useCalculated: boolean;
  /** 轨迹重置计数器，变化时清空轨迹。 */
  trailResetToken: number;
};

/**
 * IMU 轨迹视图组件
 * 负责显示中心点位移轨迹（Center Trajectory）
 */
export const ImuTrajectoryView: React.FC<ImuTrajectoryViewProps> = ({
  source,
  showTrajectory,
  trajectoryOption,
  useCalculated,
  trailResetToken,
}) => {
  // 通用 Refs
  const sourceRef = useRef(source);
  const useCalculatedRef = useRef(useCalculated);
  const showTrajectoryRef = useRef(showTrajectory);
  const trajectoryOptionRef = useRef(trajectoryOption);

  /**
   * 同步 Props 到 Ref，确保渲染循环中能访问到最新值
   */
  useEffect(() => { sourceRef.current = source; }, [source]);
  useEffect(() => { useCalculatedRef.current = useCalculated; }, [useCalculated]);
  useEffect(() => { showTrajectoryRef.current = showTrajectory; }, [showTrajectory]);
  useEffect(() => { trajectoryOptionRef.current = trajectoryOption; }, [trajectoryOption]);

  // 本地对象 Refs
  const axesRef = useRef<THREE.AxesHelper | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const axisLabelsRef = useRef<THREE.Sprite[]>([]);

  // 中心轨迹 Refs
  const centerTrailRef = useRef<THREE.Line | null>(null);
  const centerTrailGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const centerTrailPositionsRef = useRef<Float32Array | null>(null);
  const maxTrailPointsRef = useRef(3000);
  const centerTrailStateRef = useRef<{ count: number }>({ count: 0 });

  // 渲染临时变量
  const tmpVec = new THREE.Vector3();

  /**
   * 渲染循环回调
   * 1: 读取最新位置数据
   * 2: 写入中心轨迹缓冲并更新绘制范围
   */
  const onRender = () => {
    const latest = sourceRef.current.latestRef.current;
    if (latest && showTrajectoryRef.current && trajectoryOptionRef.current.center) {
      const positions = centerTrailPositionsRef.current;
      const geometry = centerTrailGeometryRef.current;
      if (positions && geometry) {
        const state = centerTrailStateRef.current;
        const maxPoints = maxTrailPointsRef.current;

        // 获取当前中心位置
        if (useCalculatedRef.current) {
          tmpVec.set(latest.calculated_data.position.x, latest.calculated_data.position.y, latest.calculated_data.position.z);
        } else {
          tmpVec.set(latest.raw_data.offset.x, latest.raw_data.offset.y, latest.raw_data.offset.z);
        }

        if (state.count < maxPoints) {
          const i = state.count;
          positions[i * 3] = tmpVec.x;
          positions[i * 3 + 1] = tmpVec.y;
          positions[i * 3 + 2] = tmpVec.z;
          state.count += 1;
        } else {
          // 保持轨迹顺序，避免首尾相连的闭合线段
          positions.copyWithin(0, 3);
          const i = maxPoints - 1;
          positions[i * 3] = tmpVec.x;
          positions[i * 3 + 1] = tmpVec.y;
          positions[i * 3 + 2] = tmpVec.z;
        }
        geometry.setDrawRange(0, state.count);
        (geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }
    }
  };

  /**
   * 使用基础 Three.js Hook 创建场景
   */
  const { containerRef, displayGroupRef, viewScaleRef } = useThreeBase(1.5, onRender);

  /**
   * 初始化场景对象（坐标轴、网格、中心轨迹线）
   * 负责创建并添加到场景中，并在组件卸载时清理资源
   */
  useEffect(() => {
    const displayGroup = displayGroupRef.current;
    if (!displayGroup) return;

    // Axes
    const axes = new THREE.AxesHelper(0.5);
    axes.scale.setScalar(viewScaleRef.current);
    axes.material.linewidth = 2
    displayGroup.add(axes);
    axesRef.current = axes;

    // 网格辅助线（可选，但对观察轨迹和姿态参考非常有帮助）
    const grid = new THREE.GridHelper(5, 10, 0x444444, 0x222222);

    // Three.js 的 GridHelper 默认位于 XZ 平面（假设 Y 轴向上）
    // 当前 displayGroup 对 X / Y 做了镜像处理，采用的是 Z 轴向上坐标系
    // 如果希望把网格作为“地面参考平面”，就需要将其从 XZ 平面旋转到 XY 平面
    grid.rotation.x = Math.PI / 2;

    // 将旋转后的网格加入显示组，用于辅助观察 IMU 姿态与轨迹方向
    displayGroup.add(grid);
    gridRef.current = grid;
    // 初始化时同步缩放
    grid.scale.setScalar(viewScaleRef.current);

    // Labels
    const createAxisLabel = (text: string, color: string) => {
      const canvas = document.createElement("canvas");
      const size = 128;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return undefined;
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = color;
      ctx.font = "bold 40px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, size / 2, size / 2);
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(material);
      return { sprite, material, texture };
    };

    const labelDefs = [
      { text: "X", color: "#ff6b6b" },
      { text: "Y", color: "#6bffb8" },
      { text: "Z", color: "#57b2ff" },
    ];
    const labelResources: Array<{ material: THREE.SpriteMaterial; texture: THREE.Texture }> = [];
    axisLabelsRef.current = labelDefs
      .map((def) => {
        const label = createAxisLabel(def.text, def.color);
        if (!label) return null;
        labelResources.push({ material: label.material, texture: label.texture });
        displayGroup.add(label.sprite);
        return label.sprite;
      })
      .filter((label): label is THREE.Sprite => label !== null);

    // Initial label positioning
    if (axisLabelsRef.current.length) {
      const scale = viewScaleRef.current;
      const axisLength = 0.5 * scale; // 坐标轴长度为 0.5
      const labelOffset = 0.10 * scale;
      const labelScale = 0.18 * scale;
      axisLabelsRef.current[0].position.set(axisLength + labelOffset, 0, 0);
      axisLabelsRef.current[1].position.set(0, axisLength + labelOffset, 0);
      axisLabelsRef.current[2].position.set(0, 0, axisLength + labelOffset);
      axisLabelsRef.current.forEach((label) => {
        label.scale.set(-labelScale, -labelScale, labelScale);
      });
    }

    // Center Trail
    const maxPoints = maxTrailPointsRef.current;
    const centerTrailPositions = new Float32Array(maxPoints * 3);
    const centerTrailGeometry = new THREE.BufferGeometry();
    centerTrailGeometry.setAttribute("position", new THREE.BufferAttribute(centerTrailPositions, 3));
    centerTrailGeometry.setDrawRange(0, 0);
    const centerTrailMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
    const centerTrailLine = new THREE.Line(centerTrailGeometry, centerTrailMaterial);
    centerTrailLine.visible = false; // Updated by effect
    centerTrailLine.frustumCulled = false;
    displayGroup.add(centerTrailLine);

    centerTrailRef.current = centerTrailLine;
    centerTrailGeometryRef.current = centerTrailGeometry;
    centerTrailPositionsRef.current = centerTrailPositions;

    return () => {
      displayGroup.remove(axes);
      axes.dispose();
      displayGroup.remove(grid);
      labelResources.forEach((r) => { r.material.dispose(); r.texture.dispose(); });
      axisLabelsRef.current.forEach((label) => displayGroup.remove(label));
      axisLabelsRef.current = [];
      displayGroup.remove(centerTrailLine);
      centerTrailGeometry.dispose();
      centerTrailMaterial.dispose();
    };
  }, []);

  /**
   * 监听缩放变化并应用到场景对象
   */
  useEffect(() => {
    const scale = viewScaleRef.current;
    if (axesRef.current) axesRef.current.scale.setScalar(scale);
    if (gridRef.current) gridRef.current.scale.setScalar(scale);
    if (centerTrailRef.current) centerTrailRef.current.scale.setScalar(scale);

    if (axisLabelsRef.current.length) {
      const axisLength = 0.5 * scale;
      const labelOffset = 0.12 * scale;
      const labelScale = 0.18 * scale;
      axisLabelsRef.current[0].position.set(axisLength + labelOffset, 0, 0);
      axisLabelsRef.current[1].position.set(0, axisLength + labelOffset, 0);
      axisLabelsRef.current[2].position.set(0, 0, axisLength + labelOffset);
      axisLabelsRef.current.forEach((label) => {
        label.scale.set(-labelScale, -labelScale, labelScale);
      });
    }
  }, [viewScaleRef.current]);

  /**
   * 监听轨迹开关变化，更新轨迹可见性
   */
  useEffect(() => {
    if (centerTrailRef.current) {
      centerTrailRef.current.visible = showTrajectory && trajectoryOption.center;
    }
  }, [showTrajectory, trajectoryOption]);

  /**
   * 监听重置 Token，清空轨迹数据
   */
  useEffect(() => {
    const geometry = centerTrailGeometryRef.current;
    const positions = centerTrailPositionsRef.current;
    if (geometry && positions) {
      positions.fill(0);
      geometry.setDrawRange(0, 0);
      (geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      centerTrailStateRef.current = { count: 0 };
    }
  }, [trailResetToken]);

  return <div className={styles.imuThreeView} ref={containerRef} />;
};
