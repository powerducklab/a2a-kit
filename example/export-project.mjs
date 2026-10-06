// Generates a runnable A2A server project from the built package and writes it
// to disk, both as individual files and as a USTAR tar archive.
//
// Run from the package root after `npm run build`:
//   npm run build && node example/export-project.mjs

import { mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildA2AServerProject } from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "generated-a2a-server");

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const { files, archive } = buildA2AServerProject("Demo Agent");

for (const [name, content] of Object.entries(files)) {
  const target = resolve(out, name);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}
await writeFile(resolve(out, "powerduck-a2a-server.tar"), archive);

console.log(`Wrote ${Object.keys(files).length} project files and a tar archive to:`);
console.log(out);
console.log("Next: cd into the folder, set A2A_TOKEN and HANDLER_URL, then npm install && npm start.");
