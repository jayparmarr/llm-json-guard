import { describe, it, expect } from "vitest";
import { parseLLMJson } from "../src/index.js";

describe("parseLLMJson", () => {
  it("parses valid JSON without marking as repaired", () => {
    const res = parseLLMJson<{ status: string }>('{"status":"ok"}');
    expect(res).toEqual({ ok: true, data: { status: "ok" }, repaired: false });
  });

  it("extracts JSON wrapped in markdown fences and conversational text", () => {
    const raw = `Sure! Here is your data:\n\`\`\`json\n{"items": [1, 2, 3]}\n\`\`\`\nLet me know if you need more!`;
    const res = parseLLMJson<{ items: number[] }>(raw);
    expect(res).toEqual({ ok: true, data: { items: [1, 2, 3] }, repaired: true });
  });

  it("strips trailing commas in objects and arrays", () => {
    const raw = `{"tags": ["ai", "ts",], "active": true,}`;
    const res = parseLLMJson<{ tags: string[]; active: boolean }>(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual({ tags: ["ai", "ts"], active: true });
    }
  });

  it("repairs truncated JSON cut off mid-string or mid-object", () => {
    const raw = `{"title": "Report", "sections": [{"heading": "Intro", "body": "Hello wor`;
    const res = parseLLMJson<{ title: string; sections: Array<{ heading: string; body: string }> }>(raw);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.title).toBe("Report");
      expect(res.data.sections[0]?.body).toBe("Hello wor");
    }
  });

  it("returns structured failure for non-JSON strings", () => {
    const res = parseLLMJson("I cannot fulfill this request.");
    expect(res.ok).toBe(false);
  });
});