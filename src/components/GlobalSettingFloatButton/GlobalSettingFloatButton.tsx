import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { SettingOutlined } from "@ant-design/icons";
import { Button } from "antd";

import { useBluetooth } from "../../hooks/useBluetooth";
import { useDeveloperMode } from "../../hooks/useDeveloperMode";
import styles from "./GlobalSettingFloatButton.module.scss";

type Props = {
  /** 点击按钮后打开设置弹窗。 */
  onClick: () => void;
};

type HideEdge = "left" | "right" | "top" | "bottom";

type FloatPosition = {
  x: number;
  y: number;
};

type DragSession = {
  startPointerX: number;
  startPointerY: number;
  startX: number;
  startY: number;
  moved: boolean;
};

type DraggableBounds = {
  maxX: number;
  maxY: number;
};

const BUTTON_SIZE = 42;
const BUTTON_MARGIN = 12;
const BUTTON_DEFAULT_TOP = 12;
const HIDE_TRIGGER = 28;
const PEEK_TRIGGER = 56;

/**
 * 将数值限制到指定范围内。
 */
const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

/**
 * 计算当前层级容器内可拖拽边界。
 */
const getDraggableBounds = (container: HTMLElement): DraggableBounds => {
  return {
    maxX: Math.max(0, container.clientWidth - BUTTON_SIZE),
    maxY: Math.max(0, container.clientHeight - BUTTON_SIZE),
  };
};

/**
 * 计算当前位置最近的边缘。
 */
const getClosestHideEdge = (
  position: FloatPosition,
  bounds: DraggableBounds
): HideEdge | null => {
  const distanceByEdge: Record<HideEdge, number> = {
    left: position.x,
    right: bounds.maxX - position.x,
    top: position.y,
    bottom: bounds.maxY - position.y,
  };

  let closestEdge: HideEdge | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  (Object.keys(distanceByEdge) as HideEdge[]).forEach((edge) => {
    const distance = distanceByEdge[edge];
    if (distance < closestDistance) {
      closestDistance = distance;
      closestEdge = edge;
    }
  });

  return closestDistance <= HIDE_TRIGGER ? closestEdge : null;
};

/**
 * 将按钮位置吸附到目标边缘。
 */
const snapPositionToEdge = (
  position: FloatPosition,
  edge: HideEdge,
  bounds: DraggableBounds
): FloatPosition => {
  if (edge === "left") return { x: 0, y: position.y };
  if (edge === "right") return { x: bounds.maxX, y: position.y };
  if (edge === "top") return { x: position.x, y: 0 };
  return { x: position.x, y: bounds.maxY };
};

/**
 * 全局悬浮设置按钮。
 */
