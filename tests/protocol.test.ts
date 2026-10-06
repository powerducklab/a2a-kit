import { describe, it, expect } from "vitest";
import {
  A2A_METHODS,
  a2aExample,
  validateA2ARequest,
  isA2AStream,
  a2aVersion,
  a2aSavedConfig,
  DEFAULT_A2A_CONFIG,
} from "../src/protocol";

describe("A2A protocol examples", () => {
  it("creates distinct version-specific message envelopes and ids", () => {
    const current = a2aExample();
    const legacy = a2aExample({ version: "0.3" });

    expect(current.method).toBe("SendMessage");
    expect(current.params.message.role).toBe("ROLE_USER");
    expect(current.params.message.parts).toEqual([{ text: "Hello" }]);

    expect(legacy.method).toBe("message/send");
    expect(legacy.params.message.role).toBe("user");
    expect(legacy.params.message.kind).toBe("message");
    expect(legacy.params.message.parts).toEqual([{ kind: "text", text: "Hello" }]);

    expect(current.id).not.toBe(current.params.message.messageId);
    expect(validateA2ARequest(current, {})).toEqual({ version: "1.0", streaming: false });
    expect(() => validateA2ARequest(legacy, {})).toThrow(/Unknown A2A/);
  });

  it("validates a legacy envelope against a legacy config", () => {
    const legacy = a2aExample({ version: "0.3" });
    expect(validateA2ARequest(legacy, { version: "0.3" })).toEqual({
      version: "0.3",
      streaming: false,
    });
  });

  it("rejects unsupported bindings, batches, notifications and malformed params", () => {
    for (const body of [
      [],
      null,
      { jsonrpc: "2.0", method: "SendMessage", params: {} },
      { jsonrpc: "2.0", id: 1, method: "SendMessage", params: [] },
    ]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => validateA2ARequest(body as any, {})).toThrow();
    }
    expect(() => validateA2ARequest(a2aExample(), { binding: "GRPC" })).toThrow(
      /without a JSON-RPC envelope/,
    );
    expect(() => validateA2ARequest(a2aExample(), { version: "9.0" })).toThrow(/Unsupported/);
    expect(() => a2aVersion({ binding: "WEBSOCKET" })).toThrow(/Unknown A2A binding/);
    expect(() => a2aVersion({ version: "0.3", binding: "GRPC" })).toThrow(/JSON-RPC/);
  });

  it("emits a bare params object for REST/gRPC and validates it without an envelope", () => {
    const rest = a2aExample({ binding: "HTTP+JSON", method: "SendMessage" });
    expect(rest.jsonrpc).toBeUndefined();
    expect(rest.message.role).toBe("ROLE_USER");
    expect(
      validateA2ARequest(rest, { binding: "HTTP+JSON", method: "SendMessage" }),
    ).toEqual({ version: "1.0", streaming: false });
  });

  it("flags streaming methods across versions", () => {
    expect(isA2AStream("SendStreamingMessage")).toBe(true);
    expect(isA2AStream("tasks/resubscribe")).toBe(true);
    expect(isA2AStream("SendMessage")).toBe(false);
  });

  it("builds push-notification templates per method", () => {
    const create = a2aExample({ method: "CreateTaskPushNotificationConfig" });
    expect(create.params.url).toContain("notifications");
    const list = a2aExample({ method: "ListTaskPushNotificationConfigs" });
    expect(list.params).toEqual({ taskId: "" });
  });

  it("keeps a valid saved config and falls back on an invalid draft", () => {
    const body = JSON.stringify(a2aExample());
    const saved = a2aSavedConfig({ ...DEFAULT_A2A_CONFIG }, "http://x/", body);
    expect(saved.method).toBe("SendMessage");
    expect(saved.endpoint).toBe("http://x/");
    const invalid = a2aSavedConfig({ ...DEFAULT_A2A_CONFIG }, "http://x/", "not json");
    expect(invalid.example).toBeUndefined();
    expect(invalid.endpoint).toBe("http://x/");
  });

  it("exposes both method tables", () => {
    expect(A2A_METHODS["1.0"]).toContain("GetTask");
    expect(A2A_METHODS["0.3"]).toContain("tasks/get");
  });
});
