import type { JSDOM } from "jsdom";

/** JSDOM does not load srcdoc. Emulate its load lifecycle, not layout metrics. */
export function installStagingSrcdoc(
  dom: JSDOM,
  onDocument?: (doc: Document) => void,
) {
  const prototype = dom.window.HTMLIFrameElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "srcdoc")!;
  Object.defineProperty(prototype, "srcdoc", {
    ...descriptor,
    set(value: string) {
      descriptor.set!.call(this, value);
      if (!(this as HTMLIFrameElement).hasAttribute("data-review-math-stage"))
        return;
      queueMicrotask(() => {
        const frame = this as HTMLIFrameElement;
        if (!frame.isConnected) return;
        const doc = frame.contentDocument!;
        doc.open();
        doc.write(value);
        doc.close();
        onDocument?.(doc);
        frame.dispatchEvent(new dom.window.Event("load"));
      });
    },
  });
}