export const GlobalSettingFloatButton = ({ onClick }: Props) => {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
  const initializedRef = useRef(false);
  const positionRef = useRef<FloatPosition>({ x: 0, y: 0 });
  const hideHintEdgeRef = useRef<HideEdge | null>(null);
  const suppressNextClickRef = useRef(false);

  const { connectedDevice } = useBluetooth();
  const { isDeveloperMode } = useDeveloperMode();

  /** 当前按钮位置。 */
  const [buttonPosition, setButtonPosition] = useState<FloatPosition>({ x: 0, y: 0 });
  /** 是否完成初始布局。 */
  const [buttonReady, setButtonReady] = useState(false);
  /** 是否处于拖拽中。 */
  const [buttonDragging, setButtonDragging] = useState(false);
  /** 当前隐藏边缘。 */
  const [buttonHiddenEdge, setButtonHiddenEdge] = useState<HideEdge | null>(null);
  /** 当前是否处于靠近展开态。 */
  const [buttonPeekVisible, setButtonPeekVisible] = useState(false);

  /** 是否允许打开设置弹窗。 */
  const canOpenSettings = useMemo(
    () => connectedDevice !== null || isDeveloperMode,
    [connectedDevice, isDeveloperMode]
  );

  /**
   * 初始化悬浮按钮位置，并在容器变化时自动约束。
   */
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;

    const syncPosition = () => {
      const bounds = getDraggableBounds(layer);
      const hasInitialized = initializedRef.current;
      const initialPosition = {
        x: Math.max(0, bounds.maxX - BUTTON_MARGIN),
        y: Math.min(bounds.maxY, BUTTON_DEFAULT_TOP),
      };

      setButtonPosition((previousPosition) => {
        if (!hasInitialized) {
          return initialPosition;
        }
        return {
          x: clamp(previousPosition.x, 0, bounds.maxX),
          y: clamp(previousPosition.y, 0, bounds.maxY),
        };
      });

      if (!hasInitialized) {
        initializedRef.current = true;
        setButtonReady(true);
      }
    };

    syncPosition();
    const resizeObserver = new ResizeObserver(syncPosition);
    resizeObserver.observe(layer);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  /**
   * 同步按钮位置引用，供窗口级事件使用。
   */
  useEffect(() => {
    positionRef.current = buttonPosition;
  }, [buttonPosition]);

  /**
   * 开始拖拽按钮。
   */
  const handleButtonPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const layer = layerRef.current;
    if (!layer || !buttonReady) return;

    dragSessionRef.current = {
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startX: positionRef.current.x,
      startY: positionRef.current.y,
      moved: false,
    };
    setButtonDragging(true);
  };

  /**
   * 跟随鼠标拖拽并实时给出隐藏提示。
   */
  const handlePointerMove = useCallback((event: PointerEvent) => {
    if (!buttonDragging) return;
    const layer = layerRef.current;
    const dragSession = dragSessionRef.current;
    if (!layer || !dragSession) return;

    const bounds = getDraggableBounds(layer);
    const deltaX = event.clientX - dragSession.startPointerX;
    const deltaY = event.clientY - dragSession.startPointerY;
    if (!dragSession.moved && (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3)) {
      dragSession.moved = true;
      setButtonHiddenEdge(null);
      setButtonPeekVisible(false);
      hideHintEdgeRef.current = null;
    }

    const nextPosition = {
      x: clamp(dragSession.startX + deltaX, 0, bounds.maxX),
      y: clamp(dragSession.startY + deltaY, 0, bounds.maxY),
    };
    const nextHideHintEdge = getClosestHideEdge(nextPosition, bounds);

    hideHintEdgeRef.current = nextHideHintEdge;
    setButtonPosition(nextPosition);
  }, [buttonDragging]);

  /**
   * 结束拖拽，执行边缘吸附隐藏。
   */
  const handlePointerUp = useCallback(() => {
    if (!buttonDragging) return;
    const layer = layerRef.current;
    const dragSession = dragSessionRef.current;
    const nextHideHintEdge = hideHintEdgeRef.current;

    if (!dragSession?.moved) {
      dragSessionRef.current = null;
      hideHintEdgeRef.current = null;
      setButtonDragging(false);
      return;
    }

    if (layer && nextHideHintEdge) {
      const bounds = getDraggableBounds(layer);
      setButtonPosition((previousPosition) =>
        snapPositionToEdge(previousPosition, nextHideHintEdge, bounds)
      );
      setButtonHiddenEdge(nextHideHintEdge);
    } else {
      setButtonHiddenEdge(null);
    }

    if (dragSession?.moved) {
      suppressNextClickRef.current = true;
      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 0);
    }

    dragSessionRef.current = null;
    hideHintEdgeRef.current = null;
    setButtonDragging(false);
    setButtonPeekVisible(false);
  }, [buttonDragging]);

  /**
   * 拖拽期间绑定全局指针事件。
   */
  useEffect(() => {
    if (!buttonDragging) return;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [buttonDragging, handlePointerMove, handlePointerUp]);

  /**
   * 按钮隐藏后，鼠标靠近隐藏边缘时自动弹出。
   */
  useEffect(() => {
    if (!buttonHiddenEdge || buttonDragging) return;

    const handleWindowMouseMove = (event: MouseEvent) => {
      const layer = layerRef.current;
      if (!layer) return;

      const rect = layer.getBoundingClientRect();
      const insideLayer =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!insideLayer) {
        setButtonPeekVisible(false);
        return;
      }

      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const nearHiddenEdge =
        (buttonHiddenEdge === "left" && localX <= PEEK_TRIGGER) ||
        (buttonHiddenEdge === "right" && localX >= rect.width - PEEK_TRIGGER) ||
        (buttonHiddenEdge === "top" && localY <= PEEK_TRIGGER) ||
        (buttonHiddenEdge === "bottom" && localY >= rect.height - PEEK_TRIGGER);

      setButtonPeekVisible(nearHiddenEdge);
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
    };
  }, [buttonDragging, buttonHiddenEdge]);

  /**
   * 点击按钮，打开设置弹窗。
   */
  const handleOpenSettingsModal = useCallback(() => {
    if (suppressNextClickRef.current || buttonDragging) return;
    if (!canOpenSettings) return;
    onClick();
  }, [buttonDragging, canOpenSettings, onClick]);

  /**
   * 生成按钮样式类名。
   */
  const floatButtonClassName = useMemo(() => {
    const classNames = [styles.floatButton];
    if (!buttonReady) classNames.push(styles.floatButtonHidden);
    if (buttonDragging) classNames.push(styles.floatButtonDragging);
    if (buttonHiddenEdge === "left") classNames.push(styles.floatButtonEdgeLeft);
    if (buttonHiddenEdge === "right") classNames.push(styles.floatButtonEdgeRight);
    if (buttonHiddenEdge === "top") classNames.push(styles.floatButtonEdgeTop);
    if (buttonHiddenEdge === "bottom") classNames.push(styles.floatButtonEdgeBottom);
    if (buttonPeekVisible) classNames.push(styles.floatButtonPeekVisible);
    return classNames.join(" ");
  }, [buttonDragging, buttonHiddenEdge, buttonPeekVisible, buttonReady]);

  return (
    <div className={styles.floatLayer} ref={layerRef}>
      <div
        className={floatButtonClassName}
        style={{
          left: `${buttonPosition.x}px`,
          top: `${buttonPosition.y}px`,
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
        }}
      >
        <Button
          type="default"
          shape="circle"
          icon={<SettingOutlined />}
          className={styles.floatButtonInner}
          onPointerDown={handleButtonPointerDown}
          onClick={handleOpenSettingsModal}
          aria-label="打开设置"
          style={{
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
            minWidth: BUTTON_SIZE,
            minHeight: BUTTON_SIZE,
            padding: 0,
            borderRadius: "50%",
          }}
          disabled={!canOpenSettings}
        />
      </div>
    </div>
  );
};
