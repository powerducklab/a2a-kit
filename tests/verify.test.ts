import { describe, it, expect } from "vitest";
import { generateKeyPair, exportJWK, FlattenedSign, base64url } from "jose";
import { verifyA2ACard } from "../src/verify";
import { canonicalizeA2ACard, type SchemaDescriptor } from "../src/canonicalize";
import { CARD_SCHEMA } from "../src/generated-assets";

const schema = CARD_SCHEMA as SchemaDescriptor;

const card = {
  name: "Signed Agent",
  description: "An agent with a signed card",
  version: "1.0.0",
  supportedInterfaces: [
    { url: "http://localhost:9999/rpc", protocolBinding: "JSONRPC", protocolVersion: "1.0" },
  ],
  capabilities: { streaming: true },
  defaultInputModes: ["text/plain"],
  defaultOutputModes: ["text/plain"],
  skills: [{ id: "handle-message", name: "Handle message", description: "d", tags: ["api"] }],
};

async function makeSignedCard(alg = "ES256") {
  const { privateKey, publicKey } = await generateKeyPair(alg, { extractable: true });
  const kid = "test-key";
  const publicJwk = { ...(await exportJWK(publicKey)), kid, alg, use: "sig" };
  const privateJwk = await exportJWK(privateKey);
  const canonical = canonicalizeA2ACard(card, schema);
  const signature = await new FlattenedSign(new TextEncoder().encode(canonical))
    .setProtectedHeader({ alg, kid, typ: "JOSE" })
    .sign(privateKey);
  const signedCard = { ...card, signatures: [signature] };
  return { signedCard, publicJwk, privateJwk, canonical };
}

describe("verifyA2ACard", () => {
  it("accepts a card signed by a trusted JWKS key", async () => {
    const { signedCard, publicJwk } = await makeSignedCard();
    const result = await verifyA2ACard(signedCard, JSON.stringify({ keys: [publicJwk] }));
    expect(result.kid).toBe("test-key");
    expect(result.algorithm).toBe("ES256");
  });

  it("rejects a tampered card", async () => {
    const { signedCard, publicJwk } = await makeSignedCard();
    const tampered = { ...signedCard, name: "Tampered" };
    await expect(
      verifyA2ACard(tampered, JSON.stringify({ keys: [publicJwk] })),
    ).rejects.toThrow(/modified|No signature/);
  });

  it("rejects a private JWK in the trusted set", async () => {
    const { signedCard, privateJwk } = await makeSignedCard();
    const privateWithKid = { ...privateJwk, kid: "test-key", alg: "ES256" };
    await expect(
      verifyA2ACard(signedCard, JSON.stringify({ keys: [privateWithKid] })),
    ).rejects.toThrow(/public asymmetric/);
  });

  it("rejects an unsigned card", async () => {
    await expect(verifyA2ACard(card, JSON.stringify({ keys: [] }))).rejects.toThrow(/unsigned/);
  });

  it("rejects an empty or malformed JWKS", async () => {
    const { signedCard } = await makeSignedCard();
    await expect(verifyA2ACard(signedCard, JSON.stringify({ keys: [] }))).rejects.toThrow(/JWKS/);
    await expect(verifyA2ACard(signedCard, "not json")).rejects.toThrow();
  });

  it("rejects duplicate kid values", async () => {
    const { signedCard, publicJwk } = await makeSignedCard();
    await expect(
      verifyA2ACard(signedCard, JSON.stringify({ keys: [publicJwk, publicJwk] })),
    ).rejects.toThrow(/unique kid/);
  });

  it("succeeds when one of several rotating signatures matches", async () => {
    const { signedCard, publicJwk, privateJwk } = await makeSignedCard();
    const other = await generateKeyPair("ES256", { extractable: true });
    const otherPublic = { ...(await exportJWK(other.publicKey)), kid: "other", alg: "ES256" };
    // Sign a different (wrong) canonical with the other key, then append the good one.
    const badSignature = await new FlattenedSign(
      new TextEncoder().encode(base64url.encode("different")),
    )
      .setProtectedHeader({ alg: "ES256", kid: "other", typ: "JOSE" })
      .sign(other.privateKey);
    const multi = { ...signedCard, signatures: [badSignature, signedCard.signatures[0]] };
    const result = await verifyA2ACard(
      multi,
      JSON.stringify({ keys: [otherPublic, publicJwk] }),
    );
    expect(result.kid).toBe("test-key");
    expect(privateJwk.d).toBeTruthy();
  });
});
