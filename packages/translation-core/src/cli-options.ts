import { parseArgs } from "node:util";

export function cliOptions(args = process.argv.slice(2)) {
  // Token order preserves the existing first-value precedence for repeated flags.
  const parsed = parseArgs({
    args,
    strict: false,
    allowPositionals: true,
    tokens: true,
    options: {
      "data-dir": { type: "string" },
      problems: { type: "string" },
      "pages-only": { type: "boolean" },
      "problems-only": { type: "boolean" },
      refresh: { type: "boolean" },
      "verify-source": { type: "boolean" },
    },
  });
  const first = (name: string) => {
    const token = parsed.tokens.find(
      (token) => token.kind === "option" && token.name === name,
    );
    if (
      token?.kind === "option" &&
      (!token.value || token.value.startsWith("--"))
    )
      throw new Error(
        name === "data-dir"
          ? "--data-dir requires a path"
          : "--problems requires numbers or ranges",
      );
    return token?.kind === "option" ? token.value : undefined;
  };
  return {
    ...parsed.values,
    "data-dir": first("data-dir"),
    problems: first("problems"),
    positionals: parsed.positionals,
  };
}
