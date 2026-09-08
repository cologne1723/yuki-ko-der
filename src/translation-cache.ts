import { pLimit } from "translation-core/concurrency";
import { parseProblemCatalog } from "translation-core/problem-catalog";

export const CACHE_BUDGET = 8 * 1024 * 1024;
const META = "translation-cache:metadata:v1";
const AUTHORITY = "translation-cache:authority:v1";
const BODY = "problem-translation-html:ko:";
const CATALOG = "problem-catalog:ko:";
export interface CacheStorage {
  get(key: string | null): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}
interface Authority {
  catalog?: Record<string, string>;
  removed: Record<string, true>;
}
const isCache = (key: string) =>
  key.startsWith(BODY) || key.startsWith(CATALOG);
const bytes = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

// One background-owned queue covers migration, reads (LRU touches), writes and
// removals. Accounting is rebuilt from actual values rather than trusted blindly.
export function createTranslationCache(
  storage: CacheStorage,
  budget = CACHE_BUDGET,
) {
  const queue = pLimit(1);
  let clock = 0;
  function serial<T>(work: () => Promise<T>): Promise<T> {
    return queue(work);
  }
  async function snapshot() {
    const all = await storage.get(null);
    const values = Object.fromEntries(
      Object.entries(all).filter(([key]) => isCache(key)),
    );
    const raw = all[META] as { access?: Record<string, number> } | undefined;
    const access: Record<string, number> = {};
    for (const key of Object.keys(values)) {
      access[key] = Number.isSafeInteger(raw?.access?.[key])
        ? raw!.access![key]
        : 0;
      clock = Math.max(clock, access[key]);
    }
    const rawAuthority = all[AUTHORITY] as Authority | undefined;
    const authority: Authority = {
      catalog: rawAuthority?.catalog,
      removed: { ...rawAuthority?.removed },
    };
    return { values, access, authority };
  }
  type State = Awaited<ReturnType<typeof snapshot>>;
  const metadata = (state: State) => ({ access: state.access });
  const size = (state: State) =>
    bytes({
      ...state.values,
      [META]: metadata(state),
      [AUTHORITY]: state.authority,
    });
  async function evict(state: State, protect?: string) {
    const candidates = Object.keys(state.values)
      .filter(
        (key) =>
          key !== protect &&
          !(protect?.startsWith(BODY) && key.startsWith(CATALOG)),
      )
      .sort(
        (a, b) =>
          Number(a.startsWith(CATALOG)) - Number(b.startsWith(CATALOG)) ||
          state.access[a] - state.access[b] ||
          a.localeCompare(b),
      );
    const key = candidates[0];
    if (!key) return false;
    await storage.remove(key);
    delete state.values[key];
    delete state.access[key];
    return true;
  }
  async function trim(state: State, protect?: string) {
    while (size(state) > budget && (await evict(state, protect))) {
      /* bounded by entry count */
    }
  }
  async function persist(
    state: State,
    changes: Record<string, unknown>,
    protect?: string,
  ) {
    await trim(state, protect);
    for (;;) {
      try {
        await storage.set({ ...changes, [META]: metadata(state) });
        return;
      } catch (error) {
        if (
          !/quota|QUOTA_BYTES|storage.*full/i.test(String(error)) ||
          !(await evict(state, protect))
        )
          throw error;
      }
    }
  }
  function allowed(state: State, key: string, hash?: string) {
    const no = key.slice(BODY.length);
    return (
      !state.authority.removed[no] &&
      (!state.authority.catalog ||
        (state.authority.catalog[no] !== undefined &&
          (hash === undefined || state.authority.catalog[no] === hash)))
    );
  }
  async function invalidate(state: State) {
    for (const key of Object.keys(state.values)) {
      let valid = true;
      if (key.startsWith(BODY)) valid = allowed(state, key);
      else if (state.authority.catalog) {
        try {
          const entries = parseProblemCatalog(state.values[key]).entries;
          valid =
            entries.length === Object.keys(state.authority.catalog).length &&
            entries.every(
              (entry) =>
                state.authority.catalog![entry.problemNo] === entry.htmlSha256,
            );
        } catch {
          valid = false;
        }
      }
      if (valid) continue;
      await storage.remove(key);
      delete state.values[key];
      delete state.access[key];
    }
  }
  return {
    get: (key: string) =>
      serial(async () => {
        if (!isCache(key)) throw new Error("Unsupported translation cache key");
        const state = await snapshot();
        await invalidate(state);
        if (state.values[key] !== undefined) state.access[key] = ++clock;
        await trim(state);
        await persist(state, {});
        return { [key]: state.values[key] };
      }),
    set: (values: Record<string, unknown>) =>
      serial(async () => {
        const entries = Object.entries(values);
        if (entries.length !== 1 || !isCache(entries[0][0]))
          throw new Error("Expected one translation cache entry");
        const [key, value] = entries[0];
        const state = await snapshot();
        if (key.startsWith(CATALOG)) {
          const catalog = parseProblemCatalog(value);
          await invalidate(state);
          state.authority.catalog = Object.fromEntries(
            catalog.entries.map((e) => [String(e.problemNo), e.htmlSha256]),
          );
          // A fresh catalog may reintroduce a previously removed problem. The old
          // body is already gone; only verified network bytes can repopulate it.
          for (const no of Object.keys(state.authority.catalog))
            delete state.authority.removed[no];
          await persist(state, { [AUTHORITY]: state.authority });
          await invalidate(state);
        } else {
          if (typeof value !== "string")
            throw new Error("Problem cache body must be text");
          const no = key.slice(BODY.length);
          if (state.authority.removed[no]) return;
          const digest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(value),
          );
          const hash = Array.from(new Uint8Array(digest), (byte) =>
            byte.toString(16).padStart(2, "0"),
          ).join("");
          if (state.authority.catalog && state.authority.catalog[no] !== hash)
            return;
          delete state.authority.removed[no];
          await persist(state, { [AUTHORITY]: state.authority });
        }
        // An oversized response remains available to the online caller, but must
        // not leave an older value looking like the newly downloaded response.
        if (
          bytes({
            [key]: value,
            [META]: { access: { [key]: clock + 1 } },
            [AUTHORITY]: state.authority,
          }) > budget
        ) {
          await storage.remove(key);
          delete state.values[key];
          delete state.access[key];
          await persist(state, {});
          return;
        }
        if (key.startsWith(BODY)) {
          const retained = Object.fromEntries(
            Object.entries(state.values).filter(([name]) =>
              name.startsWith(CATALOG),
            ),
          );
          if (
            bytes({
              ...retained,
              [AUTHORITY]: state.authority,
              [key]: value,
              [META]: {
                access: {
                  ...Object.fromEntries(
                    Object.keys(retained).map((name) => [
                      name,
                      state.access[name],
                    ]),
                  ),
                  [key]: clock + 1,
                },
              },
            }) > budget
          ) {
            await storage.remove(key);
            delete state.values[key];
            delete state.access[key];
            await persist(state, {});
            return;
          }
        }
        state.values[key] = value;
        state.access[key] = ++clock;
        await persist(state, { [key]: value }, key);
      }),
    remove: (key: string) =>
      serial(async () => {
        if (!key.startsWith(BODY) || !/^\d+$/.test(key.slice(BODY.length)))
          throw new Error("Unsupported problem removal");
        const state = await snapshot();
        state.authority.removed[key.slice(BODY.length)] = true;
        // Persist the tombstone before deletion: a failed physical removal can
        // never turn a known 404/410 back into a usable offline body.
        await persist(state, { [AUTHORITY]: state.authority });
        await storage.remove(key);
        delete state.values[key];
        delete state.access[key];
        await persist(state, {});
      }),
  };
}
