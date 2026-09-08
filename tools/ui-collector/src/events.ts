import { SECRET_NAMES } from "./sanitize.ts";
import type { ControlState, EventRecord, TargetDescription } from "./types.ts";
import { createId } from "./types.ts";

const INTERACTIVE =
  "button,a,input,select,textarea,summary,[role=button],[role=tab],[role=menuitem],[aria-expanded]";

function target(element: Element): TargetDescription {
  const id = SECRET_NAMES.test(element.id)
    ? undefined
    : element.id || undefined;
  const escaped = id ? CSS.escape(id) : undefined;
  return {
    tagName: element.tagName.toLowerCase(),
    id,
    role: element.getAttribute("role") || undefined,
    locator: escaped ? `#${escaped}` : element.tagName.toLowerCase(),
  };
}

function state(element: Element): ControlState {
  const form = element as
    HTMLInputElement | HTMLButtonElement | HTMLSelectElement;
  return {
    tagName: element.tagName.toLowerCase(),
    role: element.getAttribute("role") || undefined,

    disabled: "disabled" in form ? Boolean(form.disabled) : undefined,
    expanded:
      element.tagName === "DETAILS"
        ? element.hasAttribute("open")
        : element.hasAttribute("aria-expanded")
          ? element.getAttribute("aria-expanded") === "true"
          : undefined,
    checked:
      "checked" in form
        ? Boolean((form as HTMLInputElement).checked)
        : undefined,
    selected:
      "selected" in form
        ? Boolean((form as unknown as HTMLOptionElement).selected)
        : undefined,
    valuePresent: "value" in form,
  };
}

export class EventRecorder {
  private sequence = 0;
  private events: EventRecord[] = [];
  private readonly listeners: Array<() => void> = [];
  constructor(
    private readonly sessionId: string,
    private documentId: string,
    private readonly now = () => Date.now(),
    private readonly onEvent?: (event: EventRecord) => void,
  ) {}
  setDocument(documentId: string): void {
    if (documentId !== this.documentId) {
      this.events = [];
      this.sequence = 0;
    }
    this.documentId = documentId;
  }
  start(document: Document): void {
    this.stop();
    const add = (
      type: EventRecord["type"],
      eventName: string,
      handler: (event: Event) => Element | null,
    ) => {
      const listener = (event: Event) => {
        const element = handler(event);
        if (element) this.record(type, element);
      };
      document.addEventListener(eventName, listener, {
        capture: true,
        passive: true,
      });
      this.listeners.push(() =>
        document.removeEventListener(eventName, listener, true),
      );
    };
    add("click", "click", (e) =>
      e.target instanceof Element ? e.target : null,
    );
    add("focus", "focusin", (e) =>
      e.target instanceof Element ? e.target : null,
    );
    add("hover", "mouseover", (e) => {
      const element =
        e.target instanceof Element ? e.target.closest(INTERACTIVE) : null;
      const related = (e as MouseEvent).relatedTarget;
      if (
        element &&
        related &&
        "nodeType" in related &&
        element.contains(related as Node)
      )
        return null;
      return element;
    });
    add("change", "change", (e) =>
      e.target instanceof Element ? e.target : null,
    );
    add("submit", "submit", (e) =>
      e.target instanceof Element ? e.target : null,
    );
    add("disclosure", "toggle", (e) =>
      e.target instanceof Element ? e.target : null,
    );
    const navigation = () =>
      this.record("navigation", document.documentElement);
    window.addEventListener("popstate", navigation);
    window.addEventListener("hashchange", navigation);
    this.listeners.push(() => {
      window.removeEventListener("popstate", navigation);
      window.removeEventListener("hashchange", navigation);
    });
  }
  stop(): void {
    for (const remove of this.listeners.splice(0)) remove();
  }
  record(type: EventRecord["type"], element: Element): EventRecord {
    const event: EventRecord = {
      eventId: createId("event"),
      sessionId: this.sessionId,
      documentId: this.documentId,
      sequence: ++this.sequence,
      timestamp: this.now(),
      type,
      target: target(element),
      controlState: type === "navigation" ? undefined : state(element),
    };
    this.events.push(event);
    if (this.events.length > 2000)
      this.events.splice(0, this.events.length - 2000);
    this.onEvent?.(event);
    return event;
  }
  preceding(at: number, limit = 20): EventRecord[] {
    const count = Number.isFinite(limit)
      ? Math.max(0, Math.min(20, Math.floor(limit)))
      : 20;
    if (count === 0) return [];
    return this.events
      .filter(
        (event) => event.timestamp <= at && at - event.timestamp <= 10_000,
      )
      .slice(-count);
  }
  all(): EventRecord[] {
    return [...this.events];
  }
}
