import { listen } from "@tauri-apps/api/event";
import { installExternalOpenGuard } from "./externalOpen";
import { installKeyboardShortcuts } from "./keyboardShortcuts";
import { showAndFocusWindow } from "./windowControls";

interface DesktopShellOptions {
  closeTransientUi: () => void;
  focusSearch: () => void;
  openCommandPalette: () => void;
  openCommandBar: () => void;
  openSettings: () => void;
  openPanel: (panel: string) => void;
  refreshResources: () => void | Promise<void>;
  toggleSafeMode: () => void | Promise<void>;
  focusGroup: (groupId: string) => void;
}

function installDragGuard() {
  const onDragStart = (event: DragEvent) => {
    const target = event.target;
    if (target instanceof HTMLImageElement || (target instanceof HTMLElement && target.closest("a"))) {
      event.preventDefault();
    }
  };
  window.addEventListener("dragstart", onDragStart, { capture: true });
  return () => window.removeEventListener("dragstart", onDragStart, { capture: true });
}

function installTauriEventBridge(options: DesktopShellOptions) {
  const disposers: Array<() => void> = [];
  const attach = async () => {
    try {
      disposers.push(await listen("orbit://focus-search", () => {
        showAndFocusWindow();
        options.focusSearch();
      }));
      disposers.push(await listen("orbit://open-command-bar", () => {
        showAndFocusWindow();
        options.openCommandBar();
      }));
      disposers.push(await listen("orbit://open-settings", () => {
        showAndFocusWindow();
        options.openSettings();
      }));
      disposers.push(await listen("orbit://open-panel", (event) => {
        showAndFocusWindow();
        options.openPanel(event.payload as string);
      }));
      disposers.push(await listen("orbit://refresh-resources", () => {
        void options.refreshResources();
      }));
      disposers.push(await listen("orbit://toggle-safe-mode", () => {
        void options.toggleSafeMode();
      }));
      disposers.push(await listen("orbit://focus-group", (event) => {
        showAndFocusWindow();
        options.focusGroup(event.payload as string);
      }));
    } catch {
      // Browser preview does not provide Tauri's event bridge.
    }
  };
  void attach();
  return () => {
    disposers.splice(0).forEach((dispose) => dispose());
  };
}

export function installDesktopShell(options: DesktopShellOptions) {
  const disposers = [
    installKeyboardShortcuts({
      closeTransientUi: options.closeTransientUi,
      openCommandPalette: options.openCommandPalette,
      refreshResources: options.refreshResources
    }),
    installExternalOpenGuard(),
    installDragGuard(),
    installTauriEventBridge(options)
  ];

  return () => disposers.forEach((dispose) => dispose());
}
