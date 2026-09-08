import { pLimit } from "translation-core/concurrency";
import { z } from "translation-core/validation";
const api = globalThis.browser ?? globalThis.chrome;
export const recordingTabs = new Set<number>();
export const sessionsByTab = new Map<number, string>();
export const tabErrors = new Map<number, string>();
export let recoveryError: string | undefined;
const stateWrites = pLimit(1);
let stateVersion = 0;
export let stateDirty = false;

const savedStateSchema = z.looseObject({
  recordingTabs: z.array(z.number().int().nonnegative()).default([]),
  sessionsByTab: z
    .record(z.string().regex(/^\d+$/), z.string().min(1))
    .default({}),
});

export async function restoreState(): Promise<void> {
  try {
    const saved = await api.storage?.local?.get([
      "recordingTabs",
      "sessionsByTab",
    ]);
    const state = savedStateSchema.parse(saved ?? {});
    for (const tabId of state.recordingTabs) recordingTabs.add(tabId);
    for (const [tabId, sessionId] of Object.entries(state.sessionsByTab))
      sessionsByTab.set(Number(tabId), sessionId);
    recoveryError = undefined;
  } catch (error) {
    recoveryError = `Could not restore recording state: ${String(error)}`;
  }
}
export async function persistState(): Promise<void> {
  stateDirty = true;
  const version = ++stateVersion;
  await stateWrites(() =>
    api.storage.local.set({
      recordingTabs: [...recordingTabs],
      sessionsByTab: Object.fromEntries(sessionsByTab),
    }),
  );
  if (version === stateVersion) stateDirty = false;
}
