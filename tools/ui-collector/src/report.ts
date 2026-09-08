import { RemoteStore } from "./remote-store.ts";
import { exportReport } from "./report-export.ts";
import { renderReport } from "./report-view.ts";

const api = globalThis.browser ?? globalThis.chrome;
const store = new RemoteStore();
const sessionSelect = document.getElementById("session") as HTMLSelectElement;
const report = document.getElementById("report")!;
const preview = document.getElementById("preview") as HTMLIFrameElement;
const message = document.getElementById("message")!;
const errorMessage =
  document.getElementById("error") ?? document.createElement("p");
errorMessage.id = "error";
errorMessage.setAttribute("role", "alert");
if (!errorMessage.isConnected) message.after(errorMessage);
const exportButton = document.getElementById("export") as HTMLButtonElement;
const deleteButton = document.getElementById("delete") as HTMLButtonElement;
const refreshButton = document.getElementById(
  "refresh",
) as HTMLButtonElement | null;
let selected = "";
let revision = 0;
let loading = false;
let available = false;
let busy: "export" | "delete" | undefined;

function controls(): void {
  exportButton.disabled = Boolean(busy) || loading || !available;
  deleteButton.disabled = Boolean(busy) || loading || !selected;
  sessionSelect.disabled = busy === "delete" || loading;
  if (refreshButton) refreshButton.disabled = Boolean(busy) || loading;
}

async function listSessions(): Promise<void> {
  loading = true;
  controls();
  try {
    const rows = await store.listSessions();
    sessionSelect.replaceChildren(
      ...rows.map((row) => {
        const option = document.createElement("option");
        option.value = row.sessionId;
        option.textContent = `${new Date(row.startedAt).toLocaleString()} — ${row.sessionId}`;
        return option;
      }),
    );
    if (rows.some((row) => row.sessionId === selected))
      sessionSelect.value = selected;
    selected = sessionSelect.value;
    await render();
  } catch (error) {
    errorMessage.textContent = String(error);
  } finally {
    loading = false;
    controls();
  }
}
async function render(): Promise<void> {
  const current = ++revision;
  loading = true;
  available = false;
  preview.srcdoc = "";
  message.textContent = "";
  errorMessage.textContent = "";
  report.textContent = "Loading…";
  controls();
  try {
    if (!selected) {
      report.textContent = "No recorded sessions.";
      return;
    }
    const origin = selected;
    const bundle = await store.bundle(origin);
    if (selected !== origin || current !== revision) return;
    renderReport(bundle, report, preview, message);
    available = true;
  } catch (error) {
    if (current === revision) {
      report.textContent = "Report unavailable. Refresh to try again.";
      errorMessage.textContent = String(error);
    }
  } finally {
    if (current === revision) {
      loading = false;
      controls();
    }
  }
}
async function action(
  kind: "export" | "delete",
  work: () => Promise<void>,
): Promise<void> {
  if (busy || loading || !selected) return;
  busy = kind;
  errorMessage.textContent = "";
  controls();
  try {
    await work();
  } catch (error) {
    errorMessage.textContent = String(error);
  } finally {
    busy = undefined;
    controls();
  }
}
exportButton.addEventListener("click", () => {
  void action("export", async () => {
    const origin = selected;
    const bundle = await store.bundle(origin);
    await exportReport(bundle);
  });
});
deleteButton.addEventListener("click", () => {
  if (
    busy ||
    loading ||
    !selected ||
    !confirm("Delete this collector session?")
  )
    return;
  const origin = selected;
  void action("delete", async () => {
    await store.deleteSession(origin);
    await listSessions();
  });
});
refreshButton?.addEventListener("click", () => {
  void listSessions();
});
sessionSelect.addEventListener("change", () => {
  if (loading || busy === "delete") return;
  selected = sessionSelect.value;
  void render();
});
void listSessions();
