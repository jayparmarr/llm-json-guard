# @jayparmarr/llm-json-guard

[![npm version](https://img.shields.io/npm/v/@jayparmarr/llm-json-guard.svg)](https://www.npmjs.com/package/@jayparmarr/llm-json-guard)
[![CI](https://github.com/jayparmarr/llm-json-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/jayparmarr/llm-json-guard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

Zero-dependency TypeScript utility that extracts, repairs, and safely parses malformed, streaming, or truncated JSON from LLM responses.

## Why?

LLMs frequently return JSON wrapped in conversational text, fenced in markdown blocks, formatted with Python-style single quotes or unquoted keys, containing trailing commas, or cut off mid-token when `max_tokens` is reached. `@jayparmarr/llm-json-guard` deterministically recovers valid typed objects in under 2 kB gzipped with zero runtime dependencies.

## Installation

```bash
npm install @jayparmarr/llm-json-guard