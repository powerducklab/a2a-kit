import { describe, it, expect } from "vitest";
import {
  buildA2AServerFiles,
  buildA2AServerProject,
  downloadA2AServer,
} from "../src/server-project";
import { tarFiles } from "../src/tar";

const decoder = new TextDecoder();

// Minimal, dependency-free USTAR reader used only to assert archive integrity.
function parseTar(archive: Uint8Array): Record<string, string> {
  const files: Record<string, string> = {};
  let offset = 0;
  while (offset + 512 <= archive.length) {
    const header = archive.slice(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;

    const magic = decoder.decode(header.slice(257, 263));
    expect(magic).toBe("ustar\0");

    const name = decoder.decode(header.slice(0, 100)).replace(/\0.*$/, "");
    const size = parseInt(decoder.decode(header.slice(124, 136)).trim(), 8);
    const recordedChecksum = parseInt(decoder.decode(header.slice(148, 156)).trim(), 8);

    let checksum = 0;
    for (let i = 0; i < 512; i++) {
      checksum += i >= 148 && i < 156 ? 0x20 : header[i];
    }
    expect(recordedChecksum).toBe(checksum);

    const dataStart = offset + 512;
    files[name] = decoder.decode(archive.slice(dataStart, dataStart + size));
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return files;
}

describe("A2A server project generator", () => {
  it("builds the five expected project files", () => {
    const files = buildA2AServerFiles("Acme Agent");
    expect(Object.keys(files).sort()).toEqual(
      ["README.md", "agent-card.json", "canonicalize.mjs", "package.json", "server.mjs"].sort(),
    );
  });

  it("uses the provided agent name and a valid package manifest", () => {
    const files = buildA2AServerFiles("Acme Agent");
    const card = JSON.parse(files["agent-card.json"]);
    expect(card.name).toBe("Acme Agent");
    expect(card.skills[0].id).toBe("handle-message");

    const manifest = JSON.parse(files["package.json"]);
    expect(manifest.private).toBe(true);
    expect(manifest.type).toBe("module");
    expect(manifest.dependencies["@a2a-js/sdk"]).toBe("1.3.0");
    expect(manifest.dependencies.express).toBe("5.1.0");
    expect(manifest.engines.node).toBe(">=22");
  });

  it("defaults the agent name when omitted", () => {
    const card = JSON.parse(buildA2AServerFiles()["agent-card.json"]);
    expect(card.name).toBe("Powerduck Agent");
  });

  it("embeds the canonicalizer, schema descriptor and server template", () => {
    const files = buildA2AServerFiles();
    expect(files["canonicalize.mjs"]).toContain("canonicalizeA2ACard");
    expect(files["canonicalize.mjs"]).toContain("export const schema =");
    expect(files["canonicalize.mjs"]).toContain('"AgentCard"');
    expect(files["server.mjs"]).toContain("jsonRpcHandler");
    expect(files["server.mjs"]).toContain("restHandler");
    expect(files["server.mjs"]).toContain("grpcService");
  });

  it("produces a USTAR archive that round-trips every file", () => {
    const { files, archive } = buildA2AServerProject("Round Trip");
    expect(archive).toBeInstanceOf(Uint8Array);
    const parsed = parseTar(archive);
    expect(parsed).toEqual(files);
  });

  it("tarFiles pads entries and terminates with two zero blocks", () => {
    const archive = tarFiles({ "a.txt": "hello", "dir/b.txt": "x".repeat(600) });
    // 2 headers + data blocks (512 + 1024 for 600 bytes) + 1024 trailer
    expect(archive.length).toBe(512 + 512 + 512 + 1024 + 1024);
    const trailer = archive.slice(archive.length - 1024);
    expect(trailer.every((byte) => byte === 0)).toBe(true);
  });

  it("refuses the browser download helper outside a DOM environment", () => {
    expect(() => downloadA2AServer("X")).toThrow(/browser/);
  });
});
