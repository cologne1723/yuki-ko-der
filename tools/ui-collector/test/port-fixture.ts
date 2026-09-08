import type { BundlePort } from "../src/bundle-channel.ts";

// Chrome JSON serialization, asynchronous delivery, disconnects and a real
// message-size boundary; no structured-clone shortcut around the wire format.
export function portPair(
  onSend: (message: any, bytes: number) => void = () => {},
) {
  let closed = false;
  const messages: Array<Array<(message: any) => void>> = [[], []];
  const disconnects: Array<Array<() => void>> = [[], []];
  const ports = [0, 1].map((side): BundlePort => ({
    name: "storage:bundle",
    postMessage(message) {
      if (closed) throw new Error("Port disconnected");
      const text = JSON.stringify(message);
      const bytes = new TextEncoder().encode(text).length;
      if (bytes > 64 * 1024 * 1024)
        throw new Error("Chrome message limit exceeded");
      onSend(message, bytes);
      queueMicrotask(() => {
        if (!closed)
          for (const listener of messages[1 - side]) listener(JSON.parse(text));
      });
    },
    disconnect() {
      if (closed) return;
      closed = true;
      queueMicrotask(() =>
        disconnects.flat().forEach((listener) => listener()),
      );
    },
    onMessage: { addListener: (listener) => messages[side].push(listener) },
    onDisconnect: {
      addListener: (listener) => disconnects[side].push(listener),
    },
  }));
  return { client: ports[0], server: ports[1] };
}
