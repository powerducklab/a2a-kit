import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: true,
  sourcemap: false,
  clean: true,
  minify: "terser",
  terserOptions: {
    compress: {
      drop_console: false,
      drop_debugger: true,
    },
    mangle: true,
  },
  external: ["jose"],
  cjsInterop: true,
  banner: {
    js: `/**
 * @powerduck/a2a-kit
 * Isomorphic Agent2Agent (A2A) protocol, Agent Card and server toolkit.
 *
 * Copyright (c) 2026 Powerduck limited
 * Licensed under the MIT License.
 */`,
  },
});
