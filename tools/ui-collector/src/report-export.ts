import type { ExportBundle } from "./types.ts";
const api = globalThis.browser ?? globalThis.chrome;
export async function exportReport(bundle: ExportBundle) {
  let worker: Worker | undefined;
  try {
    const bytes = await new Promise<Uint8Array<ArrayBuffer>>(
      (resolve, reject) => {
        worker = new Worker(api.runtime.getURL("src/export-worker.js"));
        worker.onmessage = (event) =>
          event.data?.error
            ? reject(new Error(String(event.data.error)))
            : resolve(event.data);
        worker.onerror = (event) => {
          event.preventDefault();
          reject(new Error(event.message || "Export worker failed."));
        };
        worker.onmessageerror = () =>
          reject(new Error("Export worker returned unreadable data."));
        worker.postMessage(bundle);
      },
    );
    const blob = new Blob([bytes], { type: "application/zip" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `collection-${bundle.session.sessionId}.zip`;
    try {
      link.click();
    } finally {
      URL.revokeObjectURL(link.href);
    }
  } finally {
    worker?.terminate();
  }
}
