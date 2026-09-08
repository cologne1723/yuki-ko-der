import { cliOptions } from "translation-core/cli-options";
import { cliContext } from "./operations/cli.ts";
import { checkProblems } from "./operations/problems.ts";
const result = await checkProblems(
  cliContext(),
  cliOptions()["verify-source"] ? "live" : "validate",
);
if (result.items.some((item) => item.status === "failed")) process.exitCode = 1;
