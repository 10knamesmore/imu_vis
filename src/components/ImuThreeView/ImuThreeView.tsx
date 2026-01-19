import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { ImuSource } from "../../hooks/useImuSource";

import styles from "./ImuThreeView.scss";

/**
 * 组件属性定义
 */
type ImuThreeViewProps = {
  /** IMU 数据源，包含最新的姿态数据 */
  source: ImuSource;
  /** 是否在视图中绘制运动轨迹 */
  showTrajectory: boolean;
  /** 模型显示的缩放倍率 */
  scale: number;
};

/**
 * IMU 三维视图组件：负责创建 Three.js 场景并同步显示姿态与轨迹。
 */
export const ImuThreeView: React.FC<ImuThreeViewProps> = ({ source, showTrajectory, scale }) => {
  /** DOM 容器引用，用于挂载 Three.js 的 Canvas */
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** 3D 物体（方块）的 Mesh 引用 */
  const bodyRef = useRef<THREE.Mesh | null>(null);
  /** 坐标轴辅助对象的引用 */
  const axesRef = useRef<THREE.AxesHelper | null>(null);
  /** 轨迹线的引用 */
  const trailRef = useRef<THREE.Line | null>(null);
  /** 数据源的 Ref，确保在闭包（如 renderLoop）中能访问最新 source 对象 */
  const sourceRef = useRef(source);
  /** 轨迹数据的状态记录：当前写入索引与总点数 */
  const trailStateRef = useRef({ index: 0, count: 0 });
  /** Three.js 透视相机引用 */
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  /** 鼠标/触摸拖拽交互的状态记录（旋转角度、拖拽标记等） */
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0, yaw: Math.PI / 4, pitch: Math.PI / 6 });
  
  /** 本地状态：轨迹是否可见 */
  const [isTrajectoryVisible, setIsTrajectoryVisible] = useState(showTrajectory);
  /** 本地状态：当前的视图缩放比例 */
  const [viewScale, setViewScale] = useState(scale);

  /**
   * 监听外部数据源变更，保证渲染循环读取到最新引用。
   */
  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  /**
   * 同步轨迹显示开关到本地状态。
   */
  useEffect(() => {
    setIsTrajectoryVisible(showTrajectory);
  }, [showTrajectory]);

  /**
   * 同步缩放比例到本地状态。
   */
  useEffect(() => {
    setViewScale(scale);
  }, [scale]);

  /**
   * 当轨迹显示状态变化时，更新轨迹线可见性。
   */
  useEffect(() => {
    if (trailRef.current) {
      trailRef.current.visible = isTrajectoryVisible;
    }
  }, [isTrajectoryVisible]);

  /**
   * 当缩放比例变化时，调整模型与坐标轴缩放。
   */
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scale.setScalar(viewScale);
    }
    if (axesRef.current) {
      axesRef.current.scale.setScalar(viewScale);
    }
  }, [viewScale]);

  /**
   * 初始化 Three.js 场景，并注册交互、渲染循环与清理逻辑。
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f14);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 100);
    cameraRef.current = camera;
    camera.position.set(1.6, 1.2, 1.6);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(2, 3, 1.5);
    scene.add(ambient, dirLight);

    const bodyGeometry = new THREE.BoxGeometry(0.8, 0.2, 0.5);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x4f9bff, metalness: 0.1, roughness: 0.5 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.scale.setScalar(scale);
    scene.add(body);
    bodyRef.current = body;

    const axes = new THREE.AxesHelper(0.8);
    axes.scale.setScalar(scale);
    scene.add(axes);
    axesRef.current = axes;

    const maxTrailPoints = 300;
    const trailPositions = new Float32Array(maxTrailPoints * 3);
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
    trailGeometry.setDrawRange(0, 0);
    const trailMaterial = new THREE.LineBasicMaterial({ color: 0x35d0ba });
    const trailLine = new THREE.Line(trailGeometry, trailMaterial);
    trailLine.visible = showTrajectory;
    trailLine.frustumCulled = false;
    scene.add(trailLine);
    trailRef.current = trailLine;

    const forward = new THREE.Vector3(0, 0, 1);
    const tmpQuat = new THREE.Quaternion();
    const tmpVec = new THREE.Vector3();
    const target = new THREE.Vector3(0, 0, 0);
    const radius = 2.4;

    /**
     * 视图尺寸变化时同步调整渲染器与相机投影。
     */
    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) {
        return;
      }
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resize();
    window.addEventListener("resize", resize);

    /**
     * 根据拖拽产生的 yaw/pitch 更新相机位置与朝向。
     */
    const updateCamera = () => {
      const { yaw, pitch } = dragRef.current;
      const x = radius * Math.cos(pitch) * Math.cos(yaw);
      const y = radius * Math.sin(pitch);
      const z = radius * Math.cos(pitch) * Math.sin(yaw);
      camera.position.set(x, y, z);
      camera.lookAt(target);
    };

    /**
     * 指针按下：开始记录拖拽基准位置。
     */
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }
      dragRef.current.dragging = true;
      dragRef.current.lastX = event.clientX;
      dragRef.current.lastY = event.clientY;
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
    };

    /**
     * 指针移动：根据位移调整相机角度。
     */
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragRef.current.dragging) {
        return;
      }
      const dx = event.clientX - dragRef.current.lastX;
      const dy = event.clientY - dragRef.current.lastY;
      dragRef.current.lastX = event.clientX;
      dragRef.current.lastY = event.clientY;
      dragRef.current.yaw += dx * 0.005;
      dragRef.current.pitch += dy * 0.005;
      dragRef.current.pitch = Math.max(-1.2, Math.min(1.2, dragRef.current.pitch));
      updateCamera();
    };

    /**
     * 指针抬起/离开：结束拖拽并释放捕获。
     */
    const handlePointerUp = (event: PointerEvent) => {
      dragRef.current.dragging = false;
      (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    };

    /**
     * 滚轮缩放：调整模型视图缩放比例。
     */
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = Math.sign(event.deltaY);
      /**
       * 以当前缩放为基准计算新缩放，限制在合理区间。
       */
      setViewScale((currentScale) => {
        const nextScale = Math.min(3, Math.max(0.4, currentScale * (delta > 0 ? 0.95 : 1.05)));
        return nextScale;
      });
    };

    updateCamera();

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointerleave", handlePointerUp);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });

    let animationId = 0;
    /**
     * 渲染循环：同步姿态、更新轨迹并绘制场景。
     */
    const renderLoop = () => {
      animationId = requestAnimationFrame(renderLoop);
      const latest = sourceRef.current.latestRef.current;
      if (latest) {
        tmpQuat.set(latest.quat.x, latest.quat.y, latest.quat.z, latest.quat.w);
        body.quaternion.copy(tmpQuat);

        if (isTrajectoryVisible) {
          tmpVec.copy(forward).applyQuaternion(tmpQuat).multiplyScalar(0.8 * viewScale);
          const state = trailStateRef.current;
          const i = state.index % maxTrailPoints;
          trailPositions[i * 3] = tmpVec.x;
          trailPositions[i * 3 + 1] = tmpVec.y;
          trailPositions[i * 3 + 2] = tmpVec.z;
          state.index += 1;
          state.count = Math.min(state.count + 1, maxTrailPoints);
          trailGeometry.setDrawRange(0, state.count);
          (trailGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        }
      }
      renderer.render(scene, camera);
    };
    renderLoop();

    /**
     * 清理资源与事件监听，防止内存泄漏。
     */
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointerleave", handlePointerUp);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      trailGeometry.dispose();
      trailMaterial.dispose();
      bodyGeometry.dispose();
      bodyMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div className={styles.imuThreeView} ref={containerRef} />;
};
