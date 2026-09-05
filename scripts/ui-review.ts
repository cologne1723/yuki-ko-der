import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { format } from "prettier";
import { JSDOM } from "jsdom";
import type { TranslationDictionary } from "../src/fixed-translations.ts";
import { ReviewError } from "./problem-review.ts";

const revision = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export class UiReviewStore {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private root: string) {}
  async list() {
    const directory = join(this.root, "translations/ko");
    const dictionaries = await Promise.all(
      (await readdir(directory))
        .filter((name) => /^[a-z0-9_]+\.json$/u.test(name))
        .sort()
        .map(async (file) => {
          const raw = await readFile(join(directory, file), "utf8");
          return {
            file,
            revision: revision(raw),
            entries: (JSON.parse(raw) as TranslationDictionary).translations,
          };
        }),
    );
    let pages: string[] = [];
    try {
      pages = (await readdir(join(this.root, "tmp/pages")))
        .filter((name) => /^[a-zA-Z0-9_-]+\.html$/u.test(name))
        .sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return { dictionaries, pages };
  }
  async page(name: string) {
    if (!/^[a-zA-Z0-9_-]+\.html$/u.test(name))
      throw new ReviewError("올바르지 않은 페이지입니다.");
    const dom = new JSDOM(
      await readFile(join(this.root, "tmp/pages", name), "utf8"),
    );
    const doc = dom.window.document;
    doc
      .querySelectorAll(
        "script, iframe, object, embed, base, meta[http-equiv], link[rel=preload], link[rel=modulepreload]",
      )
      .forEach((el) => el.remove());
    for (const el of doc.querySelectorAll("*")) {
      for (const attr of [...el.attributes]) {
        if (
          /^on/iu.test(attr.name) ||
          attr.name === "srcdoc" ||
          /^(?:javascript|data):/iu.test(attr.value.trim())
        )
          el.removeAttribute(attr.name);
      }
    }
    const base = doc.createElement("base");
    base.href = "https://yukicoder.me/";
    doc.head.prepend(base);
    const html = dom.serialize();
    dom.window.close();
    return html;
  }
  save(
    file: string,
    index: number,
    body: { target?: unknown; revision?: unknown; action?: unknown },
  ) {
    const operation = this.pending.then(async () => {
      if (
        !/^[a-z0-9_]+\.json$/u.test(file) ||
        !Number.isSafeInteger(index) ||
        index < 0
      )
        throw new ReviewError("올바르지 않은 항목입니다.");
      if (
        typeof body.target !== "string" ||
        !body.target.trim() ||
        typeof body.revision !== "string" ||
        !["save", "approve", "unapprove"].includes(String(body.action))
      )
        throw new ReviewError("번역 내용과 저장 작업을 확인하세요.");
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
      const target = body.target.replace(/^📝 /u, "");
      const names = (text: string) =>
        [...text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/gu)]
          .map((m) => m[1])
          .sort()
          .join(",");
      if (entry.variables && names(target) !== names(entry.source))
        throw new ReviewError("원문의 이름 있는 변수를 빠짐없이 유지하세요.");
      if (/%(?:\d+\$)?[dsf]/u.test(target))
        throw new ReviewError(
          "위치 기반 변수가 아닌 이름 있는 변수를 사용하세요.",
        );
      entry.target =
        body.action === "approve" ||
        (body.action === "save" && !entry.target.startsWith("📝 "))
          ? target
          : `📝 ${target}`;
      const output = await format(JSON.stringify(dictionary), {
        parser: "json",
      });
      const temporary = `${path}.${randomUUID()}.tmp`;
      await writeFile(temporary, output);
      await rename(temporary, path);
      return { revision: revision(output), entry };
    });
    this.pending = operation.catch(() => undefined);
    return operation;
  }
}
