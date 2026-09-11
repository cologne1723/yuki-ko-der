// The component registry uses the Node spelling `global`. Give browser bundles
// a private registry rather than the host page's window.MathJax.
const environment = globalThis as unknown as {
  global?: object;
  __dirname?: string;
};
if (typeof environment.global === "undefined") environment.global = {};
// The v3 component loader evaluates its Node default before checking for a
// browser script. All components are bundled; this path is never fetched.
export const suppliedDirectory = typeof environment.__dirname === "undefined";
if (suppliedDirectory) environment.__dirname = "";
