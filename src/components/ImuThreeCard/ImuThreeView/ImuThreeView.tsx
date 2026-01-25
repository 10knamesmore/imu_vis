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
  /** 是否在视图中绘制轨迹（轴向量端点轨迹 + 未来原点轨迹） */
  showTrajectory: boolean;
  /** 轴向量端点轨迹配置 */
  trajectoryOption: TrajectoryOption;
  /** 模型显示的缩放倍率 */
  scale: number;
  /** 是否使用计算后的姿态 */
  useCalculated: boolean;
  /** 触发轨迹清空的计数器（轴向量端点轨迹 + 未来原点轨迹） */
  trailResetToken: number;
};

/**
 * 轨迹显示配置选项
 */
export type TrajectoryOption = {
  /** 是否显示 X 轴端点轨迹 */
  x: boolean;
  /** 是否显示 Y 轴端点轨迹 */
  y: boolean;
  /** 是否显示 Z 轴端点轨迹 */
  z: boolean;
  /** 是否显示中心点位移轨迹 */
  center: boolean;
};

type AxisKey = keyof Omit<TrajectoryOption, "center">;
const axisKeys: AxisKey[] = ["x", "y", "z"];

/**
 * IMU 三维视图组件：负责创建 Three.js 场景并同步显示姿态与轴向量端点轨迹。
 */
