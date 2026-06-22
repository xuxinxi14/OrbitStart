export type ContextMenuKind = "resource" | "blank" | "edit" | "group";
export type EditMenuCommand = "cut" | "copy" | "paste" | "select-all";

export interface ContextMenuState {
  kind: ContextMenuKind;
  x: number;
  y: number;
  resourceId?: string;
  groupId?: string;
}

export function isEditableElement(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, [contenteditable='true'], [contenteditable='']"));
}

export function editableElementFrom(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest("input, textarea, [contenteditable='true'], [contenteditable='']");
}

export function resourceIdFromTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest<HTMLElement>("[data-resource-id]")?.dataset.resourceId ?? null;
}

export function groupIdFromTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest<HTMLElement>("[data-group-id]")?.dataset.groupId ?? null;
}

export function clampedMenuPosition(clientX: number, clientY: number, width = 240, height = 320) {
  const margin = 10;
  const x = Math.min(Math.max(margin, clientX), Math.max(margin, window.innerWidth - width - margin));
  const y = Math.min(Math.max(margin, clientY), Math.max(margin, window.innerHeight - height - margin));
  return { x, y };
}

type MenuPointerEvent = Pick<MouseEvent, "clientX" | "clientY" | "target">;

export function contextMenuFromEvent(event: MenuPointerEvent, fallback: ContextMenuKind = "blank"): ContextMenuState {
  const resourceId = resourceIdFromTarget(event.target);
  const groupId = groupIdFromTarget(event.target);
  const position = clampedMenuPosition(event.clientX, event.clientY, resourceId ? 246 : 230, isEditableElement(event.target) ? 172 : 318);
  if (isEditableElement(event.target)) return { kind: "edit", ...position };
  if (resourceId) return { kind: "resource", resourceId, ...position };
  if (groupId) return { kind: "group", groupId, ...position };
  return { kind: fallback, ...position };
}

function replaceSelection(target: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? target.value.length;
  target.setRangeText(value, start, end, "end");
  target.dispatchEvent(new Event("input", { bubbles: true }));
}

export async function runEditMenuCommand(command: EditMenuCommand, target: HTMLElement | null) {
  const editable = editableElementFrom(target);
  if (!editable) return;
  editable.focus();

  if (command === "select-all") {
    if (editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement) {
      editable.select();
    } else {
      document.execCommand("selectAll");
    }
    return;
  }

  if (command === "paste") {
    try {
      const text = await navigator.clipboard.readText();
      if (editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement) {
        replaceSelection(editable, text);
      } else {
        document.execCommand("insertText", false, text);
      }
    } catch {
      document.execCommand("paste");
    }
    return;
  }

  document.execCommand(command);
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    textArea.remove();
  }
}
