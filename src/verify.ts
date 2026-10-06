/* eslint-disable @typescript-eslint/no-explicit-any */
import { canonicalizeA2ACard, type SchemaDescriptor } from "./canonicalize";
import { CARD_SCHEMA } from "./generated-assets";

const schema = CARD_SCHEMA as SchemaDescriptor;

export interface CardVerification {
  kid: string;
  algorithm: string;
  canonical: string;
}

const ALLOWED_ALGORITHMS = ["ES256", "ES384", "ES512", "RS256", "PS256", "EdDSA"];
const PRIVATE_JWK_FIELDS = ["d", "p", "q", "dp", "dq", "qi", "oth", "k"];

/**
 * Verify a signed Agent Card against a pinned, user-supplied public JWKS.
 * Never follows untrusted jku/x5u/jwk headers.
 */
export async function verifyA2ACard(
  card: Record<string, any>,
  jwksText: string,
): Promise<CardVerification> {
  if (!Array.isArray(card.signatures) || card.signatures.length === 0) {
    throw new Error("Agent Card is unsigned.");
  }
  if (card.signatures.length > 16) throw new Error("Too many Agent Card signatures.");
  if (jwksText.length > 65536) throw new Error("Trusted JWKS exceeds 64 KiB.");

  const jwks = JSON.parse(jwksText);
  if (!jwks || !Array.isArray(jwks.keys) || !jwks.keys.length || jwks.keys.length > 32) {
    throw new Error("Provide a trusted public JWKS (1-32 keys).");
  }

  const seen = new Set<string>();
  for (const key of jwks.keys) {
    if (!key || typeof key.kid !== "string" || !key.kid || seen.has(key.kid)) {
      throw new Error("Trusted keys require unique kid values.");
    }
    if (key.kty === "oct" || PRIVATE_JWK_FIELDS.some((field) => field in key)) {
      throw new Error("Only public asymmetric keys are allowed.");
    }
    seen.add(key.kid);
  }

  const { decodeProtectedHeader, importJWK, flattenedVerify } = await import("jose");
  const canonical = canonicalizeA2ACard(card, schema);
  const bytes = new TextEncoder().encode(canonical);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const payload = btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  for (const signature of card.signatures) {
    try {
      if (typeof signature.protected !== "string" || typeof signature.signature !== "string") {
        continue;
      }
      const header = decodeProtectedHeader(signature);
      if (
        !header.alg ||
        !ALLOWED_ALGORITHMS.includes(header.alg) ||
        typeof header.kid !== "string" ||
        header.b64 === false
      ) {
        continue;
      }
      const key = jwks.keys.find((item: any) => item.kid === header.kid);
      if (
        !key ||
        (key.alg && key.alg !== header.alg) ||
        (key.use && key.use !== "sig") ||
        (key.key_ops && !key.key_ops.includes("verify"))
      ) {
        continue;
      }
      const imported = await importJWK(key, header.alg);
      await flattenedVerify({ ...signature, payload }, imported, { algorithms: ALLOWED_ALGORITHMS });
      return { kid: header.kid, algorithm: header.alg, canonical };
    } catch {
      // A card can carry several rotating signatures; one trusted signature is sufficient.
    }
  }
  throw new Error("No signature matches the trusted keys, or the Agent Card has been modified.");
}
