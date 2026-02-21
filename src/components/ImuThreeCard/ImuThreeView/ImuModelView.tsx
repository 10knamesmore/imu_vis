import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { ImuSource } from "../../../hooks/useImuSource";
import { TrajectoryOption } from "./types";
import { useThreeBase } from "./useThreeBase";
import styles from "./ImuThreeView.module.scss";

type ImuModelViewProps = {
  /** IMU 数据源，提供最新姿态与位移数据。 */
  source: ImuSource;
  /** 是否显示轨迹。 */
  showTrajectory: boolean;
  /** 轨迹各分量开关配置。 */
  trajectoryOption: TrajectoryOption;
  /** 轨迹重置计数器，变化时清空轨迹。 */
  trailResetToken: number;
};

type AxisKey = "x" | "y" | "z";
const axisKeys: AxisKey[] = ["x", "y", "z"];

/**
 * IMU 模型视图组件
 * 负责显示 3D 模型姿态以及 X/Y/Z 轴的端点轨迹
 */
export const ImuModelView: React.FC<ImuModelViewProps> = ({
  source,
  showTrajectory,
  trajectoryOption,
  trailResetToken,
}) => {
  // 通用 Refs，用于在闭包中访问最新 Props
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
  const bodyRef = useRef<THREE.Mesh | null>(null);
  const axisGroupRef = useRef<THREE.Group | null>(null);
  const axesRef = useRef<THREE.AxesHelper | null>(null);
  const axisLabelsRef = useRef<THREE.Sprite[]>([]);
  const axisLengthRef = useRef(0.8);

  // 轨迹相关 Refs
  const trailRefs = useRef<Record<AxisKey, THREE.Line | null>>({ x: null, y: null, z: null });
  const trailGeometryRefs = useRef<Record<AxisKey, THREE.BufferGeometry | null>>({ x: null, y: null, z: null });
  const trailPositionsRefs = useRef<Record<AxisKey, Float32Array | null>>({ x: null, y: null, z: null });
  const maxTrailPointsRef = useRef(300);
  const trailStateRef = useRef<Record<AxisKey, { count: number }>>({
    x: { count: 0 }, y: { count: 0 }, z: { count: 0 },
  });

  // 渲染所需的临时变量
  const axisBases: Record<AxisKey, THREE.Vector3> = {
    x: new THREE.Vector3(1, 0, 0),
    y: new THREE.Vector3(0, 1, 0),
    z: new THREE.Vector3(0, 0, 1),
  };
  const tmpQuat = new THREE.Quaternion();
  const tmpVec = new THREE.Vector3();

  /**
   * 渲染循环回调
   * 1: 读取最新姿态数据
   * 2: 应用姿态到模型与坐标轴
   * 3: 写入轴向量端点轨迹点并更新绘制范围
   */
  const onRender = () => {
    const latest = sourceRef.current.latestRef.current;
    if (latest) {
      // 使用计算姿态，并转换成 Three.js 四元数
      const attitude = latest.calculated_data.attitude;
      tmpQuat.set(attitude.x, attitude.y, attitude.z, attitude.w);

      // 同步模型与坐标轴姿态
      if (bodyRef.current) bodyRef.current.quaternion.copy(tmpQuat);
      if (axisGroupRef.current) axisGroupRef.current.quaternion.copy(tmpQuat);

      if (showTrajectoryRef.current) {
        // 计算各轴朝向向量端点，写入对应轨迹缓冲并更新绘制范围
        axisKeys.forEach((axis) => {
          if (!trajectoryOptionRef.current[axis]) return;

          tmpVec.copy(axisBases[axis]).applyQuaternion(tmpQuat).multiplyScalar(0.8 * viewScaleRef.current);
          const positions = trailPositionsRefs.current[axis];
          const geometry = trailGeometryRefs.current[axis];
          if (!positions || !geometry) return;

          const state = trailStateRef.current[axis];
          const maxPoints = maxTrailPointsRef.current;

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
        });
      }
    }
  };

  /**
   * 使用基础 Three.js Hook 创建场景
   */
  const { containerRef, displayGroupRef, viewScaleRef } = useThreeBase(0.8, onRender);

  /**
   * 初始化场景对象（模型、坐标轴、标签、轨迹线）
   * 负责创建并添加到场景中，并在组件卸载时清理资源
   */
  useEffect(() => {
    const displayGroup = displayGroupRef.current;
    if (!displayGroup) return;

    // Body
    const bodyGeometry = new THREE.BoxGeometry(0.4, 0.6, 0.13);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x4f9bff,
      metalness: 0.1,
      roughness: 0.5,
      side: THREE.DoubleSide,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.scale.setScalar(viewScaleRef.current);
    displayGroup.add(body);
    bodyRef.current = body;

    // Axes
    const axisLength = 0.8;
    axisLengthRef.current = axisLength;
    const axes = new THREE.AxesHelper(axisLength);
    axes.scale.setScalar(viewScaleRef.current);
    const axisGroup = new THREE.Group();
    axisGroup.add(axes);
    displayGroup.add(axisGroup);
    axisGroupRef.current = axisGroup;
    axesRef.current = axes;

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
      ctx.font = "bold 72px sans-serif";
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
        axisGroup.add(label.sprite);
        return label.sprite;
      })
      .filter((label): label is THREE.Sprite => label !== null);

    // Trails
    const trailMaterials: Record<AxisKey, THREE.LineBasicMaterial> = {
      x: new THREE.LineBasicMaterial({ color: 0xff6b6b }),
      y: new THREE.LineBasicMaterial({ color: 0x6bffb8 }),
      z: new THREE.LineBasicMaterial({ color: 0x57b2ff }),
    };
    axisKeys.forEach((axis) => {
      const trailPositions = new Float32Array(maxTrailPointsRef.current * 3);
      const trailGeometry = new THREE.BufferGeometry();
      trailGeometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
      trailGeometry.setDrawRange(0, 0);
      const trailLine = new THREE.Line(trailGeometry, trailMaterials[axis]);
      trailLine.visible = false; // Initially false, updated by effect
      trailLine.frustumCulled = false;
      displayGroup.add(trailLine);
      trailRefs.current[axis] = trailLine;
      trailGeometryRefs.current[axis] = trailGeometry;
      trailPositionsRefs.current[axis] = trailPositions;
    });

    return () => {
      displayGroup.remove(body);
      bodyGeometry.dispose();
      bodyMaterial.dispose();
      displayGroup.remove(axisGroup);
      axes.dispose();
      labelResources.forEach((r) => { r.material.dispose(); r.texture.dispose(); });
      axisLabelsRef.current = [];
      axisKeys.forEach(axis => {
        if (trailRefs.current[axis]) displayGroup.remove(trailRefs.current[axis]!);
        if (trailGeometryRefs.current[axis]) trailGeometryRefs.current[axis]!.dispose();
        if (trailMaterials[axis]) trailMaterials[axis].dispose();
      });
    };
  }, []); // Setup once

  /**
   * 监听缩放变化并应用到场景对象
   */
  useEffect(() => {
    const scale = viewScaleRef.current;
    if (bodyRef.current) bodyRef.current.scale.setScalar(scale);
    if (axesRef.current) axesRef.current.scale.setScalar(scale);
    if (axisLabelsRef.current.length) {
      const axisLength = axisLengthRef.current * scale;
      const labelOffset = 0.12 * scale;
      const labelScale = 0.18 * scale;
      axisLabelsRef.current[0].position.set(axisLength + labelOffset, 0, 0);
      axisLabelsRef.current[1].position.set(0, axisLength + labelOffset, 0);
      axisLabelsRef.current[2].position.set(0, 0, axisLength + labelOffset);
      axisLabelsRef.current.forEach((label) => {
        label.scale.set(-labelScale, -labelScale, labelScale);
      });
    }
  }, [viewScaleRef.current]); // React to scale change from hook (hook updates ref, but component re-renders on state change)

  /**
   * 监听轨迹开关变化，更新轨迹可见性
   */
  useEffect(() => {
    axisKeys.forEach((axis) => {
      const trail = trailRefs.current[axis];
      if (trail) {
        trail.visible = showTrajectory && trajectoryOption[axis];
      }
    });
  }, [showTrajectory, trajectoryOption]);

  /**
   * 监听重置 Token，清空轨迹数据
   */
  useEffect(() => {
    axisKeys.forEach((axis) => {
      const geometry = trailGeometryRefs.current[axis];
      const positions = trailPositionsRefs.current[axis];
      if (!geometry || !positions) return;
      positions.fill(0);
      geometry.setDrawRange(0, 0);
      (geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      trailStateRef.current[axis] = { count: 0 };
    });
  }, [trailResetToken]);

  return <div className={styles.imuThreeView} ref={containerRef} />;
};
