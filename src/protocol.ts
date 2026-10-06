// A2A JSON-RPC binding. Versions are explicit: 1.0 and 0.3 are not wire compatible.

let requestSequence = 0;

function uniqueId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `a2a-${Date.now()}-${++requestSequence}-${Math.random().toString(36).slice(2)}`;
}

export const A2A_METHODS = {
  "1.0": [
    "SendMessage",
    "SendStreamingMessage",
    "GetTask",
    "ListTasks",
    "CancelTask",
    "SubscribeToTask",
    "GetExtendedAgentCard",
    "CreateTaskPushNotificationConfig",
    "GetTaskPushNotificationConfig",
    "ListTaskPushNotificationConfigs",
    "DeleteTaskPushNotificationConfig",
  ],
  "0.3": [
    "message/send",
    "message/stream",
    "tasks/get",
    "tasks/cancel",
    "tasks/resubscribe",
    "agent/getAuthenticatedExtendedCard",
    "tasks/pushNotificationConfig/set",
    "tasks/pushNotificationConfig/get",
    "tasks/pushNotificationConfig/list",
    "tasks/pushNotificationConfig/delete",
  ],
} as const;

export type A2AVersion = keyof typeof A2A_METHODS;
export type A2ABinding = "JSONRPC" | "HTTP+JSON" | "GRPC";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type A2AConfig = Record<string, any>;

export function a2aVersion(config: A2AConfig): A2AVersion {
  const version = config.version ?? "1.0";
  if (version !== "1.0" && version !== "0.3") {
    throw new Error(`Unsupported A2A version: ${version}`);
  }
  if (config.binding && !["JSONRPC", "HTTP+JSON", "GRPC"].includes(config.binding)) {
    throw new Error("Unknown A2A binding.");
  }
  if (version === "0.3" && config.binding && config.binding !== "JSONRPC") {
    throw new Error("A2A 0.3 supports JSON-RPC here. Select A2A 1.0 for REST/gRPC.");
  }
  return version;
}

export function isA2AStream(method: unknown): boolean {
  return [
    "SendStreamingMessage",
    "SubscribeToTask",
    "message/stream",
    "tasks/resubscribe",
  ].includes(String(method));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function a2aExample(config: A2AConfig = {}): any {
  const version = a2aVersion(config);
  const method = config.method || A2A_METHODS[version][0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let params: Record<string, any> = {};
  if (
    ["SendMessage", "SendStreamingMessage", "message/send", "message/stream"].includes(method)
  ) {
    params = {
      message: {
        messageId: uniqueId(),
        role: version === "1.0" ? "ROLE_USER" : "user",
        parts: [
          version === "1.0"
            ? { text: "Hello" }
            : { kind: "text", text: "Hello" },
        ],
        ...(version === "0.3" ? { kind: "message" } : {}),
      },
    };
  } else if (
    ["GetTask", "CancelTask", "SubscribeToTask", "tasks/get", "tasks/cancel", "tasks/resubscribe"].includes(method)
  ) {
    params = { id: "" };
  }
  if (version === "1.0" && method.includes("PushNotificationConfig")) {
    params =
      method === "CreateTaskPushNotificationConfig"
        ? { taskId: "", id: "", url: "https://your-callback.example/notifications" }
        : method === "ListTaskPushNotificationConfigs"
          ? { taskId: "" }
          : { taskId: "", id: "" };
  }
  return config.binding && config.binding !== "JSONRPC"
    ? params
    : { jsonrpc: "2.0", id: uniqueId(), method, params };
}

export function validateA2ARequest(
  body: unknown,
  config: A2AConfig,
): { version: A2AVersion; streaming: boolean } {
  const version = a2aVersion(config);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const value = body as Record<string, any>;
  if (config.binding && config.binding !== "JSONRPC") {
    if (!value || typeof value !== "object" || Array.isArray(value) || "jsonrpc" in value) {
      throw new Error(
        "REST/gRPC requires a request object, without a JSON-RPC envelope. Generate a request body template when switching bindings.",
      );
    }
    if (!(A2A_METHODS[version] as readonly string[]).includes(config.method)) {
      throw new Error(`Unknown A2A method: ${config.method}`);
    }
    return { version, streaming: isA2AStream(config.method) };
  }
  if (
    !value ||
    Array.isArray(value) ||
    value.jsonrpc !== "2.0" ||
    !["string", "number"].includes(typeof value.id) ||
    !value.params ||
    typeof value.params !== "object" ||
    Array.isArray(value.params)
  ) {
    throw new Error("A2A requires a JSON-RPC 2.0 object with an id and object params.");
  }
  if (!(A2A_METHODS[version] as readonly string[]).includes(value.method)) {
    throw new Error(`Unknown A2A ${version} method: ${value.method}`);
  }
  return { version, streaming: isA2AStream(value.method) };
}

export const DEFAULT_A2A_CONFIG = {
  version: "1.0",
  binding: "JSONRPC",
  endpoint: "http://localhost:9999/",
  agentCardUrl: "http://localhost:9999/.well-known/agent-card.json",
  method: "SendMessage",
};

/** Publish the exact editable envelope, without treating an invalid draft as a contract. */
export function a2aSavedConfig(config: A2AConfig, endpoint: string, body: string): A2AConfig {
  const next = { ...config, endpoint };
  try {
    const example = JSON.parse(body);
    validateA2ARequest(example, config);
    return {
      ...next,
      method: config.binding && config.binding !== "JSONRPC" ? config.method : example.method,
      example,
    };
  } catch {
    return next;
  }
}
