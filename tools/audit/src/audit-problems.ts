import { cliContext } from "./operations/cli.ts";
import { checkProblems } from "./operations/problems.ts";
const result = await checkProblems(cliContext(), "audit");
console.log(
  `${result.items.length} problems audited; report: ${result.report}`,
);
if (result.items.some((item) => item.status === "failed")) process.exitCode = 1;