export const ImuThreeView: React.FC<ImuThreeViewProps> = ({
  source,
  showTrajectory,
  trajectoryOption,
  scale,
  useCalculated,
  trailResetToken,
}) => {
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
  /** 轴向量端点轨迹线的引用 */
  const trailRefs = useRef<Record<AxisKey, THREE.Line | null>>({ x: null, y: null, z: null });
  /** 中心点轨迹线的引用 */
  const centerTrailRef = useRef<THREE.Line | null>(null);
  // 缓存轴向量端点轨迹几何与数据，便于外部触发清空而不重建场景。
  const trailGeometryRefs = useRef<Record<AxisKey, THREE.BufferGeometry | null>>({
    x: null,
    y: null,
    z: null,
  });
  /** 中心点轨迹几何缓存 */
  const centerTrailGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const trailPositionsRefs = useRef<Record<AxisKey, Float32Array | null>>({
    x: null,
    y: null,
    z: null,
  });
  /** 中心点轨迹顶点位置数据缓存 */
  const centerTrailPositionsRef = useRef<Float32Array | null>(null);
  const maxTrailPointsRef = useRef(0);
  /** 坐标轴文字标识的引用（用 Sprite 贴图方式实现 3D 文字） */
  const axisLabelsRef = useRef<THREE.Sprite[]>([]);
  /** 坐标轴长度基准（用于计算文字标识的放置位置） */
  const axisLengthRef = useRef(0.8);
  /** 数据源的 Ref，确保在闭包（如 renderLoop）中能访问最新 source 对象 */
  const sourceRef = useRef(source);
  /** 是否使用计算后姿态的 Ref，确保在闭包中能访问最新值 */
  const useCalculatedRef = useRef(useCalculated);
  /** 轴向量端点轨迹数据的状态记录：当前轨迹点总数 */
  const trailStateRef = useRef<Record<AxisKey, { count: number }>>({
    x: { count: 0 },
    y: { count: 0 },
    z: { count: 0 },
  });
  /** 中心点轨迹数据的状态记录：当前轨迹点总数 */
  const centerTrailStateRef = useRef<{ count: number }>({ count: 0 });
  /** 轨迹开关与配置的 Ref，确保在闭包中能访问最新值 */
  const showTrajectoryRef = useRef(showTrajectory);
  const trajectoryOptionRef = useRef(trajectoryOption);
  /** 当前缩放值的 Ref，确保在闭包中能访问最新值 */
  const viewScaleRef = useRef(scale);
  /** Three.js 透视相机引用 */
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  /** 鼠标/触摸拖拽交互的状态记录（旋转角度、拖拽标记等） */
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0, yaw: 0, pitch: 0 });

  /** 本地状态：当前的视图缩放比例 */
  const [viewScale, setViewScale] = useState(scale);

  /**
   * 同步最新数据源引用，避免渲染循环读取旧对象。
   */
  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  /**
   * 同步是否使用计算姿态的开关。
   */
  useEffect(() => {
    useCalculatedRef.current = useCalculated;
  }, [useCalculated]);

  /**
   * 同步轨迹显示开关。
   */
  useEffect(() => {
    showTrajectoryRef.current = showTrajectory;
  }, [showTrajectory]);

  /**
   * 同步轴向量端点轨迹配置开关。
   */
  useEffect(() => {
    trajectoryOptionRef.current = trajectoryOption;
  }, [trajectoryOption]);

  /**
   * 同步缩放比例。
   */
  useEffect(() => {
    setViewScale(scale);
  }, [scale]);

  /**
   * 同步缩放 Ref，避免渲染循环读取旧缩放值。
   */
  useEffect(() => {
    viewScaleRef.current = viewScale;
  }, [viewScale]);

  /**
   * 当 trailResetToken 变化时清空轨迹缓冲。
   */
  useEffect(() => {
    // 通过清空位置数组与绘制范围，让轴向量端点轨迹从头开始绘制。
    axisKeys.forEach((axis) => {
      const geometry = trailGeometryRefs.current[axis];
      const positions = trailPositionsRefs.current[axis];
      if (!geometry || !positions) {
        return;
      }
      positions.fill(0);
      geometry.setDrawRange(0, 0);
      (geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      trailStateRef.current[axis] = { count: 0 };
    });

    // 清空中心轨迹
    const centerGeometry = centerTrailGeometryRef.current;
    const centerPositions = centerTrailPositionsRef.current;
    if (centerGeometry && centerPositions) {
      centerPositions.fill(0);
      centerGeometry.setDrawRange(0, 0);
      (centerGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      centerTrailStateRef.current = { count: 0 };
    }
  }, [trailResetToken]);

  /**
   * 轨迹开关变化时，更新轴向量端点轨迹线可见性。
   */
  useEffect(() => {
    axisKeys.forEach((axis) => {
      const trail = trailRefs.current[axis];
      if (trail) {
        trail.visible = showTrajectory && trajectoryOption[axis];
      }
    });
    if (centerTrailRef.current) {
      centerTrailRef.current.visible = showTrajectory && trajectoryOption.center;
    }
  }, [showTrajectory, trajectoryOption]);

  /**
   * 缩放变化时，同步模型、坐标轴与文字标识。
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

    // 创建场景与相机
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f14);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    cameraRef.current = camera;
    // 以 Z 轴为朝上，X 轴指向屏幕外侧
    camera.up.set(0, 0, 1);
    camera.position.set(2.4, 0, 0);
    camera.lookAt(0, 0, 0);

    // 创建渲染器并挂载到 DOM
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // 设置环境光与方向光
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(2, 3, 1.5);
    scene.add(ambient, dirLight);

    // 创建镜像分组，统一坐标系方向
    const displayGroup = new THREE.Group();
    // 镜像 X/Y 轴：将 IMU 坐标系映射为屏幕坐标系
    // 目标：X 正方向指向屏幕内部，Y 正方向向右，Z 正方向向上
    displayGroup.scale.set(-1, -1, 1);
    // 将模型整体下移，避免放大时被顶部遮挡
    displayGroup.position.set(0, 0, -0.4);
    scene.add(displayGroup);
    displayGroupRef.current = displayGroup;

    // 创建传感器模型（仅用于视觉比例）
    const bodyGeometry = new THREE.BoxGeometry(0.4, 0.6, 0.13);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x4f9bff,
      metalness: 0.1,
      roughness: 0.5,
      side: THREE.DoubleSide,
    });
    // 传感器模型
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.scale.setScalar(scale);
    displayGroup.add(body);
    bodyRef.current = body;

    // 创建坐标轴与文字标识
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
     * 1: 用 Canvas 绘制大号字母
     * 2: 转成纹理贴到 Sprite 上
     * 3: Sprite 在 3D 场景里始终朝向相机，便于阅读
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

    // 初始化轴向量端点轨迹线缓存
    const maxTrailPoints = 300;
    maxTrailPointsRef.current = maxTrailPoints;
    const trailMaterials: Record<AxisKey, THREE.LineBasicMaterial> = {
      x: new THREE.LineBasicMaterial({ color: 0xff6b6b }),
      y: new THREE.LineBasicMaterial({ color: 0x6bffb8 }),
      z: new THREE.LineBasicMaterial({ color: 0x57b2ff }),
    };
    axisKeys.forEach((axis) => {
      const trailPositions = new Float32Array(maxTrailPoints * 3);
      const trailGeometry = new THREE.BufferGeometry();
      trailGeometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
      trailGeometry.setDrawRange(0, 0);
      const trailLine = new THREE.Line(trailGeometry, trailMaterials[axis]);
      trailLine.visible = showTrajectory && trajectoryOption[axis];
      trailLine.frustumCulled = false;
      displayGroup.add(trailLine);
      trailRefs.current[axis] = trailLine;
      trailGeometryRefs.current[axis] = trailGeometry;
      trailPositionsRefs.current[axis] = trailPositions;
    });

    // 初始化中心轨迹线缓存
    const centerTrailPositions = new Float32Array(maxTrailPoints * 3);
    const centerTrailGeometry = new THREE.BufferGeometry();
    centerTrailGeometry.setAttribute("position", new THREE.BufferAttribute(centerTrailPositions, 3));
    centerTrailGeometry.setDrawRange(0, 0);
    const centerTrailMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
    const centerTrailLine = new THREE.Line(centerTrailGeometry, centerTrailMaterial);
    centerTrailLine.visible = showTrajectory && trajectoryOption.center;
    centerTrailLine.frustumCulled = false;
    displayGroup.add(centerTrailLine);
    centerTrailRef.current = centerTrailLine;
    centerTrailGeometryRef.current = centerTrailGeometry;
    centerTrailPositionsRef.current = centerTrailPositions;

    // 准备渲染循环使用的临时变量，避免频繁分配
    const axisBases: Record<AxisKey, THREE.Vector3> = {
      x: new THREE.Vector3(1, 0, 0),
      y: new THREE.Vector3(0, 1, 0),
      z: new THREE.Vector3(0, 0, 1),
    };
    const tmpQuat = new THREE.Quaternion();
    const tmpVec = new THREE.Vector3();
    const target = new THREE.Vector3(0, 0, 0);
    const radius = 2.4;

    /**
     * 监听容器尺寸变化，调整渲染器和相机比例。
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
     * 注册交互（拖拽旋转 + 滚轮缩放）。
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
      dragRef.current.yaw -= dx * 0.005;
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
     * 渲染循环：
     * 1: 读取最新姿态数据
     * 2: 应用姿态到模型与坐标轴
     * 3: 写入轴向量端点轨迹点并更新绘制范围
     * 4: 渲染场景
     */
    const renderLoop = () => {
      // 申请下一帧，维持持续渲染。
      animationId = requestAnimationFrame(renderLoop);
      // 读取最新一帧 IMU 数据。
      const latest = sourceRef.current.latestRef.current;
      if (latest) {
        // 选择原始或计算姿态，并转换成 Three.js 四元数。
        const attitude = useCalculatedRef.current
          ? latest.calculated_data.attitude
          : latest.raw_data.quat;
        tmpQuat.set(attitude.x, attitude.y, attitude.z, attitude.w);
        // 同步模型与坐标轴姿态。
        body.quaternion.copy(tmpQuat);
        if (axisGroupRef.current) {
          axisGroupRef.current.quaternion.copy(tmpQuat);
        }
        if (axisGroupRef.current) {
          axisGroupRef.current.quaternion.copy(tmpQuat);
        }

        if (showTrajectoryRef.current) {
          // 计算各轴朝向向量端点，写入对应轨迹缓冲并更新绘制范围。
          axisKeys.forEach((axis) => {
            if (!trajectoryOptionRef.current[axis]) {
              return;
            }
            tmpVec.copy(axisBases[axis]).applyQuaternion(tmpQuat).multiplyScalar(0.8 * viewScaleRef.current);
            const positions = trailPositionsRefs.current[axis];
            const geometry = trailGeometryRefs.current[axis];
            if (!positions || !geometry) {
              return;
            }
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

          // 更新中心轨迹
          if (trajectoryOptionRef.current.center) {
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
        }
      }
      // 渲染当前场景。
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
      axisKeys.forEach((axis) => {
        const geometry = trailGeometryRefs.current[axis];
        if (geometry) {
          geometry.dispose();
        }
        const trail = trailRefs.current[axis];
        if (trail) {
          const material = trail.material;
          if (material instanceof THREE.Material) {
            material.dispose();
          }
        }
      });
      if (centerTrailGeometryRef.current) {
        centerTrailGeometryRef.current.dispose();
      }
      if (centerTrailRef.current) {
        const material = centerTrailRef.current.material;
        if (material instanceof THREE.Material) {
          material.dispose();
        }
      }
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
