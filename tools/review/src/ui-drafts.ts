import { JSDOM } from "jsdom";
import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { format } from "prettier";
import { readCatalog } from "translation-core/catalog-files";
import { assertCatalogShapes } from "translation-core/catalog-schema";
import { pageDictionaryNames } from "translation-core/page-dictionaries";
import {
  validateCatalog,
  type Catalog,
  type UsageDictionary,
} from "translation-core/translation-catalog";
import { CatalogTransactions } from "./catalog-transactions.ts";
import { ReviewError } from "./problem-review.ts";
import type { UiReviewStore } from "./ui-review.ts";
const revision = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export class UiDrafts {
  constructor(
    private root: string,
    private transactions: CatalogTransactions,
    private list: () => ReturnType<UiReviewStore["list"]>,
  ) {}

  draftOptions(source: string, pathname: string) {
    return this.transactions.run(() => this.readDraftOptions(source, pathname));
  }

  private async readDraftOptions(source: string, pathname: string) {
    const { dictionaries } = await this.list();
    const catalog = await readCatalog(this.root);
    const names = pageDictionaryNames(pathname).map((name) => `${name}.json`);
    const files = dictionaries
      .filter((d) => names.includes(d.file))
      .map((d) => ({ file: d.file, revision: d.revision }));
    const normalize = (text: string) => text.replace(/\s+/gu, " ").trim();
    const matches = catalog.messages
      .filter((m) => normalize(m.source) === normalize(source))
      .map((m) => ({
        id: m.id,
        target: m.target,
        meaning: m.meaning ?? "",
        usages: dictionaries.flatMap((d) =>
          d.entries.flatMap((entry, index) =>
            entry.messageId === m.id ? [{ file: d.file, index }] : [],
          ),
        ),
      }));
    return { source, files, matches };
  }

  createDraft(
    source: string,
    pathname: string,
    body: {
      file?: unknown;
      revision?: unknown;
      selector?: unknown;
      attribute?: unknown;
      target?: unknown;
      meaning?: unknown;
      reuseId?: unknown;
    },
  ) {
    return this.transactions.run(async () => {
      if (
        !body ||
        typeof body.file !== "string" ||
        typeof body.revision !== "string" ||
        typeof body.selector !== "string" ||
        !body.selector.trim()
      )
        throw new ReviewError("적용할 페이지와 선택자를 확인하세요.");
      if (/data-collector/iu.test(body.selector))
        throw new ReviewError(
          "수집 전용 로케이터 대신 실제 페이지의 CSS 선택자를 사용하세요.",
        );
      const options = await this.draftOptions(source, pathname);
      const file = options.files.find((f) => f.file === body.file);
      if (!file)
        throw new ReviewError("이 페이지에서 사용되는 사전을 선택하세요.");
      if (file.revision !== body.revision)
        throw new ReviewError(
          "사전이 변경되었습니다. 번역 작성을 다시 열어 주세요.",
          409,
        );
      const catalogPath = join(this.root, "translations/ko.messages.json");
      const catalogRaw = await readFile(catalogPath, "utf8");
      const catalog = JSON.parse(catalogRaw) as Catalog;
      const dictionaries: Record<string, UsageDictionary> = {};
      const dictionaryRaw: Record<string, string> = {};
      for (const name of (
        await readdir(join(this.root, "translations/ko"))
      ).filter((n) => n.endsWith(".json"))) {
        dictionaryRaw[name] = await readFile(
          join(this.root, "translations/ko", name),
          "utf8",
        );
        dictionaries[name] = JSON.parse(dictionaryRaw[name]);
      }
      if (
        revision(dictionaryRaw[file.file]) +
          (catalog.messages.length ? revision(JSON.stringify(catalog)) : "") !==
        body.revision
      )
        throw new ReviewError(
          "사전이 변경되었습니다. 번역 작성을 다시 열어 주세요.",
          409,
        );
      let message;
      if (body.reuseId) {
        if (
          typeof body.reuseId !== "string" ||
          !options.matches.some((m) => m.id === body.reuseId)
        )
          throw new ReviewError("같은 원문의 기존 문구를 선택하세요.");
        message = catalog.messages.find((m) => m.id === body.reuseId)!;
      } else {
        if (typeof body.target !== "string" || !body.target.trim())
          throw new ReviewError("한국어 번역을 입력하세요.");
        if (body.meaning !== undefined && typeof body.meaning !== "string")
          throw new ReviewError("문구의 의미를 확인하세요.");
        const meaning =
          typeof body.meaning === "string" ? body.meaning.trim() : "";
        if (options.matches.some((m) => m.meaning === meaning))
          throw new ReviewError(
            "같은 의미의 문구가 이미 있습니다. 기존 문구를 사용하세요.",
            409,
          );
        message = {
          id: `ui_${randomUUID().replaceAll("-", "")}`,
          source,
          target: body.target.trim(),
          reviewStatus: "unreviewed" as const,
          ...(meaning ? { meaning } : {}),
        };
        catalog.messages.push(message);
      }
      const usage = {
        ref: message.id,
        selector: body.selector.trim(),
        ...(body.attribute ? { attribute: body.attribute as string } : {}),
      };
      const dictionary = dictionaries[file.file];
      let index = dictionary.translations.findIndex(
        (u) =>
          "ref" in u &&
          u.ref === usage.ref &&
          u.selector === usage.selector &&
          u.attribute === usage.attribute,
      );
      if (index < 0) {
        index = dictionary.translations.length;
        dictionary.translations.push(usage);
      }
      const dom = new JSDOM("");
      try {
        assertCatalogShapes(catalog, dictionaries);
        validateCatalog(catalog, dictionaries, dom.window.document);
      } catch (error) {
        throw new ReviewError(
          `저장할 수 없는 번역입니다: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        dom.window.close();
      }
      const changes = [
        ...(!body.reuseId
          ? [{ path: catalogPath, raw: catalogRaw, value: catalog }]
          : []),
        {
          path: join(this.root, "translations/ko", file.file),
          raw: dictionaryRaw[file.file],
          value: dictionary,
        },
      ];
      const staged = await Promise.all(
        changes.map(async (item) => ({
          ...item,
          output: await format(JSON.stringify(item.value), {
            parser: "json",
          }),
        })),
      );
      if ((await readFile(catalogPath, "utf8")) !== catalogRaw)
        throw new ReviewError("공통 사전이 변경되었습니다.", 409);
      for (const [name, raw] of Object.entries(dictionaryRaw))
        if (
          (await readFile(join(this.root, "translations/ko", name), "utf8")) !==
          raw
        )
          throw new ReviewError("페이지 사전이 변경되었습니다.", 409);
      await this.transactions.commit(staged);
      return {
        file: file.file,
        index,
        messageId: message.id,
        target: message.target,
        reused: Boolean(body.reuseId),
      };
    });
  }
}
