import type { PopupStatus } from "./messages.ts";
const button = (id: string) => document.getElementById(id) as HTMLButtonElement;
const status = document.getElementById("status")!;
const counts = document.getElementById("counts")!;
const message = document.getElementById("message")!;
export function renderPopup(
  state: PopupStatus | undefined,
  busy: boolean,
  refreshing: boolean,
  feedback: string,
  statusError: string,
): void {
  status.textContent = !state
    ? "Status unavailable"
    : !state.allowed
      ? "Open a yukicoder.me tab"
      : state.recording
        ? "Recording"
        : "Paused";
  counts.textContent = state?.counts
    ? `Saved ${state.counts.saved}; pending ${state.counts.pending}; failed ${state.counts.failed}`
    : "";
  message.textContent =
    feedback ||
    statusError ||
    state?.warning ||
    (state?.lastFailure ? `Last capture error: ${state.lastFailure}` : "");
  const unavailable = busy || refreshing || !state?.allowed;
  button("start").disabled = unavailable || Boolean(state?.recording);
  button("pause").disabled = unavailable || !state?.recording;
  button("capture").disabled = unavailable || !state?.recording;
  button("report").disabled = busy;
}
