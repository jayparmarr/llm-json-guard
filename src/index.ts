export interface ParseOptions {
  /** Attempt to close unclosed brackets, braces, and strings from truncated LLM output. Default: true */
  repairTruncation?: boolean;
  /** Strip trailing commas before `}` or `]`. Default: true */
  stripTrailingCommas?: boolean;
  /** Normalize Python-style single-quoted strings and unquoted object keys. Default: true */
  normalizeQuotesAndKeys?: boolean;
}

export type ParseResult<T = unknown> =
  | {
      ok: true;
      data: T;
      repaired: boolean;
      rawExtracted: string;
    }
  | {
      ok: false;
      error: string;
      rawExtracted: string;
    };

/**
 * Structural schema interface compatible with Zod (`z.object(...)`) or custom validators
 * without adding any runtime dependency.
 */
export interface SafeSchema<T> {
  safeParse: (
    data: unknown
  ) =>
    | { success: true; data: T }
    | { success: false; error: { message?: string } | unknown };
}

/**
 * Extracts, repairs, and safely parses JSON from raw LLM text responses.
 */
export function parseLLMJson<T = unknown>(
  input: string,
  options: ParseOptions = {}
): ParseResult<T> {
  const {
    repairTruncation = true,
    stripTrailingCommas = true,
    normalizeQuotesAndKeys = true,
  } = options;

  if (!input || typeof input !== "string") {
    return { ok: false, error: "Input must be a non-empty string.", rawExtracted: "" };
  }

  const extracted = extractJsonCandidate(input);
  if (!extracted) {
    return { ok: false, error: "No JSON object or array found in input.", rawExtracted: "" };
  }

  // Fast path: already valid JSON
  try {
    const parsed = JSON.parse(extracted) as T;
    return { ok: true, data: parsed, repaired: false, rawExtracted: extracted };
  } catch {
    // Proceed to deterministic repair pipeline
  }

  let candidate = extracted;

  if (normalizeQuotesAndKeys) {
    candidate = normalizeLooseJson(candidate);
  }

  if (stripTrailingCommas) {
    candidate = removeTrailingCommas(candidate);
  }

  if (repairTruncation) {
    candidate = closeTruncatedJson(candidate);
    if (stripTrailingCommas) {
      candidate = removeTrailingCommas(candidate);
    }
  }

  try {
    const parsed = JSON.parse(candidate) as T;
    return { ok: true, data: parsed, repaired: true, rawExtracted: extracted };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to parse repaired JSON.",
      rawExtracted: extracted,
    };
  }
}

/**
 * Extracts, repairs, parses, and validates LLM JSON output against a schema
 * (such as a Zod schema or any object implementing `.safeParse()`).
 */
export function parseLLMJsonWithSchema<T>(
  input: string,
  schema: SafeSchema<T>,
  options: ParseOptions = {}
): ParseResult<T> {
  const parsed = parseLLMJson<unknown>(input, options);
  if (!parsed.ok) {
    return parsed;
  }

  const validation = schema.safeParse(parsed.data);
  if (!validation.success) {
    const errObj = validation.error as { message?: string } | undefined;
    return {
      ok: false,
      error: errObj?.message || "Parsed JSON failed schema validation.",
      rawExtracted: parsed.rawExtracted,
    };
  }

  return {
    ok: true,
    data: validation.data,
    repaired: parsed.repaired,
    rawExtracted: parsed.rawExtracted,
  };
}

/**
 * Parses incomplete/in-flight JSON chunks emitted during LLM token streaming.
 * Returns `null` until at least a partial object or array structure is recoverable.
 */
export function parseStreamingJson<T = unknown>(partialStream: string): T | null {
  const result = parseLLMJson<T>(partialStream, {
    repairTruncation: true,
    stripTrailingCommas: true,
    normalizeQuotesAndKeys: true,
  });
  return result.ok ? result.data : null;
}

function extractJsonCandidate(text: string): string {
  const trimmed = text.trim();

  const closedFenceMatch = trimmed.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (closedFenceMatch?.[1]) {
    return closedFenceMatch[1].trim();
  }

  const openFenceMatch = trimmed.match(/```(?:json|JSON)?\s*([\s\S]*)$/);
  if (openFenceMatch?.[1]) {
    return openFenceMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const firstBracket = trimmed.indexOf("[");

  let start = -1;
  if (firstBrace !== -1 && firstBracket !== -1) {
    start = Math.min(firstBrace, firstBracket);
  } else {
    start = Math.max(firstBrace, firstBracket);
  }

  if (start === -1) return "";

  const slice = trimmed.slice(start);

  const lastBrace = slice.lastIndexOf("}");
  const lastBracket = slice.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBracket);

  if (end !== -1 && isBalancedOutsideStrings(slice.slice(0, end + 1))) {
    return slice.slice(0, end + 1).trim();
  }

  return slice.trim();
}

function normalizeLooseJson(json: string): string {
  let out = "";
  let inDouble = false;
  let inSingle = false;
  let escape = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i]!;

    if (escape) {
      out += ch;
      escape = false;
      continue;
    }

    if (ch === "\\") {
      out += ch;
      escape = true;
      continue;
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      out += ch;
      continue;
    }

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      out += '"';
      continue;
    }

    if (inSingle && ch === '"') {
      out += '\\"';
      continue;
    }

    out += ch;
  }

  return out.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$-]*)(\s*:)/g, '$1"$2"$3');
}

function isBalancedOutsideStrings(str: string): boolean {
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") depth--;
    }
  }
  return depth === 0 && !inString;
}

function removeTrailingCommas(json: string): string {
  let result = "";
  let inString = false;
  let escape = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i]!;
    if (escape) {
      result += ch;
      escape = false;
      continue;
    }
    if (ch === "\\") {
      result += ch;
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }
    if (!inString && ch === ",") {
      let j = i + 1;
      while (j < json.length && /\s/.test(json[j]!)) j++;
      if (json[j] === "}" || json[j] === "]") {
        continue;
      }
    }
    result += ch;
  }
  return result;
}

function closeTruncatedJson(json: string): string {
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === "{") stack.push("}");
      else if (ch === "[") stack.push("]");
      else if ((ch === "}" || ch === "]") && stack.length > 0) {
        stack.pop();
      }
    }
  }

  let repaired = json.trimEnd();

  if (inString) {
    if (escape) repaired = repaired.slice(0, -1);
    repaired += '"';
  }

  repaired = repaired.replace(/[,:]\s*$/, "");

  while (stack.length > 0) {
    repaired += stack.pop();
  }

  return repaired;
}