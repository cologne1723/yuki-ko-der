import { cliContext } from "./operations/cli.ts";
import { checkProblems } from "./operations/problems.ts";
const result = await checkProblems(cliContext(), "lint");
if (result.items.some((item) => item.status === "failed")) process.exitCode = 1;
