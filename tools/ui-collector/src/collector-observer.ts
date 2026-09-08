import type { Capture } from "./types.ts";
export function observeCollector(
  doc: Document,
  scheduleScan: (reason: Capture["reason"], roots?: readonly Element[]) => void,
): () => void {
  const observer = new MutationObserver((records) => {
    const roots = records.map((record) => {
      const element =
        record.target.nodeType === 1
          ? (record.target as Element)
          : record.target.parentElement;
      // Head changes can replace stylesheets. Other records identify the
      // changed subtree; visibility probes also catch effects elsewhere.
      if (!element || element.closest("head")) return doc.documentElement;
      return element.closest("button,[role=button]") ?? element;
    });
    scheduleScan("mutation", roots);
  });
  observer.observe(doc.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  });
  const navigation = () => scheduleScan("navigation");
  window.addEventListener("popstate", navigation);
  window.addEventListener("hashchange", navigation);
  const navigationCleanup = () => {
    window.removeEventListener("popstate", navigation);
    window.removeEventListener("hashchange", navigation);
  };
  const interaction = (event: Event) => {
    const element =
      event.target instanceof Element ? event.target : doc.documentElement;
    scheduleScan("interaction", [
      element.closest("button,[role=button],details,select") ?? element,
    ]);
  };
  for (const type of [
    "click",
    "focusin",
    "mouseover",
    "change",
    "submit",
    "toggle",
  ])
    doc.addEventListener(type, interaction, {
      capture: true,
      passive: true,
    });
  const interactionCleanup = () => {
    for (const type of [
      "click",
      "focusin",
      "mouseover",
      "change",
      "submit",
      "toggle",
    ])
      doc.removeEventListener(type, interaction, true);
  };
  return () => {
    observer.disconnect();
    navigationCleanup();
    interactionCleanup();
  };
}
