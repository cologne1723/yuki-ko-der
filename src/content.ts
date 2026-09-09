import { TagTranslator, type TagTranslation } from "./tag-translations.ts";
declare const __YUKICODER_TAG_TRANSLATIONS__: TagTranslation[];
import {
  applyTranslations,
  TranslationHistory,
} from "translation-core/fixed-translations";
import { type ProblemCatalog } from "translation-core/problem-catalog";
import { createContentNotices } from "./content-notices.ts";
import { createContentResources } from "./content-resources.ts";
import type { CatalogResult } from "./problem-catalog";
import type { ProblemOutcome } from "./problem-engine";
import {
  ProblemTitleTranslator,
  type ProblemTitleTranslation,
} from "./problem-titles";

declare const __YUKICODER_PROBLEM_TITLES__: ProblemTitleTranslation[];
declare global {
  var yukicoderProblemTranslations:
    | {
        translateProblem(
          shouldApply?: () => boolean,
          catalog?: ProblemCatalog,
        ): Promise<ProblemOutcome>;
        restoreProblem(): void;
      }
    | undefined;
}

(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const runtime = api?.runtime;
  if (!runtime || !document.body) return;

  const { loadTranslations, loadCatalog } = createContentResources(runtime);

  const history = new TranslationHistory();
  const tagTranslator = new TagTranslator(__YUKICODER_TAG_TRANSLATIONS__);
  const titleHistory = new TranslationHistory();
  let problemTitles = new ProblemTitleTranslator([]);
  let titlesReady = false;
  let globallyEnabled = false;
  let settingsReady = false;
  let settingsRevision = 0;
  let revision = 0;
  let suspended = false;
  let entries: Awaited<ReturnType<typeof loadTranslations>> | undefined;
  let uiLoading: ReturnType<typeof loadTranslations> | undefined;
  let catalogLoading: Promise<CatalogResult> | undefined;
  const notices = createContentNotices(document, () => restart(true));
  const { notify } = notices;
  function applyReadyTranslations() {
    if (!globallyEnabled || !settingsReady || suspended) return;
    if (entries) applyTranslations(document, entries, history);
    tagTranslator.apply(document, history);
    if (titlesReady) problemTitles.apply(document, titleHistory);
  }
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled || !globallyEnabled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      applyReadyTranslations();
    });
  });

  async function render(renew: boolean) {
    const current = ++revision;
    const isProblemPage = /^\/problems\/no\/\d+\/?$/u.test(location.pathname);
    const live = () =>
      current === revision && globallyEnabled && settingsReady && !suspended;
    observer.disconnect();
    titlesReady = false;
    titleHistory.restore();
    globalThis.yukicoderProblemTranslations?.restoreProblem();
    history.restore();
    notices.clear();
    if (!live()) return;
    if (isProblemPage) {
      notices.setOriginalAction(() => {
        revision++;
        titlesReady = false;
        titleHistory.restore();
        globalThis.yukicoderProblemTranslations?.restoreProblem();
        notices.notifyText("problem", "일본어 원문입니다");
        notices.setOriginalAction(() => {
          void render(false);
        }, "한국어 번역 보기");
      });
      notices.notifyText("problem", "문제 번역을 불러오고 있습니다.");
    }
    if (renew) {
      uiLoading = undefined;
      catalogLoading = undefined;
    }
    observer.observe(document.documentElement, {
      childList: true,
      characterData: true,
      attributes: true,
      subtree: true,
    });
    uiLoading ??= loadTranslations().catch((error) => {
      uiLoading = undefined;
      throw error;
    });
    catalogLoading ??= loadCatalog();
    const uiTask = uiLoading
      .then((value) => {
        if (!live()) return;
        entries = value;
        applyReadyTranslations();
      })
      .catch((error) => {
        if (!live()) return;
        console.warn("[yukicoder-ko] UI translation failed", error);
        notify("ui", "uiLoadFailed", true);
      });
    const problemTask = catalogLoading
      .then(async (result) => {
        if (!live()) return;
        problemTitles = new ProblemTitleTranslator(
          result.catalog?.entries ?? __YUKICODER_PROBLEM_TITLES__,
        );
        titlesReady = true;
        applyReadyTranslations();
        if (!isProblemPage) return;
        const outcome =
          await globalThis.yukicoderProblemTranslations?.translateProblem(
            live,
            result.catalog,
          );
        if (!live()) return;
        if (outcome?.status === "failed") {
          console.warn(
            "[yukicoder-ko] Problem translation was not applied",
            outcome.detail,
          );
          notify(
            "problem",
            outcome.reason === "network"
              ? "problemLoadFailed"
              : "problemVerificationFailed",
            outcome.reason === "network",
          );
        }
        if (outcome?.status === "applied") {
          notices.notifyText("problem", "한국어 번역본 입니다.");
          void outcome.verification?.then((result) => {
            if (!live() || result.status === "cancelled") return;
            notices.notifyText(
              "problem",
              result.status === "changed"
                ? "번역 시점과 문제가 달라졌습니다. 원문을 확인해 주세요."
                : result.status === "unavailable"
                  ? "원문 변경 여부를 확인하지 못했습니다. 원문을 확인해 주세요."
                  : "한국어 번역본 입니다.",
            );
          });
        } else if (outcome?.status === "unavailable") {
          notices.notifyText(
            "problem",
            "이 문제의 번역이 없어 원문을 표시합니다.",
          );
        }
        applyReadyTranslations();
      })
      .catch((error) => {
        if (!live()) return;
        console.warn("[yukicoder-ko] Problem translation failed", error);
        if (isProblemPage) notify("problem", "problemLoadFailed", true);
      });
    await Promise.all([uiTask, problemTask]);
  }
  async function restart(renew = false) {
    if (!settingsReady) {
      const before = settingsRevision;
      try {
        const settings = await api?.storage?.local.get("translationEnabled");
        if (before !== settingsRevision) return;
        globallyEnabled = settings?.translationEnabled !== false;
        settingsReady = true;
      } catch (error) {
        if (before !== settingsRevision) return;
        console.warn("[yukicoder-ko] Could not load settings", error);
        notify("settings", "settingsFailed", true);
        return;
      }
    }
    await render(renew);
  }
  api?.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local" || !("translationEnabled" in changes)) return;
    settingsRevision++;
    globallyEnabled = changes.translationEnabled.newValue !== false;
    settingsReady = true;
    if (!suspended) void render(false);
  });
  window.addEventListener("pagehide", () => {
    suspended = true;
    settingsRevision++;
    revision++;
    observer.disconnect();
  });
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    suspended = false;
    settingsReady = false;
    void render(false).then(() => restart(true));
  });
  void restart();
})();
