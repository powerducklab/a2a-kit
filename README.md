# @powerduck/a2a-kit

Isomorphic [Agent2Agent (A2A)](https://a2a-protocol.org/) toolkit for browsers and Node.js.
It provides the building blocks Powerduck uses for its A2A debug and design surface, as a
small dependency-free package (only [`jose`](https://github.com/panva/jose) for signature
verification):

- **Protocol helpers** for A2A **1.0** and **0.3** — method tables, request example builders,
  and strict JSON-RPC / REST / gRPC request validation.
- **Agent Card** parsing and bounded, credential-free discovery.
- **RFC 8785 canonicalization** (JSON Canonicalization Scheme) with A2A 1.0 field-presence rules.
- **Agent Card signature verification** against a pinned public JWKS (JWS, no `jku`/`x5u` trust).
- **Runnable server project generation** — produce a self-contained Node.js A2A server
  (JSON-RPC, REST/HTTP+JSON, and native gRPC) as a file map or a downloadable `.tar`, entirely
  in the browser.

Project home: [https://www.powerduck.com/](https://www.powerduck.com/)

## Install

```bash
npm install @powerduck/a2a-kit
```

The package ships ESM and CJS bundles plus TypeScript declarations. It runs in modern browsers
and Node.js 22.12+. The generated server project itself requires Node.js 22.12+.

## Build a request example

```ts
import { a2aExample, validateA2ARequest } from "@powerduck/a2a-kit";

// A2A 1.0 JSON-RPC envelope
const body = a2aExample();
// { jsonrpc: "2.0", id: "...", method: "SendMessage", params: { message: { ... } } }

validateA2ARequest(body, {});
// { version: "1.0", streaming: false }

// A2A 0.3 uses different method names, roles and part shapes
const legacy = a2aExample({ version: "0.3" });
validateA2ARequest(legacy, { version: "0.3" });

// REST (HTTP+JSON) and gRPC use a bare params object without the JSON-RPC envelope
const rest = a2aExample({ binding: "HTTP+JSON", method: "SendMessage" });
validateA2ARequest(rest, { binding: "HTTP+JSON", method: "SendMessage" });
```

`a2aExample` covers `SendMessage`, streaming methods, task lookup/cancellation and push
notification configuration. Versions are explicit — 1.0 and 0.3 are not wire compatible, and
0.3 only supports the JSON-RPC binding here.

## Fetch and verify an Agent Card

```ts
import { fetchAgentCard, verifyA2ACard } from "@powerduck/a2a-kit";

const controller = new AbortController();
const card = await fetchAgentCard(
  new URL("https://agent.example/.well-known/agent-card.json"),
  controller.signal,
);

// `trustedJwks` is a JWKS *you* distribute out of band. Keys served by the agent itself
// are not trusted. Only public asymmetric keys are accepted.
const result = await verifyA2ACard(card, trustedJwks);
// { kid: "rotating-key-3", algorithm: "ES256", canonical: "..." }
```

Discovery never sends cookies or credentials, never follows redirects, rejects credential-bearing
URLs, and caps the response at 1 MiB while streaming. Verification supports `ES256/384/512`,
`RS256`, `PS256` and `EdDSA`, accepts up to 16 rotating signatures (one trusted match is enough),
and fails closed on a modified card.

## Generate a runnable A2A server

The generated server is a thin, secure adapter in front of **your** business handler. It does not
invent responses or echo input.

### Browser

```ts
import { downloadA2AServer } from "@powerduck/a2a-kit";

downloadA2AServer("Acme Agent"); // triggers a "powerduck-a2a-server.tar" download
```

### Node.js

```js
import { buildA2AServerProject } from "@powerduck/a2a-kit";
import { writeFile } from "node:fs/promises";

const { files, archive } = buildA2AServerProject("Acme Agent");
// files: { "server.mjs", "canonicalize.mjs", "package.json", "agent-card.json", "README.md" }
await writeFile("powerduck-a2a-server.tar", archive);
```

A complete script is in [`example/export-project.mjs`](example/export-project.mjs):

```bash
npm run build
npm run example
```

Then run the generated project:

```bash
cd example/generated-a2a-server
export A2A_TOKEN="$(openssl rand -hex 32)"   # at least 32 characters
export HANDLER_URL="https://your-handler.example/"
npm install
npm start
```

The business handler receives `POST { message, contextId }` and must return an A2A 1.0 Message
with non-empty `parts`, for example `{ "parts": [{ "text": "Completed" }] }`.

The server exposes:

| Surface | Endpoint |
| --- | --- |
| Public discovery | `GET /.well-known/agent-card.json` |
| JSON-RPC | `POST /rpc` |
| REST / HTTP+JSON | `POST /rest/message:send`, `/rest/message:stream`, ... |
| Native gRPC | `A2AService` (insecure on loopback, TLS off-loopback) |

### Security defaults of the generated server

- A shared bearer token (`A2A_TOKEN`, at least 32 characters) is mandatory; comparison uses
  `crypto.timingSafeEqual`.
- Listeners bind to `127.0.0.1` by default. Non-loopback gRPC requires TLS certificate/key files;
  put HTTP behind an HTTPS reverse proxy with rate limiting.
- Browser CORS is an explicit opt-in via comma-separated `CORS_ORIGINS`; unknown origins get `403`.
- Handler responses are capped at 1 MiB; a handler must return non-empty parts.
- Optional `SIGNING_JWK_FILE` signs the Agent Card. Distribute the matching public JWKS through a
  trusted channel — never trust a key merely because the agent serves it.
- This is a **stateless message adapter**, not an autonomous model or persistent task engine.
  Streaming emits the final message; persistent tasks, remote cancellation and push notifications
  require your own executor and durable store, and no unsupported capability is advertised.

## API summary

| Export | Purpose |
| --- | --- |
| `A2A_METHODS` | Method name tables for A2A 1.0 and 0.3 |
| `a2aVersion(config)` | Validate/normalize version and binding |
| `a2aExample(config?)` | Build a version-correct request example |
| `validateA2ARequest(body, config)` | Strict request validation (`{ version, streaming }` or throw) |
| `isA2AStream(method)` | Whether a method uses an SSE/streaming binding |
| `a2aSavedConfig(config, endpoint, body)` | Persist an editable envelope only when it is valid |
| `DEFAULT_A2A_CONFIG` | Default endpoint, card URL, version, binding and method |
| `parseAgentCard(text)` | Parse and minimally validate an Agent Card |
| `fetchAgentCard(url, signal)` | Bounded, cookie-free public card discovery |
| `canonicalizeA2ACard(card, schema)` | RFC 8785 + A2A field-presence canonical form |
| `verifyA2ACard(card, jwksText)` | Verify a signed card against a pinned public JWKS |
| `buildA2AServerFiles(name?)` | Generated server project as a file map |
| `buildA2AServerProject(name?)` | `{ files, archive }` with a USTAR tar |
| `tarFiles(files)` | Dependency-free USTAR archive writer |
| `downloadA2AServer(name?)` | Browser-only tar download helper |
| `CARD_SCHEMA` | The pinned A2A 1.0 Agent Card descriptor |

## Security model

- Verification is **pinning based**: you supply the trusted JWKS. The library never fetches keys
  from `jku`, `x5u`, or a card-advertised URL, rejects symmetric (`oct`) and private keys,
  enforces unique `kid` values, and limits JWKS size.
- Canonicalization implements JCS property sorting and the A2A proto field-presence rules used
  for card signing, including rejection of lone UTF-16 surrogates and a 64-level depth cap.
- The generated server keeps secrets in environment variables only; nothing secret is embedded in
  the export.

## Development

```bash
npm install
npm test        # vitest
npm run build   # type-check (tsc) + bundle (tsup)
```

## License

MIT &copy; 2026 Powerduck limited. See [LICENSE](LICENSE).
