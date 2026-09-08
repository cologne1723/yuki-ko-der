import type { ExportBundle } from "./types.ts";

export const BUNDLE_CHANNEL = "storage:bundle";
// Even JSON escaping and multibyte text keep each message well below 64 MiB.
export const BUNDLE_CHUNK_LENGTH = 256 * 1024;
export interface BundlePort {
  name: string;
  sender?: { id?: string; url?: string };
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(listener: (message: any) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

export function serveBundle(
  port: BundlePort,
  options: {
    extensionId: string;
    extensionUrl: string;
    ready: Promise<void>;
    read: (id: string, cutoff?: number) => Promise<ExportBundle>;
  },
): void {
  let opened = false;
  let closed = false;
  let serialized: string | undefined;
  let offset = 0;
  port.onDisconnect.addListener(() => {
    closed = true;
    serialized = undefined;
  });
  const next = () => {
    if (closed || serialized === undefined) return;
    const data = serialized.slice(offset, offset + BUNDLE_CHUNK_LENGTH);
    offset += data.length;
    const done = offset === serialized.length;
    if (done) serialized = undefined;
    port.postMessage({ type: "chunk", data, done });
  };
  port.onMessage.addListener((message) => {
    void (async () => {
      if (closed) return;
      if (
        port.sender?.id !== options.extensionId ||
        !port.sender.url?.startsWith(options.extensionUrl)
      )
        throw new Error("Bundle requests require a collector extension page");
      if (message?.type === "next" && opened) {
        next();
        return;
      }
      if (
        message?.type !== "open" ||
        opened ||
        typeof message.sessionId !== "string" ||
        !message.sessionId ||
        (message.cutoff !== undefined &&
          (!Number.isSafeInteger(message.cutoff) || message.cutoff < 0))
      )
        throw new Error("Invalid bundle request");
      opened = true;
      await options.ready;
      if (closed) return;
      // Read exactly once. Captures committed during transfer cannot change it.
      const bundle = await options.read(message.sessionId, message.cutoff);
      if (closed) return;
      serialized = JSON.stringify(bundle);
      next();
    })().catch((error) => {
      if (!closed) {
        serialized = undefined;
        try {
          port.postMessage({ type: "error", error: String(error) });
        } catch {
          // The peer can disappear before onDisconnect is delivered.
          closed = true;
        }
      }
    });
  });
}

export function receiveBundle(
  runtime: {
    connect(options: { name: string }): BundlePort;
    lastError?: { message?: string };
  },
  id: string,
  cutoff?: number,
): Promise<ExportBundle> {
  return new Promise((resolve, reject) => {
    const port = runtime.connect({ name: BUNDLE_CHANNEL });
    const parts: string[] = [];
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      parts.length = 0;
      reject(error);
      port.disconnect();
    };
    port.onDisconnect.addListener(() => {
      const detail = runtime.lastError?.message;
      fail(
        new Error(detail ?? "Collector disconnected during bundle transfer"),
      );
    });
    port.onMessage.addListener((message) => {
      if (settled) return;
      try {
        if (message?.type === "error") throw new Error(message.error);
        if (message?.type !== "chunk" || typeof message.data !== "string")
          throw new Error("Invalid bundle response");
        parts.push(message.data);
        if (message.done) {
          const bundle = JSON.parse(parts.join("")) as ExportBundle;
          settled = true;
          parts.length = 0;
          resolve(bundle);
          port.disconnect();
        } else port.postMessage({ type: "next" });
      } catch (error) {
        fail(error);
      }
    });
    // Do not put undefined optional arguments in arrays: Chrome sends null.
    try {
      port.postMessage({
        type: "open",
        sessionId: id,
        ...(cutoff === undefined ? {} : { cutoff }),
      });
    } catch (error) {
      fail(error);
    }
  });
}
