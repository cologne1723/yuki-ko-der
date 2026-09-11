import { spawn } from "node:child_process";
import { mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicFile } from "translation-core/atomic-file";
import { auditProblemPublicationData } from "../audit-problem-publication-data.ts";
import { collectRemainingOriginals } from "./remaining-originals.ts";
import { collectProblemRenderProfiles } from "./problem-render-profiles.ts";
import type { CollectionOptions } from "./paced-download.ts";
import type { OperationContext } from "./types.ts";

export interface LocalPublicationBuildResult {
  log: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error?: string;
  output?: string;
}

/** Invoke the build:problems entry point directly; no package install or deployment. */
export async function buildLocalProblemPublication(
  context: OperationContext,
): Promise<LocalPublicationBuildResult> {
  const reports = join(context.dataRoot, "reports");
  await mkdir(reports, { recursive: true });
  const log = join(reports, "ground-truth-publication-build.log");
  const file = await open(log, "w");
  let result: LocalPublicationBuildResult;
  try {
    result = await new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [
          "--import",
          import.meta.resolve("tsx"),
          join(
            context.repositoryRoot,
            "tools/audit/src/build-problem-translations.ts",
          ),
          "--data-dir",
          context.dataRoot,
        ],
        {
          cwd: context.repositoryRoot,
          stdio: ["ignore", file.fd, file.fd],
          signal: context.signal,
          timeout: 20 * 60 * 1000,
        },
      );
      let error: string | undefined;
      child.on("error", (cause) => {
        error = String(cause);
      });
      child.on("close", (exitCode, signal) =>
        resolve({ log, exitCode, signal, ...(error ? { error } : {}) }),
      );
    });
  } finally {
    await file.close();
  }
  if (result.exitCode !== 0 || result.error || result.signal)
    result.output = await readFile(log, "utf8");
  return result;
}

type Stage =
  | "remaining-originals"
  | "public-page-profiles"
  | "local-publication-build"
  | "publication-audit";
interface PipelineError {
  stage: Stage;
  message: string;
  problemNo?: string;
  details?: unknown;
}
interface PipelineState {
  phase: Stage | "complete" | "error";
  errors: PipelineError[];
  reviewRequired: number;
  stages: Partial<Record<Stage, unknown>>;
}
interface PipelineDependencies {
  originals: typeof collectRemainingOriginals;
  profiles: typeof collectProblemRenderProfiles;
  build: typeof buildLocalProblemPublication;
  audit: typeof auditProblemPublicationData;
}

/** Finish independent stages and aggregate failures, including audit after a failed build. */
export async function runGroundTruthPipeline(
  context: OperationContext,
  options: CollectionOptions & { refreshedSince: string },
  onStatus?: (state: PipelineState, report: string) => Promise<void>,
  dependencies: PipelineDependencies = {
    originals: collectRemainingOriginals,
    profiles: collectProblemRenderProfiles,
    build: buildLocalProblemPublication,
    audit: auditProblemPublicationData,
  },
) {
  const report = join(
    context.dataRoot,
    "reports",
    "ground-truth-pipeline.json",
  );
  await mkdir(join(context.dataRoot, "reports"), { recursive: true });
  const state: PipelineState = {
    phase: "remaining-originals",
    errors: [],
    reviewRequired: 0,
    stages: {},
  };
  const save = async () => {
    await atomicFile(
      report,
      JSON.stringify(
        { schemaVersion: 1, updatedAt: new Date().toISOString(), ...state },
        null,
        2,
      ) + "\n",
    );
    await onStatus?.(state, report);
  };
  const stage = async (name: Stage, work: () => Promise<void>) => {
    state.phase = name;
    await save();
    try {
      context.signal?.throwIfAborted();
      await work();
    } catch (error) {
      state.errors.push({ stage: name, message: String(error) });
    }
    await save();
  };
  for (const name of ["remaining-originals", "public-page-profiles"] as const) {
    await stage(name, async () => {
      const result =
        name === "remaining-originals"
          ? await dependencies.originals(context, options)
          : await dependencies.profiles(context, {
              ...options,
              fullCorpus: true,
            });
      state.stages[name] = {
        report: result.report,
        total: result.items.length,
      };
      for (const item of result.items) {
        if (item.status === "failed")
          state.errors.push({
            stage: name,
            problemNo: item.id,
            message: item.message,
            details: item.details,
          });
        if (item.status === "review-required") state.reviewRequired++;
      }
    });
  }
  await stage("local-publication-build", async () => {
    const result = await dependencies.build(context);
    state.stages["local-publication-build"] = result;
    if (result.exitCode !== 0 || result.signal || result.error)
      state.errors.push({
        stage: "local-publication-build",
        message:
          result.error ??
          `Local build failed (exit ${result.exitCode}, signal ${result.signal})`,
        details: result,
      });
  });
  await stage("publication-audit", async () => {
    const result = await dependencies.audit(context);
    state.stages["publication-audit"] = result;
    if (result.blockingErrors || result.invalidProfiles)
      state.errors.push({
        stage: "publication-audit",
        message: `${result.blockingErrors} publication blockers; ${result.invalidProfiles} invalid profiles`,
        details: result,
      });
  });
  state.phase = state.errors.length ? "error" : "complete";
  await save();
  return { ...state, report };
}
