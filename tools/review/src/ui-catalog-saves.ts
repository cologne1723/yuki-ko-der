import { JSDOM } from "jsdom";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { format } from "prettier";
import { assertCatalogShapes } from "translation-core/catalog-schema";
import type { TranslationDictionary } from "translation-core/fixed-translations";
import {
  validateCatalog,
  type Catalog,
  type UsageDictionary,
} from "translation-core/translation-catalog";
import { commonReviewMembers } from "translation-core/ui-review-groups";
import { CatalogTransactions } from "./catalog-transactions.ts";
import { ReviewError } from "./problem-review.ts";
import { UiCatalogRepository } from "./ui-catalog-repository.ts";

import { sha256 as revision } from "translation-core/node-hash";

export class UiCatalogSaves {
  constructor(
    private root: string,
    private transactions: CatalogTransactions,
    private list: () => ReturnType<UiCatalogRepository["readList"]>,
  ) {}
  private async saveMessage(
    id: string,
    target: string,
    action: string,
    expected: { file: string; revision: string }[],
    variant?: number,
  ) {
    const path = join(this.root, "translations/ko.messages.json");
    const raw = await readFile(path, "utf8");
    const catalog = JSON.parse(raw) as Catalog;
    const catalogRevision = revision(JSON.stringify(catalog));
    for (const d of expected) {
      const current = await readFile(
        join(this.root, "translations/ko", d.file),
        "utf8",
      );
      if (revision(current) + catalogRevision !== d.revision)
        throw new ReviewError("사전이 변경되었습니다. 새로고침하세요.", 409);
    }
    const message = catalog.messages.find((m) => m.id === id);
    if (!message) throw new ReviewError("공통 문구가 없습니다.", 404);
    const clean = target;
    if (!clean.trim())
      throw new ReviewError("번역 내용은 비워 둘 수 없습니다.");
    const names = (text: string) =>
      [...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu)]
        .map((m) => m[1])
        .sort()
        .join(",");
    if (names(clean) !== names(message.source))
      throw new ReviewError("원문의 이름 있는 변수를 빠짐없이 유지하세요.");
    if (/%(?:\d+\$)?[dsf]/u.test(clean))
      throw new ReviewError("이름 있는 변수를 사용하세요.");
    const selected =
      variant === undefined ? message : message.alternatives?.[variant];
    if (!selected) throw new ReviewError("번역 문맥이 변경되었습니다.", 409);
    const draft =
      action === "unapprove" ||
      (action === "save" &&
        (selected.reviewStatus !== "approved" || selected.target !== clean));
    selected.target = clean;
    selected.reviewStatus = draft ? "unreviewed" : "approved";
    const dictionaries: Record<string, UsageDictionary> = {};
    for (const file of (
      await readdir(join(this.root, "translations/ko"))
    ).filter((file) => file.endsWith(".json")))
      dictionaries[file] = JSON.parse(
        await readFile(join(this.root, "translations/ko", file), "utf8"),
      );
    const validationDom = new JSDOM("");
    try {
      assertCatalogShapes(catalog, dictionaries);
      validateCatalog(catalog, dictionaries, validationDom.window.document);
    } catch (error) {
      throw new ReviewError(
        `Invalid proposed catalog: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      validationDom.window.close();
    }
    const output = await format(JSON.stringify(catalog), { parser: "json" });
    if ((await readFile(path, "utf8")) !== raw)
      throw new ReviewError("공통 사전이 변경되었습니다.", 409);
    await this.transactions.commit([{ path, raw, output }]);
    return (await this.list()).dictionaries;
  }
  saveShared(
    file: string,
    index: number,
    body: { target?: unknown; members?: unknown; action?: unknown },
  ) {
    return this.transactions.run(async () => {
      if (
        !body ||
        typeof body.target !== "string" ||
        !body.target.trim() ||
        !Array.isArray(body.members)
      )
        throw new ReviewError("공통 승인 요청이 올바르지 않습니다.");
      const action = body.action ?? "approve";
      if (!["save", "approve", "unapprove"].includes(String(action)))
        throw new ReviewError("잘못된 저장 동작입니다.");
      const { dictionaries } = await this.list();
      const members = commonReviewMembers(dictionaries, file, index);
      const expected = members.map((m) => ({
        file: m.dictionary.file,
        index: m.index,
        revision: m.dictionary.revision,
      }));
      if (
        members.length < 2 ||
        JSON.stringify(expected) !== JSON.stringify(body.members)
      )
        throw new ReviewError(
          "공유 항목이 변경되었거나 문맥별 검수가 필요한 문구입니다. 새로고침 후 확인하세요.",
          409,
        );
      const target = body.target;
      if (!target.trim())
        throw new ReviewError("번역 내용은 비워 둘 수 없습니다.");
      const names = (text: string) =>
        [...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu)]
          .map((m) => m[1])
          .sort()
          .join(",");
      if (names(target) !== names(members[0].entry.source))
        throw new ReviewError("원문의 이름 있는 변수를 빠짐없이 유지하세요.");
      if (/%(?:\d+\$)?[dsf]/u.test(target))
        throw new ReviewError("이름 있는 변수를 사용하세요.");
      if (members[0].entry.messageId) {
        const dictionaries = await this.saveMessage(
          members[0].entry.messageId,
          target,
          String(action),
          members.map((m) => m.dictionary),
          members[0].entry.variant,
        );
        return { dictionaries, count: members.length };
      }
      const files = [...new Set(members.map((m) => m.dictionary.file))];
      const staged: {
        file: string;
        path: string;
        raw: string;
        output: string;
      }[] = [];
      for (const name of files) {
        const path = join(this.root, "translations/ko", name);
        const raw = await readFile(path, "utf8");
        if (
          revision(raw) !==
          members.find((m) => m.dictionary.file === name)!.dictionary.revision
        )
          throw new ReviewError("사전이 변경되었습니다.", 409);
        const dictionary = JSON.parse(raw) as TranslationDictionary;
        members
          .filter((m) => m.dictionary.file === name)
          .forEach((m) => {
            const draft =
              action === "unapprove" ||
              (action === "save" &&
                (m.entry.reviewStatus !== "approved" ||
                  m.entry.target !== target));
            dictionary.translations[m.index].target = target;
            dictionary.translations[m.index].reviewStatus = draft
              ? "unreviewed"
              : "approved";
          });
        const output = await format(JSON.stringify(dictionary), {
          parser: "json",
        });
        staged.push({
          file: name,
          path,
          raw,
          output,
        });
      }
      await this.transactions.commit(staged);
      return {
        dictionaries: staged.map((item) => ({
          file: item.file,
          revision: revision(item.output),
          entries: JSON.parse(item.output).translations,
        })),
        count: members.length,
      };
    });
  }
  save(
    file: string,
    index: number,
    body: { target?: unknown; revision?: unknown; action?: unknown },
  ) {
    return this.transactions.run(async () => {
      if (
        !/^[a-z0-9_]+\.json$/u.test(file) ||
        !Number.isSafeInteger(index) ||
        index < 0
      )
        throw new ReviewError("올바르지 않은 항목입니다.");
      if (
        !body ||
        typeof body.target !== "string" ||
        !body.target.trim() ||
        typeof body.revision !== "string" ||
        !["save", "approve", "unapprove"].includes(String(body.action))
      )
        throw new ReviewError("번역 내용과 저장 작업을 확인하세요.");
      const listed = (await this.list()).dictionaries;
      const selected = listed.find((d) => d.file === file);
      const resolved = selected?.entries[index];
      if (resolved?.messageId) {
        if (selected!.revision !== body.revision)
          throw new ReviewError("사전이 변경되었습니다.", 409);
        const dictionaries = await this.saveMessage(
          resolved.messageId,
          body.target,
          String(body.action),
          [selected!],
          resolved.variant,
        );
        const current = dictionaries.find((d) => d.file === file)!;
        return {
          revision: current.revision,
          entry: current.entries[index],
          dictionaries,
        };
      }
      const path = join(this.root, "translations/ko", file);
      const raw = await readFile(path, "utf8");
      if (revision(raw) !== body.revision)
        throw new ReviewError(
          "다른 곳에서 사전이 변경되었습니다. 수정 내용을 복사한 뒤 페이지를 새로고침하세요.",
          409,
        );
      const dictionary = JSON.parse(raw) as TranslationDictionary;
      const entry = dictionary.translations[index];
      if (!entry) throw new ReviewError("항목을 찾을 수 없습니다.", 404);
      const target = body.target;
      if (!target.trim())
        throw new ReviewError("번역 내용은 비워 둘 수 없습니다.");
      const names = (text: string) =>
        [...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu)]
          .map((m) => m[1])
          .sort()
          .join(",");
      if (names(target) !== names(entry.source))
        throw new ReviewError("원문의 이름 있는 변수를 빠짐없이 유지하세요.");
      if (/%(?:\d+\$)?[dsf]/u.test(target))
        throw new ReviewError(
          "위치 기반 변수가 아닌 이름 있는 변수를 사용하세요.",
        );
      entry.reviewStatus =
        body.action === "approve" ||
        (body.action === "save" &&
          entry.reviewStatus === "approved" &&
          entry.target === target)
          ? "approved"
          : "unreviewed";
      entry.target = target;
      const output = await format(JSON.stringify(dictionary), {
        parser: "json",
      });
      await this.transactions.commit([{ path, raw, output }]);
      return { revision: revision(output), entry };
    });
  }
}
