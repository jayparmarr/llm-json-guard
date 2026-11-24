import { describe, expect, it } from "vitest";
import { parseLLMJson, parseLLMJsonWithSchema, parseStreamingJson } from "../src/index.js";

describe("parseLLMJson", () => {
  it("parses valid JSON without marking as repaired", () => {
    const res = parseLLMJson<{ ok: boolean }>('{"ok": true}');
    expect(res).toEqual({
      ok: true,
      data: { ok: true },
      repaired: false,
      rawExtracted: '{"ok": true}',
    });
  });

  it("extracts JSON wrapped in markdown fences and conversational text", () => {
    const raw = `Sure! Here is the structured response:\n\`\`\`json\n{"user": "Ada", "roles": ["admin", "dev"]}\n\`\`\`\nHope this helps!`;
    const res = parseLLMJson<{ user: string; roles: string[] }>(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual({ user: "Ada", roles: ["admin", "dev"] });
      expect(res.repaired).toBe(false);
    }
  });

  it("strips trailing commas in objects and arrays", () => {
    const raw = `{"items": [1, 2, 3,], "active": true,}`;
    const res = parseLLMJson<{ items: number[]; active: boolean }>(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual({ items: [1, 2, 3], active: true });
      expect(res.repaired).toBe(true);
    }
  });

  it("repairs truncated JSON cut off mid-string or mid-object", () => {
    const raw = `\`\`\`json\n{"title": "Quarterly Report", "tags": ["finance", "q3`;
    const res = parseLLMJson<{ title: string; tags: string[] }>(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual({ title: "Quarterly Report", tags: ["finance", "q3"] });
      expect(res.repaired).toBe(true);
    }
  });

  it("normalizes Python-style single quotes and unquoted keys", () => {
    const raw = `{status: 'ok', message: 'User "Ada" logged in', count: 3}`;
    const res = parseLLMJson<{ status: string; message: string; count: number }>(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual({
        status: "ok",
        message: 'User "Ada" logged in',
        count: 3,
      });
      expect(res.repaired).toBe(true);
    }
  });

  it("returns structured failure for non-JSON strings", () => {
    const res = parseLLMJson("I cannot fulfill this request.");
    expect(res.ok).toBe(false);
  });
});

describe("parseStreamingJson", () => {
  it("parses incomplete streaming chunks progressively", () => {
    expect(parseStreamingJson("Sure, here is the data: ")).toBeNull();

    const chunk1 = parseStreamingJson<{ name: string; items?: string[] }>(
      '```json\n{"name": "Project A", "items": ["step 1'
    );
    expect(chunk1).toEqual({ name: "Project A", items: ["step 1"] });

    const chunk2 = parseStreamingJson<{ name: string; items: string[] }>(
      '```json\n{"name": "Project A", "items": ["step 1", "step 2"]}'
    );
    expect(chunk2).toEqual({ name: "Project A", items: ["step 1", "step 2"] });
  });
});

describe("parseLLMJsonWithSchema", () => {
  const userSchema = {
    safeParse(data: unknown) {
      if (
        typeof data === "object" &&
        data !== null &&
        typeof (data as { name?: unknown }).name === "string" &&
        typeof (data as { age?: unknown }).age === "number"
      ) {
        return { success: true as const, data: data as { name: string; age: number } };
      }
      return { success: false as const, error: { message: "Expected { name: string, age: number }" } };
    },
  };

  it("validates repaired JSON against a schema", () => {
    const res = parseLLMJsonWithSchema(`{name: 'Ada', age: 36,`, userSchema);
    expect(res).toEqual({
      ok: true,
      data: { name: "Ada", age: 36 },
      repaired: true,
      rawExtracted: `{name: 'Ada', age: 36,`,
    });
  });

  it("returns ok: false when schema validation fails", () => {
    const res = parseLLMJsonWithSchema(`{"name": "Ada", "age": "thirty-six"}`, userSchema);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("Expected { name: string, age: number }");
    }
  });
});