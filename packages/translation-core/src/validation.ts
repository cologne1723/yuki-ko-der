import { z } from "zod";

// Extension CSP forbids dynamic code generation. Configure before creating schemas.
z.config({ jitless: true });
export { z };
