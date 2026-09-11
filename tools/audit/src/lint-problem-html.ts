import { cliContext } from "./operations/cli.ts";
import { checkProblems } from "./operations/problems.ts";
const result = await checkProblems(cliContext(), "lint", {
  // Input-format style is a local authoring rule, not a remote CI requirement.
  // Keep HTML syntax validation enabled in both environments.
  inputFormat: process.env.GITHUB_ACTIONS !== "true",
});
if (result.items.some((item) => item.status === "failed")) process.exitCode = 1;
