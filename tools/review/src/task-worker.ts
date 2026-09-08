import { parentPort, workerData } from "node:worker_threads";
import { runOperation } from "translation-audit/operations/run";
const controller = new AbortController();
parentPort!.on("message", (message) => {
  if (message?.type === "cancel") controller.abort(new Error("Task cancelled"));
});
try {
  const result = await runOperation(
    {
      ...workerData.context,
      signal: controller.signal,
      progress: (item: unknown) =>
        parentPort!.postMessage({ type: "progress", item }),
    },
    workerData.input,
  );
  parentPort!.postMessage(
    controller.signal.aborted
      ? { type: "cancelled" }
      : { type: "result", result },
  );
} catch (error) {
  parentPort!.postMessage({
    type: controller.signal.aborted ? "cancelled" : "failed",
    error: String(error),
  });
} finally {
  parentPort!.close();
}
