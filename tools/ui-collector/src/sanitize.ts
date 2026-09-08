import createDOMPurify from "dompurify";
import { sanitizeSnapshotCss } from "translation-core/snapshot-css";
import { sha256 } from "./hash.ts";
import type { RedactionSummary } from "./types.ts";

const EXECUTABLE_ATTRIBUTES = /^on[a-z]+$/iu;
export const SECRET_NAMES =
  /(pass(word)?|token|secret|auth|csrf|api[-_]?key|cookie)/iu;
const EXTERNAL_ATTRIBUTES = new Set([
  "src",
  "srcset",
  "imagesrcset",
  "href",
  "xlink:href",
  "action",
  "poster",
  "formaction",
  "background",
  "manifest",
  "ping",
  "codebase",
  "archive",
]);
const SNAPSHOT_POLICY =
  "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

export interface SanitizedSnapshot {
  html: string;
  hash: string;
  bytes: number;
  redaction: RedactionSummary;
  clone: Document;
}

export function sanitizeClone(document: Document): {
  clone: Document;
  redaction: RedactionSummary;
  originals: WeakMap<Node, Node>;
  copies: WeakMap<Node, Node>;
} {
  const clone = document.cloneNode(true) as Document;
  const originals = new WeakMap<Node, Node>();
  const copies = new WeakMap<Node, Node>();
  const pair = (live: Node, saved: Node) => {
    originals.set(saved, live);
    copies.set(live, saved);
    for (let i = 0; i < live.childNodes.length; i++)
      pair(live.childNodes[i], saved.childNodes[i]);
  };
  pair(document, clone);
  const redaction: RedactionSummary = {
    removedElements: 0,
    removedAttributes: 0,
    redactedFields: 0,
    removedExternalLoads: 0,
  };
  const originalElements = [...document.querySelectorAll("*")];
  const elements = [...clone.querySelectorAll("*")];
  for (const [index, element] of elements.entries()) {
    if (!element.isConnected) continue;
    const original = originalElements[index]!;
    element.setAttribute("data-collector-node", String(index));
    const tag = element.tagName.toLowerCase();
    const secretField = ["name", "id", "autocomplete"].some((name) =>
      SECRET_NAMES.test(element.getAttribute(name) ?? ""),
    );
    if (
      [
        "script",
        "noscript",
        "template",
        "iframe",
        "frame",
        "object",
        "embed",
        "portal",
        "base",
        "link",
      ].includes(tag) ||
      (tag === "meta" && (secretField || element.hasAttribute("http-equiv"))) ||
      (tag === "output" && secretField) ||
      (tag === "input" &&
        element.getAttribute("type")?.toLowerCase() === "password")
    ) {
      element.remove();
      redaction.removedElements += 1;
      if (secretField || tag === "input") redaction.redactedFields += 1;
      continue;
    }
    for (const attr of [...element.attributes]) {
      const name = attr.name.toLowerCase();
      if (EXECUTABLE_ATTRIBUTES.test(name) || name === "srcdoc") {
        element.removeAttribute(attr.name);
        redaction.removedAttributes += 1;
        continue;
      }
      if (EXTERNAL_ATTRIBUTES.has(name)) {
        element.removeAttribute(attr.name);
        redaction.removedExternalLoads += 1;
        continue;
      }
      if (SECRET_NAMES.test(name)) {
        element.removeAttribute(attr.name);
        redaction.removedAttributes += 1;
      }
      if (
        ["name", "id", "autocomplete"].includes(name) &&
        SECRET_NAMES.test(attr.value)
      ) {
        element.removeAttribute(attr.name);
        redaction.removedAttributes += 1;
      }
    }
    if (tag === "input") {
      const input = element as HTMLInputElement;
      const originalInput = original as HTMLInputElement;
      if (["button", "submit", "reset"].includes(originalInput.type)) {
        input.setAttribute("value", originalInput.value);
      } else if (["checkbox", "radio"].includes(originalInput.type)) {
        input.toggleAttribute("checked", originalInput.checked);
        input.removeAttribute("value");
      } else {
        input.value = "";
        input.removeAttribute("value");
        redaction.redactedFields += 1;
      }
    }
    if (tag === "textarea") {
      (element as HTMLTextAreaElement).value = "";
      element.removeAttribute("value");
      element.textContent = "";
      redaction.redactedFields += 1;
    }
    if (tag === "option") {
      element.toggleAttribute(
        "selected",
        (original as HTMLOptionElement).selected,
      );
    }
    if (
      element.hasAttribute("contenteditable") &&
      element.getAttribute("contenteditable")?.toLowerCase() !== "false"
    ) {
      element.removeAttribute("value");
      element.textContent = "";
      redaction.redactedFields += 1;
    }
    if (element.hasAttribute("style")) {
      const style = element.getAttribute("style") ?? "";
      const safe = sanitizeSnapshotCss(style, true);
      element.setAttribute("style", safe);
    }
    if (tag === "style")
      element.textContent = sanitizeSnapshotCss(element.textContent ?? "");
  }
  const view = document.defaultView;
  if (!view) throw new Error("Snapshot capture requires a live document");
  createDOMPurify(view).sanitize(clone.documentElement, {
    IN_PLACE: true,
    WHOLE_DOCUMENT: true,
    ADD_ATTR: ["data-collector-node", "contenteditable"],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "svg", "math"],
    FORBID_ATTR: ["src", "srcset", "href", "action", "poster", "srcdoc"],
  });
  const head = clone.head ?? clone.createElement("head");
  if (!head.parentNode) clone.documentElement.prepend(head);
  const policy = clone.createElement("meta");
  policy.setAttribute("http-equiv", "Content-Security-Policy");
  policy.setAttribute("content", SNAPSHOT_POLICY);
  head.prepend(policy);
  return { clone, redaction, originals, copies };
}

export async function serializeSanitized(
  document: Document,
): Promise<SanitizedSnapshot> {
  const { clone, redaction } = sanitizeClone(document);
  const html = `<!doctype html>${clone.documentElement?.outerHTML ?? ""}`;
  const bytes = new TextEncoder().encode(html).byteLength;
  return { html, hash: await sha256(html), bytes, redaction, clone };
}
