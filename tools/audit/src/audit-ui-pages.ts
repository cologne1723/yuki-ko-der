import { auditUiPages } from "./operations/audit-ui-pages.ts";
import { cliContext } from "./operations/cli.ts";
await auditUiPages(cliContext());
