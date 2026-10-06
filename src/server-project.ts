import { tarFiles } from "./tar";
import { SERVER_TEMPLATE, CANONICALIZE_TEMPLATE, CARD_SCHEMA } from "./generated-assets";

export interface A2AServerProject {
  files: Record<string, string>;
  archive: Uint8Array;
}

const GENERATED_PACKAGE = {
  name: "powerduck-a2a-server",
  private: true,
  type: "module",
  engines: { node: ">=22" },
  scripts: { start: "node server.mjs" },
  dependencies: {
    "@a2a-js/sdk": "1.3.0",
    "@grpc/grpc-js": "1.14.5",
    "@bufbuild/protobuf": "2.10.2",
    express: "5.1.0",
    jose: "6.2.3",
  },
};

const GENERATED_README = `# Powerduck A2A server

Node 22+. Run npm install, configure environment variables, then npm start.

Required: A2A_TOKEN (random secret, at least 32 characters), HANDLER_URL. Optional: CORS_ORIGINS (comma-separated browser origins), HANDLER_TOKEN, PUBLIC_URL, HOST, PORT, GRPC_PORT, GRPC_PUBLIC_URL, TLS_CERT_FILE, TLS_KEY_FILE, SIGNING_JWK_FILE. Secrets are never embedded in this export.

The business handler receives POST {message, contextId} and returns an A2A 1.0 Message with nonempty parts. For example: {"parts":[{"text":"Completed"}]}. Implement and deploy your real business handler first. The generated server exposes JSON-RPC /rpc, REST /rest, and native gRPC, using one authenticated handler. Public discovery: /.well-known/agent-card.json.

This is a stateless message adapter, not an autonomous model or persistent task engine. Streaming emits the final message. Persistent tasks, remote cancellation and push notifications require a custom executor and durable store; no unsupported capability is advertised.

Local listeners default to 127.0.0.1. Use an HTTPS reverse proxy with rate limits for HTTP in production. Non-loopback gRPC requires certificate and private key files. Configure public interface addresses for your deployment. The shared bearer token represents a single client principal; integrate your identity provider before multi-user deployment.

Optional SIGNING_JWK_FILE signs the Agent Card. Distribute its public JWKS through a trusted channel; never trust a key simply because it is served by the agent. Review dependency advisories and lock resolved dependencies before deployment.
`;

function defaultAgentCard(name: string): Record<string, unknown> {
  return {
    name: name || "Powerduck Agent",
    description: "A2A adapter for an HTTP business handler",
    version: "1.0.0",
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: [
      {
        id: "handle-message",
        name: "Handle message",
        description: "Process a message using the configured business handler",
        tags: ["api"],
      },
    ],
  };
}

/** Build the file map of a runnable A2A server project. */
export function buildA2AServerFiles(name?: string): Record<string, string> {
  return {
    "server.mjs": SERVER_TEMPLATE,
    "canonicalize.mjs":
      CANONICALIZE_TEMPLATE + `\nexport const schema = ${JSON.stringify(CARD_SCHEMA)};\n`,
    "package.json": JSON.stringify(GENERATED_PACKAGE, null, 2),
    "agent-card.json": JSON.stringify(defaultAgentCard(name ?? ""), null, 2),
    "README.md": GENERATED_README,
  };
}

/** Build the file map and a USTAR archive ready to persist or download. */
export function buildA2AServerProject(name?: string): A2AServerProject {
  const files = buildA2AServerFiles(name);
  return { files, archive: tarFiles(files) };
}

/**
 * Browser-only helper: trigger a client download of the generated server
 * archive. Throws outside of a DOM environment so Node callers use
 * buildA2AServerProject instead.
 */
export function downloadA2AServer(
  name?: string,
  filename = "powerduck-a2a-server.tar",
): void {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") {
    throw new Error("downloadA2AServer requires a browser; use buildA2AServerProject in Node.");
  }
  const { archive } = buildA2AServerProject(name);
  const url = URL.createObjectURL(new Blob([archive as BlobPart], { type: "application/x-tar" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
