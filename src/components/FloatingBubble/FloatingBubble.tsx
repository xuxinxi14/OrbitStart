import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { emit, listen } from "@tauri-apps/api/event";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { Clock, FolderKanban, Plus, Search, Settings } from "lucide-react";
import type { AppSettings } from "../../types";
import { exitFloatingModeAndShowMain } from "../../lib/native";
import "./FloatingBubble.css";

async function animateWindowPosition(
  appWin: any,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  durationMs: number
) {
  const startTime = performance.now();

  return new Promise<void>((resolve) => {
    const tick = async (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const ease = progress * (2 - progress);

      const currentX = startX + (endX - startX) * ease;
      const currentY = startY + (endY - startY) * ease;

      try {
        await appWin.setPosition(new LogicalPosition(currentX, currentY));
      } catch {
        resolve();
        return;
      }

      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}

interface FloatingBubbleProps {
  settings: AppSettings | null;
}

function clearTimer(timerRef: React.MutableRefObject<number | null>) {
  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

async function logBubbleError(message: string) {
  try {
    await invoke("log_frontend_error", { message });
  } catch {
    console.error(message);
  }
}

export function FloatingBubble({ settings }: FloatingBubbleProps) {
  const sizeValue = settings?.bubbleSize ?? 64;
  const configuredOpacity = settings?.bubbleOpacity ?? 1.0;
  const alwaysOnTop = settings?.bubbleAlwaysOnTop ?? true;
  const expandOnHover = settings?.bubbleExpandOnHover ?? true;
  const expandDelayMs = Math.max(80, settings?.bubbleExpandDelayMs ?? 180);
  const snapToEdge = settings?.bubbleSnapToEdge ?? true;

  const [isMainBubbleHovered, setIsMainBubbleHovered] = useState(false);
  const [align, setAlign] = useState<"left" | "right">("right");
  const [previewOpacity, setPreviewOpacity] = useState(configuredOpacity);

  const showMenuTimerRef = useRef<number | null>(null);
  const hideMenuTimerRef = useRef<number | null>(null);
  const bubbleHoveredRef = useRef(false);
  const menuHoveredRef = useRef(false);

  const dragRef = useRef<{
    isDragging: boolean;
    startScreenX: number;
    startScreenY: number;
    startWindowX: number;
    startWindowY: number;
    scaleFactor: number;
    hasMoved: boolean;
  } | null>(null);

  useEffect(() => {
    setPreviewOpacity(configuredOpacity);
  }, [configuredOpacity]);

  useEffect(() => {
    let unlistenOpacity: (() => void) | undefined;
    let unlistenMenuHover: (() => void) | undefined;
    let unlistenPosition: (() => void) | undefined;

    listen<number>("orbit://bubble-opacity-preview", (event) => {
      const value = Number(event.payload);
      if (Number.isFinite(value)) {
        setPreviewOpacity(Math.max(0.1, Math.min(1, value)));
      }
    }).then((unlisten) => {
      unlistenOpacity = unlisten;
    });

    listen<string>("orbit://bubble-menu-hover", (event) => {
      menuHoveredRef.current = event.payload === "enter";
      if (menuHoveredRef.current) {
        clearTimer(hideMenuTimerRef);
      } else {
        scheduleHideMenu();
      }
    }).then((unlisten) => {
      unlistenMenuHover = unlisten;
    });

    listen<{ x: number; y: number; align: "left" | "right" }>("orbit://bubble-position-changed", (event) => {
      const payload = event.payload;
      if (!payload || !Number.isFinite(payload.x) || !Number.isFinite(payload.y)) return;
      const nextAlign = payload.align === "left" ? "left" : "right";
      setAlign(nextAlign);
      localStorage.setItem("orbitstart_bubble_align", nextAlign);
      localStorage.setItem("orbitstart_bubble_position", JSON.stringify({ x: payload.x, y: payload.y }));
    }).then((unlisten) => {
      unlistenPosition = unlisten;
    });

    return () => {
      unlistenOpacity?.();
      unlistenMenuHover?.();
      unlistenPosition?.();
    };
  }, []);

  useEffect(() => {
    const savedAlign = localStorage.getItem("orbitstart_bubble_align");
    const savedPos = localStorage.getItem("orbitstart_bubble_position");

    if (savedAlign === "left" || savedAlign === "right") {
      setAlign(savedAlign);
    }

    const appWin = getCurrentWindow() as any;
    if (savedPos) {
      try {
        const pos = JSON.parse(savedPos);
        appWin.setPosition(new LogicalPosition(pos.x, pos.y)).catch(() => undefined);
      } catch (e) {
        console.error("Failed to parse saved bubble position", e);
      }
    } else {
      const runInit = async () => {
        try {
          const monitor = await currentMonitor();
          if (monitor) {
            const scaleFactor = monitor.scaleFactor;
            const monitorX = monitor.position.x / scaleFactor;
            const monitorWidth = monitor.size.width / scaleFactor;
            const monitorY = monitor.position.y / scaleFactor;
            const monitorHeight = monitor.size.height / scaleFactor;

            const defaultX = monitorX + monitorWidth - sizeValue - 18;
            const defaultY = Math.max(
              monitorY + 10,
              Math.min(
                monitorY + monitorHeight - sizeValue - 10,
                monitorY + monitorHeight * 0.7 - sizeValue / 2
              )
            );
            await appWin.setPosition(new LogicalPosition(defaultX, defaultY));
            setAlign("right");
            localStorage.setItem("orbitstart_bubble_align", "right");
            localStorage.setItem("orbitstart_bubble_position", JSON.stringify({ x: defaultX, y: defaultY }));
          }
        } catch (err) {
          console.error("Failed to initialize bubble window position:", err);
        }
      };
      void runInit();
    }

    appWin.setAlwaysOnTop(alwaysOnTop).catch(() => undefined);
  }, [alwaysOnTop, sizeValue]);

  useEffect(() => {
    const preventDefault = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("contextmenu", preventDefault);

    let unlistenReset: (() => void) | undefined;
    listen("orbit://bubble-reset-position", () => {
      setAlign("right");
      localStorage.setItem("orbitstart_bubble_align", "right");
    }).then((un) => {
      unlistenReset = un;
    });

    return () => {
      clearTimer(showMenuTimerRef);
      clearTimer(hideMenuTimerRef);
      void invoke("hide_bubble_menu_window").catch(() => undefined);
      window.removeEventListener("contextmenu", preventDefault);
      unlistenReset?.();
    };
  }, []);

  const styleVariables = useMemo(() => {
    return {
      "--main-size": `${sizeValue}px`,
      opacity: previewOpacity,
    } as React.CSSProperties;
  }, [sizeValue, previewOpacity]);

  const isLarge = sizeValue >= 64;
  const normalImg = isLarge ? "/design/大悬浮球(无光晕).png" : "/design/小悬浮球(无光晕).png";
  const hoverImg = isLarge ? "/design/大悬浮球(有光晕).png" : "/design/小悬浮球(有光晕).png";

  function scheduleShowMenu() {
    if (!expandOnHover) return;
    clearTimer(hideMenuTimerRef);
    clearTimer(showMenuTimerRef);
    showMenuTimerRef.current = window.setTimeout(() => {
      if (!bubbleHoveredRef.current || dragRef.current?.isDragging) return;
      void invoke("show_bubble_menu_window").catch((error) => {
        void logBubbleError(`show_bubble_menu_window failed: ${String(error)}`);
      });
    }, expandDelayMs);
  }

  function scheduleHideMenu() {
    clearTimer(showMenuTimerRef);
    clearTimer(hideMenuTimerRef);
    hideMenuTimerRef.current = window.setTimeout(() => {
      if (bubbleHoveredRef.current || menuHoveredRef.current) return;
      void invoke("hide_bubble_menu_window").catch(() => undefined);
    }, 200);
  }

  function showMenuNow() {
    clearTimer(showMenuTimerRef);
    clearTimer(hideMenuTimerRef);
    void invoke("show_bubble_menu_window").catch((error) => {
      void logBubbleError(`show_bubble_menu_window failed: ${String(error)}`);
    });
  }

  function markBubbleHovered() {
    if (!bubbleHoveredRef.current) {
      bubbleHoveredRef.current = true;
      setIsMainBubbleHovered(true);
      scheduleShowMenu();
    }
  }

  const handlePointerDown = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    clearTimer(showMenuTimerRef);
    bubbleHoveredRef.current = false;
    setIsMainBubbleHovered(false);
    void invoke("hide_bubble_menu_window").catch(() => undefined);

    const appWin = getCurrentWindow() as any;
    dragRef.current = {
      isDragging: true,
      startScreenX: e.screenX,
      startScreenY: e.screenY,
      startWindowX: 0,
      startWindowY: 0,
      scaleFactor: 1,
      hasMoved: false,
    };

    try {
      const startPos = await appWin.outerPosition();
      await appWin.startDragging();
      const endPos = await appWin.outerPosition();
      const moved = Math.abs(endPos.x - startPos.x) > 4 || Math.abs(endPos.y - startPos.y) > 4;

      if (!moved) {
        await exitFloatingModeAndShowMain();
        return;
      }

      const monitor = await currentMonitor();
      if (monitor) {
        const sf = monitor.scaleFactor;
        const currentX = endPos.x / sf;
        const currentY = endPos.y / sf;
        const monitorX = monitor.position.x / sf;
        const monitorWidth = monitor.size.width / sf;
        const monitorY = monitor.position.y / sf;
        const monitorHeight = monitor.size.height / sf;
        const centerX = currentX + sizeValue / 2;
        const monitorCenterX = monitorX + monitorWidth / 2;
        const isLeft = centerX < monitorCenterX;
        const snapX = isLeft ? monitorX + 8 : (monitorX + monitorWidth - sizeValue - 8);
        const minY = monitorY + 10;
        const maxY = monitorY + monitorHeight - sizeValue - 10;
        const snapY = Math.max(minY, Math.min(maxY, currentY));

        if (snapToEdge) {
          await animateWindowPosition(appWin, currentX, currentY, snapX, snapY, 120);
        }

        const newAlign = isLeft ? "left" : "right";
        const savedX = snapToEdge ? snapX : currentX;
        const savedY = snapToEdge ? snapY : currentY;
        setAlign(newAlign);
        localStorage.setItem("orbitstart_bubble_align", newAlign);
        localStorage.setItem("orbitstart_bubble_position", JSON.stringify({ x: savedX, y: savedY }));
      }
    } catch (error) {
      await invoke("begin_bubble_drag").catch((fallbackError) => {
        void logBubbleError(`bubble drag failed: ${String(error)}; fallback failed: ${String(fallbackError)}`);
      });
    } finally {
      dragRef.current = null;
    }
  };

  const handlePointerMove = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) {
      markBubbleHovered();
      return;
    }
    if (!dragRef.current || !dragRef.current.isDragging) return;

    const deltaX = e.screenX - dragRef.current.startScreenX;
    const deltaY = e.screenY - dragRef.current.startScreenY;

    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      dragRef.current.hasMoved = true;
    }

    if (dragRef.current.hasMoved) {
      const newX = dragRef.current.startWindowX + deltaX;
      const newY = dragRef.current.startWindowY + deltaY;

      const appWin = getCurrentWindow() as any;
      await appWin.setPosition(new LogicalPosition(newX, newY));
    }
  };

  const handlePointerUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) {
      if (e.button === 2) {
        e.preventDefault();
        bubbleHoveredRef.current = true;
        setIsMainBubbleHovered(true);
        showMenuNow();
      }
      return;
    }
    e.currentTarget.releasePointerCapture(e.pointerId);

    const appWin = getCurrentWindow() as any;

    if (dragRef.current.hasMoved) {
      const monitor = await currentMonitor();
      if (monitor) {
        const pos = await appWin.outerPosition();
        const sf = monitor.scaleFactor;
        const currentX = pos.x / sf;
        const currentY = pos.y / sf;

        const monitorX = monitor.position.x / sf;
        const monitorWidth = monitor.size.width / sf;
        const monitorY = monitor.position.y / sf;
        const monitorHeight = monitor.size.height / sf;

        const centerX = currentX + sizeValue / 2;
        const monitorCenterX = monitorX + monitorWidth / 2;
        const isLeft = centerX < monitorCenterX;

        const snapX = isLeft ? monitorX + 8 : (monitorX + monitorWidth - sizeValue - 8);
        const minY = monitorY + 10;
        const maxY = monitorY + monitorHeight - sizeValue - 10;
        const snapY = Math.max(minY, Math.min(maxY, currentY));

        if (snapToEdge) {
          await animateWindowPosition(appWin, currentX, currentY, snapX, snapY, 160);
        }

        const newAlign = isLeft ? "left" : "right";
        const savedX = snapToEdge ? snapX : currentX;
        const savedY = snapToEdge ? snapY : currentY;
        setAlign(newAlign);
        localStorage.setItem("orbitstart_bubble_align", newAlign);
        localStorage.setItem("orbitstart_bubble_position", JSON.stringify({ x: savedX, y: savedY }));
      }
    } else {
      await exitFloatingModeAndShowMain();
    }

    dragRef.current = null;
    if (bubbleHoveredRef.current) scheduleShowMenu();
  };

  const handlePointerEnter = () => {
    bubbleHoveredRef.current = true;
    setIsMainBubbleHovered(true);
    scheduleShowMenu();
  };

  const handlePointerLeave = () => {
    bubbleHoveredRef.current = false;
    setIsMainBubbleHovered(false);
    if (!dragRef.current?.isDragging) scheduleHideMenu();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    showMenuNow();
  };

  const handleMouseMove = () => {
    markBubbleHovered();
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (e.button === 2) {
      e.preventDefault();
      bubbleHoveredRef.current = true;
      setIsMainBubbleHovered(true);
      showMenuNow();
    }
  };

  return (
    <div className="bubble-window-wrapper">
      <div
        className={`bubble-active-area align-${align}`}
        style={styleVariables}
        onContextMenu={handleContextMenu}
      >
        <div
          className={`main-bubble ${isMainBubbleHovered ? "hovered" : ""}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          title="点击打开 OrbitStart，右键展开快捷操作"
        >
          <img
            src={isMainBubbleHovered ? hoverImg : normalImg}
            alt="OrbitStart"
            className="bubble-img"
            draggable={false}
          />
        </div>
      </div>
    </div>
  );
}

const menuActions = [
  { id: "search", label: "搜索", icon: Search },
  { id: "add-resource", label: "添加", icon: Plus },
  { id: "workspace", label: "工作区", icon: FolderKanban },
  { id: "recent", label: "最近", icon: Clock },
  { id: "settings", label: "设置", icon: Settings },
] as const;

export function FloatingBubbleMenu({ settings }: FloatingBubbleProps) {
  const opacityValue = settings?.bubbleOpacity ?? 1.0;
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);

  const normalActionImg = "/design/小悬浮球(无光晕).png";
  const hoverActionImg = "/design/小悬浮球(有光晕).png";

  useEffect(() => {
    return () => {
      void emit("orbit://bubble-menu-hover", "leave").catch(() => undefined);
    };
  }, []);

  const handleMouseEnter = () => {
    void emit("orbit://bubble-menu-hover", "enter").catch(() => undefined);
  };

  const handleMouseLeave = () => {
    setHoveredAction(null);
    void emit("orbit://bubble-menu-hover", "leave").catch(() => undefined);
  };

  const handleAction = async (action: string) => {
    await emit("orbit://bubble-menu-hover", "leave").catch(() => undefined);
    await exitFloatingModeAndShowMain(action);
  };

  return (
    <div
      className="bubble-menu-shell"
      style={{ opacity: opacityValue }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={(event) => event.preventDefault()}
    >
      {menuActions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            type="button"
            className="bubble-menu-action"
            title={action.label}
            onPointerEnter={() => setHoveredAction(action.id)}
            onPointerLeave={() => setHoveredAction((current) => current === action.id ? null : current)}
            onClick={() => void handleAction(action.id)}
          >
            <img
              src={hoveredAction === action.id ? hoverActionImg : normalActionImg}
              alt=""
              aria-hidden="true"
              className="bubble-menu-action-bg"
              draggable={false}
            />
            <Icon size={18} />
            <span>{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}
