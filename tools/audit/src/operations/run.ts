import {
  legacyProblemStatus,
  metadataReviewStatus,
} from "translation-core/problem-review-status";
import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { checkCatalog, readCatalog } from "translation-core/catalog-files";
import { parseProblemMarkdown } from "translation-core/problem-markdown";
import { convertProblemHtmlToMarkdown } from "../convert-problem-html-to-mdx.ts";
import { auditTranslations } from "./audit-translations.ts";
import { auditUiContexts } from "./audit-ui-contexts.ts";
import { auditUiPages } from "./audit-ui-pages.ts";
import type { OperationInput } from "./input.ts";
import { checkProblems } from "./problems.ts";
import { setupData } from "./setup.ts";
import { optionalFile, sha256 } from "./source-store.ts";
import {
  problemSelection,
  type OperationContext,
  type OperationResult,
} from "./types.ts";
export { operationInput, operations, type OperationInput } from "./input.ts";
export interface TaskResult extends OperationResult {
  artifact?: {
    name: string;
    content: string;
    mime: string;
    problemNo?: number;
    revision?: string;
  };
}
export async function inputRevision(
  context: OperationContext,
  input: OperationInput,
): Promise<string> {
  // An external conversion depends only on its uploaded bytes, not repository drafts.
  if (input.operation === "convert-problem" && input.html !== undefined)
    return sha256(JSON.stringify(input));
  const paths: string[] = [];
  const problemOperation = [
    "setup",
    "audit-problems",
    "verify-problems",
    "validate-problems",
    "lint-problems",
    "convert-problem",
  ].includes(input.operation);
  const problems = input.problemNo
    ? [input.problemNo]
    : problemSelection(input.problems);
  if (
    problemOperation &&
    !(input.operation === "setup" && input.selection === "pages")
  ) {
    const directory = join(
      context.repositoryRoot,
      "problem-translations/ko/problems",
    );
    for (const file of await readdir(directory))
      if (
        /^\d+\.(html|mdx)$/.test(file) &&
        (!problems || problems.includes(parseInt(file)))
      )
        paths.push(join(directory, file));
  }
  if (
    !problemOperation ||
    (input.operation === "setup" && input.selection !== "problems")
  ) {
    paths.push(join(context.repositoryRoot, "translations/ko.messages.json"));
    const directory = join(context.repositoryRoot, "translations/ko");
    for (const file of await readdir(directory))
      if (file.endsWith(".json")) paths.push(join(directory, file));
  }
  if (["audit-problems", "validate-problems"].includes(input.operation)) {
    const directory = join(context.dataRoot, "problems-source");
    const selected = paths.map((path) => parseInt(basename(path)));
    paths.push(join(directory, "index.json"));
    if (input.operation === "audit-problems")
      for (const no of selected) paths.push(join(directory, `${no}.html`));
  }
  if (input.operation === "audit-translations" && input.page)
    paths.push(join(context.dataRoot, "pages", input.page));
  if (["audit-ui-pages", "audit-ui-contexts"].includes(input.operation)) {
    const directory = join(context.dataRoot, "pages");
    let files: string[];
    try {
      files = await readdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      files = [];
    }
    for (const file of files)
      if (file.endsWith(".html")) paths.push(join(directory, file));
    if (input.operation === "audit-ui-pages")
      paths.push(
        join(context.repositoryRoot, "tools/review/public/ui-contexts.json"),
      );
  }
  const values = await Promise.all(
    paths.sort().map(async (path) => {
      const bytes = await optionalFile(path);
      return [path, bytes ? sha256(bytes) : null];
    }),
  );
  return sha256(JSON.stringify({ input, values }));
}
export async function runOperation(
  context: OperationContext,
  input: OperationInput,
): Promise<TaskResult> {
  context = {
    ...context,
    problems: problemSelection(input.problems),
    refresh: input.refresh,
  };
  context.signal?.throwIfAborted();
  switch (input.operation) {
    case "setup":
      return setupData(context, input.selection ?? "both");
    case "audit-problems":
      return checkProblems(context, "audit");
    case "verify-problems":
      return checkProblems(context, "live");
    case "validate-problems":
      return checkProblems(context, "validate");
    case "lint-problems":
      return checkProblems(context, "lint");
    case "validate-ui": {
      try {
        const result = await checkCatalog(context.repositoryRoot);
        const item = {
          id: "catalog",
          status: "passed" as const,
          message: `${result.messages} messages; ${result.usages} usages`,
          details: result,
        };
        context.progress?.(item);
        return { operation: input.operation, items: [item] };
      } catch (error) {
        const message = String(error);
        const locations: { dictionary: string; index: number }[] = [];
        try {
          const catalog = await readCatalog(context.repositoryRoot);
          const ids = catalog.messages
            .filter(
              (entry) =>
                message.includes(entry.id) || message.includes(entry.source),
            )
            .map((entry) => entry.id);
          const directory = join(context.repositoryRoot, "translations/ko");
          for (const dictionary of await readdir(directory)) {
            if (!dictionary.endsWith(".json")) continue;
            const value = JSON.parse(
              await readFile(join(directory, dictionary), "utf8"),
            );
            value.translations?.forEach(
              (usage: { ref?: string }, index: number) => {
                if (
                  ids.includes(usage.ref ?? "") ||
                  message.includes(dictionary)
                )
                  locations.push({ dictionary, index });
              },
            );
          }
        } catch {
          /* A malformed catalog still has a reportable validation error. */
        }
        const items = locations.length
          ? locations.map((location) => ({
              id: location.dictionary,
              status: "failed" as const,
              message,
              location,
            }))
          : [{ id: "catalog", status: "failed" as const, message }];
        items.forEach((item) => context.progress?.(item));
        return { operation: input.operation, items };
      }
    }
    case "audit-ui-pages":
      return auditUiPages(context);
    case "audit-ui-contexts":
      return auditUiContexts(context);
    case "audit-translations": {
      const html =
        input.html ??
        (input.page
          ? await readFile(join(context.dataRoot, "pages", input.page), "utf8")
          : undefined);
      if (html === undefined)
        throw new Error("Select a saved page or upload HTML");
      const dictionaries = [
        ...(await Promise.all(
          (input.dictionaries ?? []).map((name) =>
            readFile(
              join(context.repositoryRoot, "translations/ko", name),
              "utf8",
            ).then(JSON.parse),
          ),
        )),
        ...(input.fixtures ?? []),
      ];
      if (!dictionaries.length)
        throw new Error("Select or upload at least one dictionary");
      return auditTranslations(context, html, dictionaries);
    }
    case "convert-problem": {
      const source = input.problemNo
        ? await optionalFile(
            join(
              context.repositoryRoot,
              "problem-translations/ko/problems",
              `${input.problemNo}.html`,
            ),
          )
        : undefined;
      const html = source?.toString() ?? input.html;
      if (html === undefined)
        throw new Error("Select a legacy HTML problem or upload HTML");
      const content = convertProblemHtmlToMarkdown(html);
      return {
        operation: input.operation,
        items: [
          {
            id: String(input.problemNo ?? "upload"),
            status: "passed",
            message: "Conversion preview validated; no repository file changed",
            reviewStatus: legacyProblemStatus(
              metadataReviewStatus(parseProblemMarkdown(content).metadata),
            ),
          },
        ],
        artifact: {
          name: `${input.problemNo ?? "converted-problem"}.mdx`,
          content,
          mime: "text/plain; charset=utf-8",
          problemNo: input.problemNo,
          revision: source ? sha256(source) : undefined,
        },
      };
    }
  }
}
