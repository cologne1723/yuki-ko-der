import { secureHeaders } from "hono/secure-headers";

// Preserve existing headers; isolation defaults would change snapshot iframe behavior.
export const reviewHeaders = secureHeaders({
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
  referrerPolicy: false,
  strictTransportSecurity: false,
  xContentTypeOptions: true,
  xDnsPrefetchControl: false,
  xDownloadOptions: false,
  xFrameOptions: false,
  xPermittedCrossDomainPolicies: false,
  xXssProtection: false,
  removePoweredBy: false,
});
