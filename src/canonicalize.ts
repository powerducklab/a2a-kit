// RFC 8785 (JSON Canonicalization Scheme) with A2A 1.0 section 8.4.1 field
// presence. The descriptor is derived from the pinned v1.0.0 proto schema.

/* eslint-disable @typescript-eslint/no-explicit-any */

export type FieldMode = "repeated" | "map" | "optional";

export interface FieldDescriptor {
  type: string;
  required?: boolean;
  mode?: FieldMode;
}

export type SchemaDescriptor = Record<string, Record<string, FieldDescriptor>>;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function arbitrary(value: any, depth: number): any {
  if (depth > 64) throw new Error("Agent Card nesting exceeds 64.");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    // JCS rejects lone UTF-16 surrogates instead of signing a repaired string.
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(++i);
        if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("Invalid Unicode.");
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        throw new Error("Invalid Unicode.");
      }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => arbitrary(item, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, any> = Object.create(null);
    for (const key of Object.keys(value)) {
      arbitrary(key, depth + 1);
      out[key] = arbitrary(value[key], depth + 1);
    }
    return out;
  }
  throw new Error("Invalid JSON value in Agent Card.");
}

function normalize(value: any, type: string, depth: number, schema: SchemaDescriptor): any {
  if (depth > 64) throw new Error("Agent Card nesting exceeds 64.");
  if (type === "string" || type === "bool") {
    if (typeof value !== (type === "bool" ? "boolean" : "string")) {
      throw new Error("Invalid Agent Card field type.");
    }
    return arbitrary(value, depth);
  }
  if (type === "google.protobuf.Struct") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Expected object.");
    }
    return arbitrary(value, depth);
  }
  if (!schema[type] || !value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Agent Card object: " + type);
  }
  const result: Record<string, any> = Object.create(null);
  for (const [key, field] of Object.entries(schema[type])) {
    const item = value[key];
    if (item === undefined || item === null) {
      if (field.required) throw new Error("Missing required Agent Card field: " + key);
      continue;
    }
    if (field.mode === "repeated") {
      if (!Array.isArray(item)) throw new Error("Expected array: " + key);
      if (item.length || field.required) {
        result[key] = item.map((x) => normalize(x, field.type, depth + 1, schema));
      }
    } else if (field.mode === "map") {
      if (typeof item !== "object" || Array.isArray(item)) throw new Error("Expected map: " + key);
      if (Object.keys(item).length) {
        const map: Record<string, any> = Object.create(null);
        for (const [k, v] of Object.entries(item)) {
          arbitrary(k, depth + 1);
          map[k] = normalize(v, field.type, depth + 1, schema);
        }
        result[key] = map;
      }
    } else {
      const normalized = normalize(item, field.type, depth + 1, schema);
      if (
        field.required ||
        field.mode === "optional" ||
        (normalized !== "" && normalized !== false && normalized !== 0)
      ) {
        result[key] = normalized;
      }
    }
  }
  return result;
}

function jcs(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(jcs).join(",") + "]";
  return (
    "{" +
    Object.keys(value)
      .sort()
      .map((key) => JSON.stringify(key) + ":" + jcs((value as Record<string, JsonValue>)[key]))
      .join(",") +
    "}"
  );
}

export function canonicalizeA2ACard(card: unknown, schema: SchemaDescriptor): string {
  return jcs(normalize(card, "AgentCard", 0, schema) as JsonValue);
}
