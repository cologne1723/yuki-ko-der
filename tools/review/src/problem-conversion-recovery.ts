import { createHash } from "node:crypto";
import { readdir, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  atomicNewFile,
  optionalFile,
} from "translation-audit/operations/source-store";
import { ReviewError } from "translation-core/review-state";
export class ProblemConversionRecovery {
  constructor(
    private conversionDirectory: string,
    private paths: (problemNo: number) => {
      koreanHtml: string;
      koreanMdx: string;
    },
    readonly recoveryErrors: Map<number, string>,
  ) {}
  async recoverAll() {
    let names: string[];
    try {
      names = await readdir(this.conversionDirectory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const name of names.filter((name) => /^\d+\.json$/.test(name))) {
      const no = Number.parseInt(name);
      try {
        await this.recoverOne(no);
      } catch (error) {
        this.recoveryErrors.set(
          no,
          `Problem ${no} conversion needs inspection: ${String(error)}`,
        );
      }
    }
  }

  async recoverOne(problemNo: number) {
    const journal = join(this.conversionDirectory, `${problemNo}.json`);
    const backup = join(this.conversionDirectory, `${problemNo}.original.html`);
    const intent = JSON.parse(await readFile(journal, "utf8"));
    if (
      intent?.version !== 1 ||
      intent.problemNo !== problemNo ||
      !/^[a-f0-9]{64}$/.test(intent.originalHash ?? "") ||
      !/^[a-f0-9]{64}$/.test(intent.generatedHash ?? "")
    )
      throw new ReviewError("Invalid conversion recovery record", 409);
    const paths = this.paths(problemNo);
    const [original, generated, retained] = await Promise.all([
      optionalFile(paths.koreanHtml),
      optionalFile(paths.koreanMdx),
      optionalFile(backup),
    ]);
    const matches = (bytes: Uint8Array | undefined, expected: string) =>
      bytes !== undefined &&
      createHash("sha256").update(bytes).digest("hex") === expected;
    if (!generated && !retained && matches(original, intent.originalHash)) {
      await unlink(journal); // Interrupted before exclusive creation; legacy source remains authoritative.
      return;
    }
    if (
      !matches(generated, intent.generatedHash) ||
      (original && !matches(original, intent.originalHash)) ||
      (retained && !matches(retained, intent.originalHash)) ||
      (original && retained)
    )
      throw new ReviewError(
        "Conversion files changed; preserve and inspect the HTML, MDX and recovery copy",
        409,
      );
    if (original) {
      // Rename retains the exact displaced file, including an edit racing the earlier read.
      await rename(paths.koreanHtml, backup);
      const displaced = await readFile(backup);
      const latestGenerated = await optionalFile(paths.koreanMdx);
      if (
        !matches(displaced, intent.originalHash) ||
        !matches(latestGenerated, intent.generatedHash)
      ) {
        try {
          await atomicNewFile(paths.koreanHtml, displaced.toString());
          await unlink(backup);
        } catch {
          /* Never overwrite a concurrently recreated source; retain the recovery copy. */
        }
        throw new ReviewError(
          "Conversion files changed during recovery; inspect retained files",
          409,
        );
      }
    }
    if (await optionalFile(backup)) await unlink(backup);
    await unlink(journal);
    this.recoveryErrors.delete(problemNo);
  }
}
