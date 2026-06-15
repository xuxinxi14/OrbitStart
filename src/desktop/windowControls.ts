import { getCurrentWindow } from "@tauri-apps/api/window";

export function getAppWindow() {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export function runWindowAction(action: (window: NonNullable<ReturnType<typeof getAppWindow>>) => Promise<unknown>) {
  const appWindow = getAppWindow();
  if (!appWindow) return;
  void action(appWindow).catch(() => undefined);
}

export function minimizeWindow() {
  runWindowAction((window) => window.minimize());
}

export function toggleMaximizeWindow() {
  runWindowAction((window) => window.toggleMaximize());
}

export function closeWindow() {
  runWindowAction((window) => window.close());
}

export function startWindowDrag() {
  runWindowAction((window) => window.startDragging());
}

export function showAndFocusWindow() {
  runWindowAction(async (window) => {
    await window.show();
    await window.unminimize();
    await window.setFocus();
  });
}
