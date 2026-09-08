import { auditUiContexts } from "./operations/audit-ui-contexts.ts";
import { cliContext } from "./operations/cli.ts";
await auditUiContexts(cliContext());
