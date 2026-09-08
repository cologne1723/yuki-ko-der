import { JSDOM } from "jsdom";
import { join } from "node:path";
import { format } from "prettier";
import { assertCatalogShapes } from "translation-core/catalog-schema";
import { defaultDataDirectory } from "translation-core/paths";
import { validateCatalog } from "translation-core/translation-catalog";
import { CatalogTransactions } from "./catalog-transactions.ts";
import { ReviewError } from "./problem-review.ts";
import { UiCatalogRepository } from "./ui-catalog-repository.ts";
import { UiCatalogSaves } from "./ui-catalog-saves.ts";
import { UiDrafts } from "./ui-drafts.ts";

export class UiReviewStore {
  private saves: UiCatalogSaves;
  private transactions: CatalogTransactions;
  private drafts: UiDrafts;
  private repository: UiCatalogRepository;
  constructor(
    private root: string,
    private dataRoot = defaultDataDirectory(root),
  ) {
    this.transactions = new CatalogTransactions(root);
    this.repository = new UiCatalogRepository(root, dataRoot);
    this.saves = new UiCatalogSaves(root, this.transactions, () => this.list());
    this.drafts = new UiDrafts(root, this.transactions, () => this.list());
  }
  draftOptions(...args: Parameters<UiDrafts["draftOptions"]>) {
    return this.drafts.draftOptions(...args);
  }
  createDraft(...args: Parameters<UiDrafts["createDraft"]>) {
    return this.drafts.createDraft(...args);
  }
  page(name: string) {
    return this.repository.page(name);
  }
  catalogState() {
    return this.transactions.run(() => this.repository.readCatalogState());
  }
  catalogTransaction<T>(
    work: (
      state: Awaited<ReturnType<UiReviewStore["catalogState"]>>,
    ) => Promise<T>,
  ): Promise<T> {
    return this.transactions.run(async () => {
      const state = await this.catalogState();
      const result = await work(state);
      const dom = new JSDOM("");
      try {
        assertCatalogShapes(state.catalog, state.dictionaries);
        validateCatalog(state.catalog, state.dictionaries, dom.window.document);
      } finally {
        dom.window.close();
      }
      const changes = [
        {
          path: join(this.root, "translations/ko.messages.json"),
          raw: state.catalogRaw,
          value: state.catalog,
        },
        ...Object.entries(state.dictionaries).map(([file, value]) => ({
          path: join(this.root, "translations/ko", file),
          raw: state.raw[file],
          value,
        })),
      ].filter(
        (item) =>
          JSON.stringify(JSON.parse(item.raw)) !== JSON.stringify(item.value),
      );
      const staged = await Promise.all(
        changes.map(async (item) => ({
          ...item,
          output: await format(JSON.stringify(item.value), {
            parser: "json",
          }),
        })),
      );
      if ((await this.catalogState()).revision !== state.revision)
        throw new ReviewError(
          "사전이 변경되었습니다. 다시 불러온 뒤 저장하세요.",
          409,
        );
      await this.transactions.commit(staged);
      return result;
    });
  }
  list() {
    return this.transactions.run(() => this.repository.readList());
  }
  save(...args: Parameters<UiCatalogSaves["save"]>) {
    return this.saves.save(...args);
  }
  saveShared(...args: Parameters<UiCatalogSaves["saveShared"]>) {
    return this.saves.saveShared(...args);
  }
}
