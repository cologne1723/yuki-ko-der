import type { z } from "translation-core/validation";
import {
  persistState,
  recordingTabs,
  recoveryError,
  restoreState,
  sessionsByTab,
  stateDirty,
  tabErrors,
} from "./background-state.ts";
import {
  BUNDLE_CHANNEL,
  serveBundle,
  type BundlePort,
} from "./bundle-channel.ts";
import {
  acknowledged,
  backgroundCommandSchema,
  collectorReplySchema,
} from "./messages.ts";
import { storageRequest } from "./storage-gateway.ts";
import { IndexedDbStore } from "./storage.ts";
const store = new IndexedDbStore();
export {};

const api = globalThis.browser ?? globalThis.chrome;
async function send(
  tabId: number,
  type: string,
): Promise<z.infer<typeof collectorReplySchema>> {
  const response = await api.tabs.sendMessage(tabId, {
    type,
    sessionId: sessionsByTab.get(tabId),
  });
  // Even a failed durable save may have successfully stopped the controller.
  if (response?.ok === false && response.recording === false) {
    recordingTabs.delete(tabId);
    await persistState();
  }
  const result = acknowledged(collectorReplySchema, response);
  if (type !== "collector:capture" && typeof result.recording !== "boolean")
    throw new Error(
      "The collector returned an invalid recording state. Reload the yukicoder tab.",
    );
  return result;
}
async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await api.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0];
}
function allowed(url: string | undefined): boolean {
  try {
    const value = new URL(url ?? "");
    return value.protocol === "https:" && value.hostname === "yukicoder.me";
  } catch {
    return false;
  }
}

const handleMessage = async (
  input: unknown,
  sender: { id?: string; tab?: { id?: number; url?: string }; url?: string },
) => {
  const message = backgroundCommandSchema.parse(input);
  await ready;
  if (recoveryError) await restoreState();
  if (recoveryError) throw new Error(recoveryError);
  if (message.type === "storage:request")
    return storageRequest(store, send, message, sender);
  if (message.type === "popup:status") {
    const tab = await activeTab();
    if (!tab?.id || !allowed(tab.url))
      return { ok: true, allowed: false, recording: false };
    const result = await send(tab.id, "collector:status");
    const wasRecording = recordingTabs.has(tab.id);
    if (result.recording) recordingTabs.add(tab.id);
    else recordingTabs.delete(tab.id);
    if (wasRecording !== result.recording || stateDirty) await persistState();
    return {
      ok: true,
      allowed: true,
      tabId: tab.id,
      ...result,
      warning: tabErrors.get(tab.id),
    };
  }
  if (
    message.type === "popup:start" ||
    message.type === "popup:pause" ||
    message.type === "popup:capture"
  ) {
    const tab = await activeTab();
    if (!tab?.id || !allowed(tab.url))
      throw new Error("Select a yukicoder.me tab first");
    if (message.tabId !== undefined && message.tabId !== tab.id)
      throw new Error(
        "The selected tab changed. Check its status before trying again.",
      );
    const action =
      message.type === "popup:start"
        ? "collector:start"
        : message.type === "popup:pause"
          ? "collector:pause"
          : "collector:capture";
    const result = await send(tab.id, action);
    if (message.type === "popup:start" || message.type === "popup:pause") {
      if (result.recording) recordingTabs.add(tab.id);
      else recordingTabs.delete(tab.id);
      if (result?.sessionId) sessionsByTab.set(tab.id, result.sessionId);
      await persistState();
    }
    tabErrors.delete(tab.id);
    return { ok: true, ...result };
  }
  if (message.type === "popup:open-report") {
    const url = api.runtime.getURL("report.html");
    await api.tabs.create({ url });
    return { ok: true, opened: true };
  }
  return undefined;
};
api.runtime.onMessage.addListener(
  (
    message: Parameters<typeof handleMessage>[0],
    sender: Parameters<typeof handleMessage>[1],
    reply: (value: unknown) => void,
  ) => {
    void handleMessage(message, sender).then(reply, (error) =>
      reply({ ok: false, error: String(error) }),
    );
    return true;
  },
);
api.tabs?.onUpdated?.addListener(
  async (tabId: number, change: { status?: string }, tab: { url?: string }) => {
    try {
      await ready;
      if (recoveryError) await restoreState();
      if (recoveryError) throw new Error(recoveryError);
      if (
        change.status === "complete" &&
        recordingTabs.has(tabId) &&
        allowed(tab.url)
      ) {
        const result = await send(tabId, "collector:start");
        if (result.sessionId) sessionsByTab.set(tabId, result.sessionId);
        if (!result.recording) recordingTabs.delete(tabId);
        await persistState();
        tabErrors.delete(tabId);
      }
      if (change.status === "loading" && !allowed(tab.url)) {
        recordingTabs.delete(tabId);
        sessionsByTab.delete(tabId);
        await persistState();
      }
    } catch (error) {
      tabErrors.set(tabId, String(error));
    }
  },
);
api.tabs?.onRemoved?.addListener(async (tabId: number) => {
  await ready;
  recordingTabs.delete(tabId);
  sessionsByTab.delete(tabId);
  tabErrors.delete(tabId);
  await persistState().catch((error) =>
    console.error("Could not save closed-tab state", error),
  );
});
const ready = restoreState();
api.runtime.onConnect?.addListener((port: BundlePort) => {
  if (port.name === BUNDLE_CHANNEL)
    serveBundle(port, {
      extensionId: api.runtime.id,
      extensionUrl: api.runtime.getURL(""),
      ready,
      read: (id, cutoff) => store.bundle(id, cutoff),
    });
});
