import { launchTarget } from "../lib/native";

function anchorFrom(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest<HTMLAnchorElement>("a[href]");
}

export function installExternalOpenGuard() {
  const onClick = (event: MouseEvent) => {
    const anchor = anchorFrom(event.target);
    if (!anchor) return;
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#")) return;

    event.preventDefault();
    event.stopPropagation();
    void launchTarget(anchor.href).catch(() => undefined);
  };

  window.addEventListener("click", onClick, { capture: true });
  return () => window.removeEventListener("click", onClick, { capture: true });
}
