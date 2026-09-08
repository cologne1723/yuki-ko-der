import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repositoryRoot } from "translation-core/paths";
import {
  compileProblemMarkdown,
  parseProblemMarkdown,
} from "translation-core/problem-markdown";
import { ReviewTasks } from "../src/tasks.ts";
import type { OperationInput } from "translation-audit/operations/run";

const execute = promisify(execFile);
test("HTML workers and retained CLI actions agree on offline results, ranges, fixtures and conversion", async () => {
  const data = await mkdtemp(join(tmpdir(), "review-cli-"));
  const tasks = new ReviewTasks(repositoryRoot, data);
  const source = await readFile(
    join(repositoryRoot, "problem-translations/ko/problems/1.mdx"),
    "utf8",
  );
  const metadata = parseProblemMarkdown(source).metadata;
  await mkdir(join(data, "pages"));
  const html = "<html><body><button>日本語</button></body></html>";
  const fixture = {
    translations: [{ source: "日本語", target: "한국어", selector: "button" }],
  };
  await writeFile(join(data, "pages/home.html"), html);
  await writeFile(join(data, "dictionary.json"), JSON.stringify(fixture));
  const cases: {
    input: OperationInput;
    script: string;
    args?: string[];
    report?: string;
  }[] = [
    {
      input: { operation: "validate-problems", problems: "1-1" },
      script: "validate-problem-translations",
      args: ["--problems", "1-1"],
    },
    {
      input: { operation: "lint-problems", problems: "1" },
      script: "lint-problem-html",
      args: ["--problems", "1"],
    },
    { input: { operation: "validate-ui" }, script: "validate-ui-catalog" },
    {
      input: { operation: "audit-ui-pages" },
      script: "audit-ui-pages",
      report: "ui-page-coverage.json",
    },
    {
      input: { operation: "audit-ui-contexts" },
      script: "audit-ui-contexts",
      report: "ui-context-audit.json",
    },
    {
      input: { operation: "audit-translations", html, fixtures: [fixture] },
      script: "audit-translations",
      args: [join(data, "pages/home.html"), join(data, "dictionary.json")],
    },
    {
      input: {
        operation: "convert-problem",
        html: compileProblemMarkdown(source),
      },
      script: "convert-problem-html-to-mdx",
      args: [join(data, "external.html")],
    },
  ];
  await writeFile(join(data, "external.html"), compileProblemMarkdown(source));
  try {
    for (const entry of cases) {
      const started = await tasks.start(entry.input);
      let result;
      for (let i = 0; i < 500; i++) {
        result = await tasks.get(started.id);
        if (!["running", "cancelling"].includes(result.status)) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(
        result?.status,
        "completed",
        `${entry.input.operation}: ${result?.error}`,
      );
      assert.equal(
        result?.result?.items.some((item) => item.status === "failed"),
        false,
      );
      const report: unknown = result?.result?.report
        ? JSON.parse(await readFile(result.result.report, "utf8"))
        : undefined;
      const args = [
        "--import",
        "tsx",
        join(repositoryRoot, `tools/audit/src/${entry.script}.ts`),
        ...(entry.args ?? []),
      ];
      if (
        !["audit-translations", "convert-problem"].includes(
          entry.input.operation,
        )
      )
        args.push("--data-dir", data);
      const cli = await execute(process.execPath, args, {
        cwd: repositoryRoot,
        maxBuffer: 5 * 1024 * 1024,
      });
      if (report)
        assert.deepEqual(
          JSON.parse(await readFile(result!.result!.report!, "utf8")),
          report,
          entry.input.operation,
        );
      if (entry.input.operation === "convert-problem") {
        assert.equal(
          await readFile(join(data, "external.mdx"), "utf8"),
          result?.result?.artifact?.content,
        );
        assert.equal(
          parseProblemMarkdown(result!.result!.artifact!.content).metadata
            .reviewStatus,
          metadata.reviewStatus,
        );
      }
      if (entry.input.operation === "audit-translations")
        for (const item of result!.result!.items)
          assert.ok(cli.stdout.includes(item.message));
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } finally {
    await rm(data, { recursive: true, force: true });
  }
});
