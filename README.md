# @jayparmarr/llm-json-guard

[![CI](https://github.com/jayparmarr/llm-json-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/jayparmarr/llm-json-guard/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@jayparmarr/llm-json-guard.svg)](https://www.npmjs.com/package/@jayparmarr/llm-json-guard)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Zero-dependency TypeScript parser that extracts, repairs, and safely parses malformed or truncated JSON from LLM outputs.

## Why?
LLMs frequently wrap JSON in Markdown fences, prepend conversational text, emit trailing commas, or truncate mid-object when hitting `max_tokens`. `@jayparmarr/llm-json-guard` repairs common syntax breakages before calling `JSON.parse`—without throwing unhandled exceptions.

## Install

```bash
npm install @jayparmarr/llm-json-guard
