/* eslint-disable @typescript-eslint/no-explicit-any */

export const MAX_AGENT_CARD_BYTES = 1024 * 1024;

export function parseAgentCard(text: string): Record<string, any> {
  const card = JSON.parse(text);
  if (
    !card ||
    Array.isArray(card) ||
    typeof card.name !== "string" ||
    !Array.isArray(card.skills)
  ) {
    throw new Error("Invalid Agent Card.");
  }
  return card as Record<string, any>;
}

function validateCardUrl(url: URL): void {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Agent Card URL must use HTTP or HTTPS without embedded credentials.");
  }
}

/**
 * Fetch a public Agent Card without forwarding credentials or following
 * redirects. The response body is capped at 1 MiB while streaming so an
 * oversized card cannot exhaust memory. Works in browsers and Node.js 18+.
 */
export async function fetchAgentCard(url: URL, signal: AbortSignal): Promise<Record<string, any>> {
  validateCardUrl(url);
  const response = await fetch(url, {
    signal,
    credentials: "omit",
    headers: { Accept: "application/json" },
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Agent Card: HTTP ${response.status}`);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_AGENT_CARD_BYTES) {
    await response.body?.cancel();
    throw new Error("Agent Card exceeds 1 MiB.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Agent Card response is empty.");
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_AGENT_CARD_BYTES) throw new Error("Agent Card exceeds 1 MiB.");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return parseAgentCard(text);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
