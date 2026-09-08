import {
  persistState,
  recordingTabs,
  sessionsByTab,
  tabErrors,
} from "./background-state.ts";
import { collectorVersion, dictionaryIdentity } from "./dictionary.ts";
import {
  parseStorageRequest,
  sessionSchema,
  type StorageRequest,
} from "./storage-contracts.ts";
import type { IndexedDbStore } from "./storage.ts";
const api = globalThis.browser ?? globalThis.chrome;
const allowed = (url?: string) => {
  try {
    const parsed = new URL(url ?? "");
    return parsed.protocol === "https:" && parsed.hostname === "yukicoder.me";
  } catch {
    return false;
  }
};
export async function storageRequest(
  store: IndexedDbStore,
  send: (tabId: number, type: string) => Promise<unknown>,
  input: unknown,
  sender: { id?: string; tab?: { id?: number; url?: string }; url?: string },
) {
  let claimedTab: number | undefined;
  let claimedSession: string | undefined;
  let committed = false;
  try {
    if (sender.id !== api.runtime.id)
      throw new Error("Invalid collector sender");
    const message = parseStorageRequest(input);
    const op = message.operation;
    const extensionPage = sender.url?.startsWith(api.runtime.getURL(""));
    if (op === "rotateSession" && extensionPage)
      throw new Error("Dictionary rotation requires the owning content tab");
    const latestSession = async (id: string) => {
      const seen = new Set<string>();
      let current = await store.getSession(id);
      while (current?.successorSessionId) {
        if (seen.has(current.sessionId))
          throw new Error("Invalid successor cycle");
        seen.add(current.sessionId);
        current = await store.getSession(current.successorSessionId);
      }
      return current?.sessionId;
    };

    if (!extensionPage) {
      const tabId = sender.tab?.id;
      if (
        tabId === undefined ||
        !allowed(sender.tab?.url) ||
        !allowed(sender.url) ||
        ["deleteSession", "listSessions"].includes(op)
      )
        throw new Error("Storage request is not from a supported tab");
      const id =
        op === "createSession" || op === "updateSession"
          ? message.args[0]?.sessionId
          : message.args[0];
      if (typeof id !== "string" || !id)
        throw new Error("Invalid session identity");
      const owner = sessionsByTab.get(tabId);
      if (owner) {
        const latest = await latestSession(owner);
        if (latest && latest !== owner) {
          sessionsByTab.set(tabId, latest);
          recordingTabs.delete(tabId);
          await persistState();
        }
      }
      if (op === "createSession") {
        if (sessionsByTab.has(tabId) && sessionsByTab.get(tabId) !== id)
          throw new Error("Tab already owns a session");
        if (
          [...sessionsByTab].some(
            ([owner, session]) => owner !== tabId && session === id,
          )
        )
          throw new Error("Session belongs to another tab");
        if (!sessionsByTab.has(tabId)) {
          // Reserve ownership before any await so concurrent tabs cannot claim it.
          sessionsByTab.set(tabId, id);
          claimedTab = tabId;
          claimedSession = id;
          if (await store.getSession(id))
            throw new Error("Existing session cannot be claimed by a new tab");
        }
      } else if (
        sessionsByTab.get(tabId) !== id &&
        !(
          sessionsByTab.has(tabId) &&
          ["getSession", "rotateSession"].includes(op) &&
          (await latestSession(id)) === sessionsByTab.get(tabId)
        )
      )
        throw new Error("Session does not belong to this tab");
      if (op === "rotateSession") {
        recordingTabs.delete(tabId);
        await persistState();
        const predecessor = await store.getSession(id);
        if (!predecessor) throw new Error("Unknown predecessor session");
        message.args[1] = {
          ...message.args[1],
          dictionary: dictionaryIdentity,
          collectorVersion,
          settings: predecessor.settings,
        };
      }
    }
    if (op === "deleteSession") {
      for (const [tabId, id] of sessionsByTab)
        if (id === message.args[0]) {
          // Revoking ownership also prevents further writes if the old tab is gone.
          await send(tabId, "collector:discard-session").catch((error) => {
            tabErrors.set(tabId, String(error));
          });
          recordingTabs.delete(tabId);
          sessionsByTab.delete(tabId);
        }
      await persistState();
    }
    const value = await executeStorageRequest(store, message);
    committed = true;
    if (op === "rotateSession" && sender.tab?.id !== undefined) {
      sessionsByTab.set(sender.tab.id, sessionSchema.parse(value).sessionId);
      recordingTabs.delete(sender.tab.id);
      await persistState();
    }

    if (op === "updateSession" && message.args[0]?.status !== "recording") {
      for (const [tabId, id] of sessionsByTab)
        if (id === message.args[0]?.sessionId) recordingTabs.delete(tabId);
      await persistState();
    }
    if (claimedTab !== undefined) await persistState();
    return { ok: true, value };
  } catch (error) {
    if (
      claimedTab !== undefined &&
      !committed &&
      sessionsByTab.get(claimedTab) === claimedSession
    )
      sessionsByTab.delete(claimedTab);
    return {
      ok: false,
      error: String(error),
      name: error instanceof Error ? error.name : "Error",
    };
  }
}

function executeStorageRequest(store: IndexedDbStore, request: StorageRequest) {
  switch (request.operation) {
    case "createSession":
      return store.createSession(...request.args);
    case "rotateSession":
      return store.rotateSession(...request.args);
    case "getSession":
      return store.getSession(...request.args);
    case "updateSession":
      return store.updateSession(...request.args);
    case "stageCapture":
      return store.stageCapture(...request.args);
    case "commitBatch":
      return store.commitBatch(...request.args);
    case "retryPending":
      return store.retryPending(...request.args);
    case "counts":
      return store.counts(...request.args);
    case "locations":
      return store.locations(...request.args);
    case "deleteSession":
      return store.deleteSession(...request.args);
    case "listSessions":
      return store.listSessions(...request.args);
  }
}
