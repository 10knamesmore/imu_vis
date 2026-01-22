import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { ImuSource } from "../../../hooks/useImuSource";

import styles from "./ImuThreeView.module.scss";

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
  /** 用于镜像显示坐标系的根分组（X 正方向指向屏幕内部、Y 正方向向右、Z 正方向向上） */
  const displayGroupRef = useRef<THREE.Group | null>(null);
  /** 坐标轴与文字标识组合的 Group 引用 */
  const axisGroupRef = useRef<THREE.Group | null>(null);
  /** 坐标轴辅助对象的引用 */
  const axesRef = useRef<THREE.AxesHelper | null>(null);
  /** 轨迹线的引用 */
  const trailRef = useRef<THREE.Line | null>(null);
  /** 坐标轴文字标识的引用（用 Sprite 贴图方式实现 3D 文字） */
  const axisLabelsRef = useRef<THREE.Sprite[]>([]);
  /** 坐标轴长度基准（用于计算文字标识的放置位置） */
  const axisLengthRef = useRef(0.8);
  /** 数据源的 Ref，确保在闭包（如 renderLoop）中能访问最新 source 对象 */
  const sourceRef = useRef(source);
  /** 轨迹数据的状态记录：当前写入索引与总点数 */
  const trailStateRef = useRef({ index: 0, count: 0 });
  /** Three.js 透视相机引用 */
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  /** 鼠标/触摸拖拽交互的状态记录（旋转角度、拖拽标记等） */
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0, yaw: 0, pitch: 0 });
  
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
    if (axisLabelsRef.current.length) {
      // 缩放时同步调整文字标识：让文字始终贴近轴末端，且大小与坐标轴比例一致
      const axisLength = axisLengthRef.current * viewScale;
      const labelOffset = 0.12 * viewScale;
      const labelScale = 0.18 * viewScale;
      axisLabelsRef.current[0].position.set(axisLength + labelOffset, 0, 0);
      axisLabelsRef.current[1].position.set(0, axisLength + labelOffset, 0);
      axisLabelsRef.current[2].position.set(0, 0, axisLength + labelOffset);
      axisLabelsRef.current.forEach((label) => {
        // X/Y 镜像显示时，反向拉伸以保证文字不被镜像
        label.scale.set(-labelScale, -labelScale, labelScale);
      });
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
    // 以 Z 轴为朝上，X 轴指向屏幕外侧
    camera.up.set(0, 0, 1);
    camera.position.set(2.4, 0, 0);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(2, 3, 1.5);
    scene.add(ambient, dirLight);

    const displayGroup = new THREE.Group();
    // 镜像 X/Y 轴：将 IMU 坐标系映射为屏幕坐标系
    // 目标：X 正方向指向屏幕内部，Y 正方向向右，Z 正方向向上
    displayGroup.scale.set(-1, -1, 1);
    scene.add(displayGroup);
    displayGroupRef.current = displayGroup;

    // 传感器外形：Y 最长，Z 最短，X 为宽度（仅用于视觉比例）
    const bodyGeometry = new THREE.BoxGeometry(0.6, 0.9, 0.2);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x4f9bff,
      metalness: 0.1,
      roughness: 0.5,
      side: THREE.DoubleSide,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.scale.setScalar(scale);
    displayGroup.add(body);
    bodyRef.current = body;

    // 坐标轴长度：用于 AxesHelper 以及文字标识的位置基准
    const axisLength = 0.8;
    axisLengthRef.current = axisLength;
    const axes = new THREE.AxesHelper(axisLength);
    axes.scale.setScalar(scale);
    const axisGroup = new THREE.Group();
    axisGroup.add(axes);
    displayGroup.add(axisGroup);
    axisGroupRef.current = axisGroup;
    axesRef.current = axes;

    /**
     * 创建坐标轴文字标识：
     * 1) 用 Canvas 绘制大号字母
     * 2) 转成纹理贴到 Sprite 上
     * 3) Sprite 在 3D 场景里始终朝向相机，便于阅读
     */
    const createAxisLabel = (text: string, color: string) => {
      const canvas = document.createElement("canvas");
      const size = 128;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return undefined;
      }
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

    // 采用接近 Three.js 传统配色：X 红、Y 绿、Z 蓝
    const labelDefs = [
      { text: "X", color: "#ff6b6b" },
      { text: "Y", color: "#6bffb8" },
      { text: "Z", color: "#57b2ff" },
    ];
    const labelResources: Array<{ material: THREE.SpriteMaterial; texture: THREE.Texture }> = [];
    axisLabelsRef.current = labelDefs
      .map((def) => {
        const label = createAxisLabel(def.text, def.color);
        if (!label) {
          return null;
        }
        labelResources.push({ material: label.material, texture: label.texture });
        axisGroup.add(label.sprite);
        return label.sprite;
      })
      .filter((label): label is THREE.Sprite => label !== null);

    if (axisLabelsRef.current.length) {
      // 将文字标识放在各轴正方向末端，并做轻微外移避免与轴线重叠
      const labelScale = 0.18 * scale;
      const labelOffset = 0.12 * scale;
      axisLabelsRef.current[0].position.set(axisLength * scale + labelOffset, 0, 0);
      axisLabelsRef.current[1].position.set(0, axisLength * scale + labelOffset, 0);
      axisLabelsRef.current[2].position.set(0, 0, axisLength * scale + labelOffset);
      axisLabelsRef.current.forEach((label) => {
        // X/Y 镜像显示时，反向拉伸以保证文字不被镜像
        label.scale.set(-labelScale, -labelScale, labelScale);
      });
    }

    const maxTrailPoints = 300;
    const trailPositions = new Float32Array(maxTrailPoints * 3);
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
    trailGeometry.setDrawRange(0, 0);
    const trailMaterial = new THREE.LineBasicMaterial({ color: 0x35d0ba });
    const trailLine = new THREE.Line(trailGeometry, trailMaterial);
    trailLine.visible = showTrajectory;
    trailLine.frustumCulled = false;
    displayGroup.add(trailLine);
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
      // 使用 Z 轴为竖直方向的球坐标映射
      const x = radius * Math.cos(pitch) * Math.cos(yaw);
      const y = radius * Math.cos(pitch) * Math.sin(yaw);
      const z = radius * Math.sin(pitch);
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
        if (axisGroupRef.current) {
          axisGroupRef.current.quaternion.copy(tmpQuat);
        }
        if (axisGroupRef.current) {
          axisGroupRef.current.quaternion.copy(tmpQuat);
        }

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
      axisLabelsRef.current = [];
      labelResources.forEach((resource) => {
        resource.material.dispose();
        resource.texture.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div className={styles.imuThreeView} ref={containerRef} />;
};
