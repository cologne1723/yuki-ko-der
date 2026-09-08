import { z } from "translation-core/validation";
import {
  acknowledged,
  collectorReplySchema,
  popupStatusSchema,
  type PopupStatus,
} from "./messages.ts";
import { renderPopup } from "./popup-view.ts";

export {};

const api = globalThis.browser ?? globalThis.chrome;
const button = (id: string) => document.getElementById(id) as HTMLButtonElement;
let state: PopupStatus | undefined;
let busy = false;
let refreshing = false;
let feedback = "";
let statusError = "";
let queued:
  { requestId: string; tabId?: number; sessionId?: string } | undefined;

function render() {
  renderPopup(state, busy, refreshing, feedback, statusError);
}
async function request<T extends z.ZodType>(
  schema: T,
  type: string,
  tabId?: number,
): Promise<z.infer<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      api.runtime.sendMessage({ type, tabId }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "The collector has not responded. The action may still finish; check the status before retrying.",
              ),
            ),
          30_000,
        );
      }),
    ]);
    return acknowledged(schema, result);
  } finally {
    clearTimeout(timer);
  }
}
async function refresh(): Promise<void> {
  if (refreshing || busy) return;
  refreshing = true;
  render();
  try {
    const result = await request(popupStatusSchema, "popup:status");
    if (
      typeof result.allowed !== "boolean" ||
      typeof result.recording !== "boolean" ||
      (result.allowed && !Number.isSafeInteger(result.tabId))
    ) {
      throw new Error(
        "The collector returned an invalid status. Reload the yukicoder tab.",
      );
    }
    state = result;
    if (queued) {
      const completion = result.manualCapture;
      if (
        result.tabId !== queued.tabId ||
        result.sessionId !== queued.sessionId
      ) {
        feedback =
          "The page or session changed. Check the report for the queued capture.";
        queued = undefined;
      } else if (completion?.requestId === queued.requestId) {
        feedback =
          completion.outcome === "saved"
            ? "Capture saved."
            : completion.outcome === "not-recording"
              ? "Recording paused before the queued capture ran."
              : `Capture failed: ${completion.error ?? "Could not save the capture."}`;
        queued = undefined;
      }
    }
    statusError = "";
  } catch (error) {
    state = undefined;
    statusError = String(error);
  } finally {
    refreshing = false;
    render();
  }
}
async function act(type: string): Promise<void> {
  if (busy || (type !== "popup:open-report" && (refreshing || !state?.allowed)))
    return;
  const tabId = state?.tabId;
  busy = true;
  feedback = "";
  queued = undefined;
  render();
  try {
    const result = await request(collectorReplySchema, type, tabId);
    if (type === "popup:capture") {
      if (result.outcome === "failed") throw new Error(result.error);
      if (result.outcome === "not-recording")
        throw new Error(
          "Recording is paused. Start recording before capturing.",
        );
      if (result.outcome !== "saved" && result.outcome !== "queued")
        throw new Error("The capture was not acknowledged.");
      if (result.outcome === "queued") {
        if (typeof result.requestId !== "string" || !result.requestId)
          throw new Error("The queued capture was not acknowledged.");
        queued = {
          requestId: result.requestId,
          tabId,
          sessionId: state?.sessionId,
        };
      }
      feedback =
        result.outcome === "saved"
          ? "Capture saved."
          : "Capture queued; waiting for it to be saved.";
    }
  } catch (error) {
    feedback = String(error);
  } finally {
    busy = false;
    await refresh();
  }
}
for (const [id, type] of [
  ["start", "popup:start"],
  ["pause", "popup:pause"],
  ["capture", "popup:capture"],
  ["report", "popup:open-report"],
])
  button(id).onclick = () => {
    void act(type);
  };
void refresh();
const timer = window.setInterval(() => {
  void refresh();
}, 1_000);
window.addEventListener("pagehide", () => window.clearInterval(timer), {
  once: true,
});
