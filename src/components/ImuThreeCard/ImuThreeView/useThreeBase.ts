import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const MAX_PITCH = THREE.MathUtils.degToRad(89);

/**
 * 基础 Three.js Hook
 * 
 * 封装了基础的 Three.js 场景设置，包括：
 * - 场景 (Scene) 和 相机 (Camera) 初始化
 * - 渲染器 (Renderer) 初始化与尺寸适配
 * - 灯光 (Ambient + Directional)
 * - 坐标系镜像分组 (DisplayGroup) 用于适配 IMU 坐标系
 * - 交互控制 (拖拽旋转、滚轮缩放)
 * - 渲染循环 (Render Loop)
 * 
 * @param scale 初始缩放比例
 * @param onRender 每帧渲染前的回调函数，用于更新模型/轨迹数据
 * @returns 包含容器 Ref、显示分组 Ref、当前缩放 Ref 和场景 Ref
 */
export const useThreeBase = (
  scale: number,
  onRender?: () => void
) => {
  /** DOM 容器引用 */
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  /** 显示分组：包含所有 3D 内容，并做了坐标系镜像处理 */
  const displayGroupRef = useRef<THREE.Group | null>(null);

  /** 当前视图缩放比例 */
  const [viewScale, setViewScale] = useState(scale);
  /** 缩放比例 Ref，供闭包内访问最新值 */
  const viewScaleRef = useRef(scale);

  /** 拖拽交互状态 */
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0, yaw: 0, pitch: 0 });
  const onRenderRef = useRef(onRender);

  // 同步 Refs
  useEffect(() => {
    setViewScale(scale);
  }, [scale]);

  useEffect(() => {
    viewScaleRef.current = viewScale;
  }, [viewScale]);

  useEffect(() => {
    onRenderRef.current = onRender;
  });

  /**
   * 初始化 Three.js 环境
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 场景设置
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0f14);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 100);
    cameraRef.current = camera;
    camera.up.set(0, 0, 1);
    camera.position.set(2.4, 0, 0);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(2, 3, 1.5);
    scene.add(ambient, dirLight);

    const displayGroup = new THREE.Group();
    displayGroup.scale.set(-1, -1, 1); // 镜像 X/Y 轴：将 IMU 坐标系映射为屏幕坐标系
    displayGroup.position.set(0, 0, -0.45); // 整体下移避免遮挡
    scene.add(displayGroup);
    displayGroupRef.current = displayGroup;

    // 尺寸调整监听
    const resize = () => {
      if (!container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;
      
      // 更新 renderer 和 camera
      renderer.setSize(width, height, true); // 第三个参数 updateStyle=true
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    
    // 初始调用
    resize();
    
    // 使用 ResizeObserver 监听容器尺寸变化
    const resizeObserver = new ResizeObserver(() => {
      resize();
    });
    resizeObserver.observe(container);

    // 交互逻辑
    const target = new THREE.Vector3(0, 0, 0);
    const radius = 2.4;

    const updateCamera = () => {
      const { yaw, pitch } = dragRef.current;
      const x = radius * Math.cos(pitch) * Math.cos(yaw);
      const y = radius * Math.cos(pitch) * Math.sin(yaw);
      const z = radius * Math.sin(pitch);
      camera.position.set(x, y, z);
      camera.lookAt(target);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      dragRef.current.dragging = true;
      dragRef.current.lastX = event.clientX;
      dragRef.current.lastY = event.clientY;
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragRef.current.dragging) return;
      const dx = event.clientX - dragRef.current.lastX;
      const dy = event.clientY - dragRef.current.lastY;
      dragRef.current.lastX = event.clientX;
      dragRef.current.lastY = event.clientY;
      dragRef.current.yaw -= dx * 0.005;
      dragRef.current.pitch += dy * 0.005;
      dragRef.current.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, dragRef.current.pitch));
      updateCamera();
    };

    const handlePointerUp = (event: PointerEvent) => {
      dragRef.current.dragging = false;
      (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = Math.sign(event.deltaY);
      setViewScale((currentScale) => {
        return Math.min(3, Math.max(0.4, currentScale * (delta > 0 ? 0.95 : 1.05)));
      });
    };

    updateCamera();

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointerleave", handlePointerUp);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });

    // 渲染循环
    let animationId = 0;
    const renderLoop = () => {
      animationId = requestAnimationFrame(renderLoop);
      if (onRenderRef.current) {
        onRenderRef.current();
      }
      renderer.render(scene, camera);
    };
    renderLoop();

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointerleave", handlePointerUp);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    };
  }, []); // 仅在挂载时运行一次

  return {
    containerRef,
    displayGroupRef,
    viewScaleRef,
    sceneRef,
  };
};
