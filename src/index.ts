export interface ParseSuccess<T> {
  ok: true;
  data: T;
  repaired: boolean;
}

export interface ParseFailure {
  ok: false;
  error: string;
  raw: string;
}

export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

/**
 * Extracts and repairs malformed or truncated JSON from raw LLM text output.
 */
export function parseLLMJson<T = unknown>(input: string): ParseResult<T> {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "Input string is empty", raw: input };
  }

  // Fast path: already valid JSON
  try {
    return { ok: true, data: JSON.parse(trimmed) as T, repaired: false };
  } catch {
    // Proceed to extraction and repair
  }

  try {
    const extracted = extractJsonBlock(trimmed);
    const cleaned = repairJsonSyntax(extracted);
    const closed = autoCloseTruncated(cleaned);
    const parsed = JSON.parse(closed) as T;
    return { ok: true, data: parsed, repaired: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to repair JSON",
      raw: input,
    };
  }
}

function extractJsonBlock(text: string): string {
  // 1. Prefer fenced ```json ... ``` or ``` ... ``` blocks
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  // 2. Otherwise slice from first '{' or '['
  const firstObj = text.indexOf("{");
  const firstArr = text.indexOf("[");
  let start = -1;

  if (firstObj !== -1 && firstArr !== -1) {
    start = Math.min(firstObj, firstArr);
  } else {
    start = Math.max(firstObj, firstArr);
  }

  if (start === -1) return text;
  return text.slice(start).trim();
}

function repairJsonSyntax(text: string): string {
  let result = "";
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;

    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }

    if (char === "\\" && inString) {
      result += char;
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }

    // Escape raw newlines/tabs inside string literals
    if (inString) {
      if (char === "\n") {
        result += "\\n";
        continue;
      }
      if (char === "\r") {
        result += "\\r";
        continue;
      }
      if (char === "\t") {
        result += "\\t";
        continue;
      }
    }

    result += char;
  }

  // Strip trailing commas before closing brackets/braces
  return result.replace(/,\s*([}\]])/g, "$1");
}

function autoCloseTruncated(text: string): string {
  const stack: string[] = [];
  let inString = false;
  let escapeNext = false;
  let lastValidEnd = text.length;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;

    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === "\\" && inString) {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") stack.push("}");
    else if (char === "[") stack.push("]");
    else if (char === "}" || char === "]") {
      stack.pop();
      if (stack.length === 0) {
        lastValidEnd = i + 1;
        break;
      }
    }
  }

  // Trim trailing conversational text after root JSON closes
  let output = stack.length === 0 ? text.slice(0, lastValidEnd) : text;

  // Close dangling open string
  if (inString) {
    output += '"';
  }

  // Strip dangling colon, comma, or incomplete key at cutoff point
  output = output
    .replace(/,\s*"[^"]*"\s*:\s*$/, "")
    .replace(/:\s*$/, ": null")
    .replace(/,\s*$/, "");

  while (stack.length > 0) {
    output += stack.pop();
  }

  return output;
}