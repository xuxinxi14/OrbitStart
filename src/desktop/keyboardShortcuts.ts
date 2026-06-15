import { isEditableElement } from "./contextMenu";

interface KeyboardShortcutOptions {
  closeTransientUi: () => void;
  openCommandPalette: () => void;
  refreshResources: () => void | Promise<void>;
}

function isModified(event: KeyboardEvent) {
  return event.ctrlKey || event.metaKey;
}

function stopBrowserShortcut(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
}

export function installKeyboardShortcuts(options: KeyboardShortcutOptions) {
  const onKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const modified = isModified(event);

    if (key === "escape") {
      stopBrowserShortcut(event);
      options.closeTransientUi();
      return;
    }

    if (modified && key === "k") {
      stopBrowserShortcut(event);
      options.openCommandPalette();
      return;
    }

    if (key === "f5" || (modified && key === "r")) {
      stopBrowserShortcut(event);
      void options.refreshResources();
      return;
    }

    if (event.altKey && (key === "arrowleft" || key === "arrowright")) {
      stopBrowserShortcut(event);
      return;
    }

    if (modified && ["p", "s", "o"].includes(key)) {
      stopBrowserShortcut(event);
      return;
    }

    if (import.meta.env.PROD && (key === "f12" || (modified && event.shiftKey && ["i", "j", "c"].includes(key)))) {
      stopBrowserShortcut(event);
      return;
    }

    if (!isEditableElement(event.target) && modified && ["+", "-", "=", "0"].includes(key)) {
      stopBrowserShortcut(event);
    }
  };

  window.addEventListener("keydown", onKeyDown, { capture: true });
  return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
}
