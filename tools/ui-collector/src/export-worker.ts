import { createZip } from "./export.ts";
const worker = globalThis as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (value: unknown, transfer?: Transferable[]) => void;
};
worker.onmessage = (event: MessageEvent) => {
  try {
    const output = createZip(event.data);
    worker.postMessage(output, [output.buffer as ArrayBuffer]);
  } catch (error) {
    worker.postMessage({ error: String(error) });
  }
};
