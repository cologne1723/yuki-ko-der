import { pLimit } from "translation-core/concurrency";
import { problemTranslationBaseUrl } from "./config";
import { message } from "./extension-messages";
import { createProblemCatalogLoader } from "./problem-catalog";
import {
  cacheRequestSchema,
  runtimeEnvelopeSchema,
} from "./runtime-contracts.ts";
import { createTranslationCache, type CacheStorage } from "./translation-cache";

const api = globalThis.browser ?? globalThis.chrome;
const cache = api?.storage.local
  ? createTranslationCache(api.storage.local as CacheStorage)
  : undefined;
const loadProblemCatalog = createProblemCatalogLoader(
  problemTranslationBaseUrl,
  cache,
);
api?.runtime.onMessage?.addListener((input: unknown, sender, reply) => {
  const envelope = runtimeEnvelopeSchema.safeParse(input);
  if (!envelope.success) return;
  const request = envelope.data;
  if (
    request.type !== "problem-catalog:get" &&
    !request.type?.startsWith("problem-cache:")
  )
    return;
  if (
    sender.id !== api.runtime.id ||
    !sender.url?.startsWith("https://yukicoder.me/")
  ) {
    reply({ ok: false, error: "Unsupported catalog requester" });
    return false;
  }
  if (request.type !== "problem-catalog:get") {
    const parsed = cacheRequestSchema.safeParse(input);
    if (!cache || !parsed.success) {
      reply({ ok: false, error: "Invalid problem cache request" });
      return false;
    }
    const request = parsed.data;
    const no = request.problemNo;
    const key = `problem-translation-html:ko:${no}`;
    const work =
      request.type === "problem-cache:get"
        ? cache.get(key)
        : request.type === "problem-cache:remove"
          ? cache.remove(key)
          : cache.set({ [key]: request.html });
    void work.then(
      (result) =>
        reply({ ok: true, value: result?.[key as keyof typeof result] }),
      (error) => reply({ ok: false, error: String(error) }),
    );
    return true;
  }
  void loadProblemCatalog().then(
    (result) => reply({ ok: true, ...result }),
    (error) => reply({ ok: false, error: String(error) }),
  );
  return true;
});

async function updateToolbar(): Promise<void> {
  if (!api) return;
  const settings = await api.storage.local.get("translationEnabled");
  const enabled = settings.translationEnabled !== false;
  // PNG 바깥의 배지 영역과 글꼴 렌더링은 브라우저가 관리합니다.
  await Promise.all([
    api.action.setBadgeBackgroundColor({
      color: enabled ? "#6ba8ff" : "#f76368",
    }),
    api.action.setBadgeTextColor({ color: "#111111" }),
    api.action.setBadgeText({ text: enabled ? "KO" : "JA" }),
    api.action.setTitle({
      title: message(enabled ? "toolbarKorean" : "toolbarJapanese"),
    }),
  ]);
}

// 연속 클릭과 저장소 변경을 순서대로 처리해 표시와 저장 상태를 맞춥니다.
const pending = pLimit(1);
function enqueue(work: () => Promise<void>): void {
  void pending(work).catch(async (error: unknown) => {
    console.error("번역 설정 또는 언어 배지를 갱신하지 못했습니다.", error);
    if (api)
      await Promise.allSettled([
        api.action.setBadgeText({ text: "!" }),
        api.action.setTitle({ title: message("settingsFailed") }),
      ]);
  });
}

function initializeBadge(): void {
  enqueue(updateToolbar);
}

api?.action.onClicked.addListener(() => {
  enqueue(async () => {
    if (!api) return;
    const settings = await api.storage.local.get("translationEnabled");
    await api.storage.local.set({
      translationEnabled: settings.translationEnabled === false,
    });
    await updateToolbar();
  });
});
api?.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "translationEnabled" in changes) initializeBadge();
});
api?.runtime.onInstalled.addListener(initializeBadge);
api?.runtime.onStartup.addListener(initializeBadge);
initializeBadge();
