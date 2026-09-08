import { CollectorController } from "./collector.ts";
import type { CaptureOutcome, CollectorState, Reply } from "./messages.ts";
import { collectorCommandSchema } from "./messages.ts";

export {};

const api = globalThis.browser ?? globalThis.chrome;
const controller = new CollectorController(document);

const handleMessage = async (
  input: unknown,
): Promise<Partial<CollectorState> | CaptureOutcome | undefined> => {
  const message = collectorCommandSchema.parse(input);
  if (message.type === "collector:discard-session")
    return controller
      .discardSession(message.sessionId)
      .then(() => ({ recording: false }));
  if (message.type === "collector:start")
    return controller.start(message.sessionId).then((session) => ({
      recording: controller.recording,
      sessionId: session.sessionId,
    }));
  if (message.type === "collector:pause")
    return controller.pause().then(() => ({ recording: false }));
  if (message.type === "collector:capture") return controller.captureManually();
  if (message.type === "collector:status")
    return controller.counts().then((counts) => ({
      recording: controller.recording,
      sessionId: controller.sessionId,
      counts,
      lastFailure: controller.lastFailure,
      manualCapture: controller.manualCapture,
    }));
  return undefined;
};
api?.runtime?.onMessage?.addListener(
  (
    message: Parameters<typeof handleMessage>[0],
    _sender: unknown,
    reply: (value: Reply<Partial<CollectorState> | CaptureOutcome>) => void,
  ) => {
    Promise.resolve()
      .then(() => handleMessage(message))
      .then(
        (value) =>
          value === undefined
            ? reply({ ok: false, error: "Unknown collector request" })
            : reply({ ok: true, ...value }),
        (error) =>
          reply({
            ok: false,
            error: String(error),
            recording: controller.recording,
          }),
      );
    return true;
  },
);
