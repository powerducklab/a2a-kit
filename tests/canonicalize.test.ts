import { describe, it, expect } from "vitest";
import { canonicalizeA2ACard, type SchemaDescriptor } from "../src/canonicalize";
import { CARD_SCHEMA } from "../src/generated-assets";

const schema = CARD_SCHEMA as SchemaDescriptor;

const validCard = {
  name: "Demo Agent",
  description: "A demo A2A agent",
  version: "1.0.0",
  supportedInterfaces: [
    {
      url: "http://localhost:9999/rpc",
      protocolBinding: "JSONRPC",
      protocolVersion: "1.0",
    },
  ],
  capabilities: { streaming: true, pushNotifications: false },
  defaultInputModes: ["text/plain", "application/json"],
  defaultOutputModes: ["text/plain"],
  skills: [
    { id: "handle-message", name: "Handle message", description: "Process a message", tags: ["api"] },
  ],
};

describe("canonicalizeA2ACard", () => {
  it("produces JCS output with sorted keys", () => {
    const out = canonicalizeA2ACard(validCard, schema);
    const parsed = JSON.parse(out);
    expect(Object.keys(parsed)).toEqual(Object.keys(parsed).sort());
    expect(parsed.name).toBe("Demo Agent");
    expect(parsed.supportedInterfaces[0].protocolBinding).toBe("JSONRPC");
  });

  it("is deterministic regardless of input key order", () => {
    const shuffled = {
      skills: validCard.skills,
      defaultOutputModes: validCard.defaultOutputModes,
      defaultInputModes: validCard.defaultInputModes,
      capabilities: validCard.capabilities,
      supportedInterfaces: validCard.supportedInterfaces,
      version: validCard.version,
      description: validCard.description,
      name: validCard.name,
    };
    expect(canonicalizeA2ACard(shuffled, schema)).toBe(canonicalizeA2ACard(validCard, schema));
  });

  it("detects any field tampering", () => {
    expect(canonicalizeA2ACard({ ...validCard, name: "Tampered" }, schema)).not.toBe(
      canonicalizeA2ACard(validCard, schema),
    );
  });

  it("throws on missing required fields", () => {
    expect(() => canonicalizeA2ACard({ ...validCard, name: undefined }, schema)).toThrow(
      /Missing required Agent Card field: name/,
    );
    expect(() => canonicalizeA2ACard({ ...validCard, version: null }, schema)).toThrow(
      /Missing required Agent Card field: version/,
    );
  });

  it("honors explicit optional presence while omitting implicit default scalars", () => {
    const withPresence = canonicalizeA2ACard(
      {
        ...validCard,
        // documentationUrl/iconUrl are proto3 `optional` scalars: explicit presence
        // is retained, including the empty string and (elsewhere) false/zero.
        documentationUrl: "",
        iconUrl: "https://x/icon.png",
        supportedInterfaces: [
          // tenant is an implicit (non-optional) scalar, so an empty value is omitted.
          {
            url: "http://localhost:9999/rpc",
            protocolBinding: "JSONRPC",
            protocolVersion: "1.0",
            tenant: "",
          },
        ],
      },
      schema,
    );
    expect(withPresence).toContain('"documentationUrl":""');
    expect(withPresence).toContain("iconUrl");
    expect(withPresence).not.toContain("tenant");
  });

  it("omits empty non-required repeated and map collections", () => {
    const out = canonicalizeA2ACard({ ...validCard, securityRequirements: [] }, schema);
    expect(out).not.toContain("securityRequirements");
  });

  it("rejects wrong scalar types", () => {
    expect(() =>
      canonicalizeA2ACard({ ...validCard, supportedInterfaces: [{ url: 1 }] }, schema),
    ).toThrow();
  });

  it("rejects invalid Unicode surrogates", () => {
    expect(() => canonicalizeA2ACard({ ...validCard, name: "bad\uD800" }, schema)).toThrow(
      /Invalid Unicode/,
    );
  });

  it("canonicalizes nested security schemes", () => {
    const card = {
      ...validCard,
      securitySchemes: {
        bearer: { httpAuthSecurityScheme: { scheme: "Bearer" } },
      },
      securityRequirements: [{ schemes: { bearer: { list: [] } } }],
    };
    const out = JSON.parse(canonicalizeA2ACard(card, schema));
    expect(out.securitySchemes.bearer.httpAuthSecurityScheme.scheme).toBe("Bearer");
  });
});
