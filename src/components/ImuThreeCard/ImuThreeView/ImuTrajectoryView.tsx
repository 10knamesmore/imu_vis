import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { ImuSource } from "../../../hooks/useImuSource";
import { TrajectoryOption } from "./types";
import { useThreeBase } from "./useThreeBase";
import { useColorScheme } from "../../../hooks/useColorScheme";
import styles from "./ImuThreeView.module.scss";

type ImuTrajectoryViewProps = {
  /** IMU 数据源，提供最新位置/姿态数据。 */
  source: ImuSource;
  /** 是否显示轨迹。 */
  showTrajectory: boolean;
  /** 轨迹各分量开关配置。 */
  trajectoryOption: TrajectoryOption;
  /** 轨迹重置计数器，变化时清空轨迹。 */
  trailResetToken: number;
};

const getAxisPalette = (scheme: "dark" | "light") => {
  if (scheme === "dark") {
    return {
      x: 0xff6b6b,
      y: 0x6bffb8,
      z: 0x57b2ff,
      label: ["#ff6b6b", "#6bffb8", "#57b2ff"],
    };
  }

  return {
    x: 0x9b3a35,
    y: 0x2f6f3f,
    z: 0x2e4f73,
    label: ["#9b3a35", "#2f6f3f", "#2e4f73"],
  };
};

const applyAxesHelperColors = (axes: THREE.AxesHelper, colors: { x: number; y: number; z: number }) => {
  const colorAttr = axes.geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
  if (!colorAttr) return;

  const tmpColor = new THREE.Color();
  const applyPair = (startIndex: number, hex: number) => {
    tmpColor.setHex(hex);
    colorAttr.setXYZ(startIndex, tmpColor.r, tmpColor.g, tmpColor.b);
    colorAttr.setXYZ(startIndex + 1, tmpColor.r, tmpColor.g, tmpColor.b);
  };

  applyPair(0, colors.x);
  applyPair(2, colors.y);
  applyPair(4, colors.z);
  colorAttr.needsUpdate = true;
};

/**
 * IMU 轨迹视图组件
 * 负责显示中心点位移轨迹（Center Trajectory）
 */
export const ImuTrajectoryView: React.FC<ImuTrajectoryViewProps> = ({
  source,
  showTrajectory,
  trajectoryOption,
  trailResetToken,
}) => {
  // 通用 Refs
  const sourceRef = useRef(source);
  const showTrajectoryRef = useRef(showTrajectory);
  const trajectoryOptionRef = useRef(trajectoryOption);

  /**
   * 同步 Props 到 Ref，确保渲染循环中能访问到最新值
   */
  useEffect(() => { sourceRef.current = source; }, [source]);
  useEffect(() => { showTrajectoryRef.current = showTrajectory; }, [showTrajectory]);
  useEffect(() => { trajectoryOptionRef.current = trajectoryOption; }, [trajectoryOption]);

  // 本地对象 Refs
  const axesRef = useRef<THREE.AxesHelper | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const axisLabelsRef = useRef<THREE.Sprite[]>([]);
  const centerTrailMaterialRef = useRef<THREE.LineBasicMaterial | null>(null);

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
        tmpVec.set(latest.position.x, latest.position.y, latest.position.z);

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

  const { colorScheme } = useColorScheme();

  /**
   * 使用基础 Three.js Hook 创建场景
   */
  const { containerRef, displayGroupRef, viewScaleRef } = useThreeBase(1.5, onRender, colorScheme);

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

    // Center Trail
    const maxPoints = maxTrailPointsRef.current;
    const centerTrailPositions = new Float32Array(maxPoints * 3);
    const centerTrailGeometry = new THREE.BufferGeometry();
    centerTrailGeometry.setAttribute("position", new THREE.BufferAttribute(centerTrailPositions, 3));
    centerTrailGeometry.setDrawRange(0, 0);
    const centerTrailMaterial = new THREE.LineBasicMaterial({
      color: colorScheme === "dark" ? 0xffffff : 0x2f343a,
    });
    const centerTrailLine = new THREE.Line(centerTrailGeometry, centerTrailMaterial);
    centerTrailLine.visible = false;
    centerTrailLine.frustumCulled = false;
    displayGroup.add(centerTrailLine);

    centerTrailRef.current = centerTrailLine;
    centerTrailGeometryRef.current = centerTrailGeometry;
    centerTrailPositionsRef.current = centerTrailPositions;
    centerTrailMaterialRef.current = centerTrailMaterial;

    return () => {
      displayGroup.remove(axes);
      axes.dispose();
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

  /**
   * 主题切换时重建网格、轴标签，并更新轨迹线颜色。
   * GridHelper 使用顶点颜色，无法原地更新，必须重建。
   */
  useEffect(() => {
    const displayGroup = displayGroupRef.current;
    if (!displayGroup) return;
    const palette = getAxisPalette(colorScheme);
    if (axesRef.current) {
      applyAxesHelperColors(axesRef.current, palette);
    }

    // 1. 重建 GridHelper
    if (gridRef.current) {
      displayGroup.remove(gridRef.current);
      gridRef.current.geometry.dispose();
    }
    const [c1, c2] = colorScheme === 'dark'
      ? [0x444444, 0x222222]
      : [0xaaaaaa, 0xd8d8d8];
    const grid = new THREE.GridHelper(5, 10, c1, c2);
    grid.rotation.x = Math.PI / 2;
    grid.scale.setScalar(viewScaleRef.current);
    displayGroup.add(grid);
    gridRef.current = grid;

    // 2. 更新轨迹线颜色
    if (centerTrailMaterialRef.current) {
      centerTrailMaterialRef.current.color.setHex(
        colorScheme === 'dark' ? 0xffffff : 0x2f343a
      );
    }

    // 3. 重建轴标签 Sprite
    const oldLabels = axisLabelsRef.current;
    oldLabels.forEach((l) => {
      displayGroup.remove(l);
      (l.material as THREE.SpriteMaterial).map?.dispose();
      l.material.dispose();
    });

    const labelDefs = [
      { text: 'X', color: palette.label[0] },
      { text: 'Y', color: palette.label[1] },
      { text: 'Z', color: palette.label[2] },
    ];
    const resources: Array<{ material: THREE.SpriteMaterial; texture: THREE.Texture }> = [];
    const newLabels = labelDefs.map((def) => {
      const canvas = document.createElement('canvas');
      const size = 128;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = def.color;
      ctx.font = 'bold 40px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.text, size / 2, size / 2);
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
      const sprite = new THREE.Sprite(material);
      resources.push({ material, texture });
      return sprite;
    }).filter((s): s is THREE.Sprite => s !== null);

    const scale = viewScaleRef.current;
    const axisLength = 0.5 * scale;
    const labelOffset = 0.10 * scale;
    const labelScale = 0.18 * scale;
    if (newLabels.length === 3) {
      newLabels[0].position.set(axisLength + labelOffset, 0, 0);
      newLabels[1].position.set(0, axisLength + labelOffset, 0);
      newLabels[2].position.set(0, 0, axisLength + labelOffset);
      newLabels.forEach((l) => l.scale.set(-labelScale, -labelScale, labelScale));
    }
    newLabels.forEach((l) => displayGroup.add(l));
    axisLabelsRef.current = newLabels;

    return () => {
      newLabels.forEach((l) => displayGroup.remove(l));
      resources.forEach((r) => { r.material.dispose(); r.texture.dispose(); });
      axisLabelsRef.current = [];
    };
  }, [colorScheme]);

  return <div className={styles.imuThreeView} ref={containerRef} />;
};
