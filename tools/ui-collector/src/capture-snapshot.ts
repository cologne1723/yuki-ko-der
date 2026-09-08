import { pageDictionaryNames } from "translation-core/page-dictionaries";
import {
  classifyCandidates,
  collectCandidates,
  isVisible,
} from "./detection.ts";
import { sanitizeClone } from "./sanitize.ts";
import type { DictionaryScope } from "./types.ts";
export function captureSnapshot(
  doc: Document,
  scopes: DictionaryScope[],
  visibility: Map<Element, boolean>,
  retryRoots: Set<Element>,
) {
  const { clone, redaction, originals, copies } = sanitizeClone(doc);
  const html = `<!doctype html>${clone.documentElement.outerHTML}`;
  const url = location.href;
  const title = clone.title;
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
  const scroll = { x: window.scrollX, y: window.scrollY };

  const nextVisibility = new Map(visibility);
  for (const [element, before] of nextVisibility) {
    if (!element.isConnected) {
      nextVisibility.delete(element);
      continue;
    }
    const after = isVisible(element);
    if (before !== after) {
      retryRoots.add(element.closest("button,[role=button]") ?? element);
      nextVisibility.set(element, after);
    }
  }
  const connectedRoots = [...retryRoots].filter(
    (root) => root.ownerDocument === doc && root.isConnected,
  );
  const scanRoots = connectedRoots.filter(
    (root) =>
      !connectedRoots.some((other) => other !== root && other.contains(root)),
  );
  if (scanRoots.includes(doc.documentElement)) nextVisibility.clear();
  const candidates = classifyCandidates(
    scanRoots.flatMap((root) => {
      const saved = copies.get(root) as Element | undefined;
      return saved?.isConnected
        ? collectCandidates(saved, originals, nextVisibility)
        : [];
    }),
    scopes,
    pageDictionaryNames(new URL(url).pathname),
    originals,
  );
  return {
    html,
    redaction,
    url,
    title,
    viewport,
    scroll,
    candidates,
    nextVisibility,
  };
}
