import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "temp/**",
    // Exact, versioned upstream AudioWorklet artifacts; lint the typed adapters instead.
    "public/res/bandori/chart-simulator/signalsmith-stretch-1.3.2.mjs",
    // wasm-bindgen output; validate the generated code with the WASM binding tests.
    "src/lib/bandori/medley-wasm/pkg/bandori_medley.js",
  ]),
]);

export default eslintConfig;
