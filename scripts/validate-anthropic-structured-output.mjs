import assert from "node:assert/strict"
import {
  anthropicResponseShape,
  extractAnthropicStructuredOutput,
} from "../supabase/functions/_shared/anthropicStructuredOutput.mjs"

const expected = { document_type: "personal_audit", courses: [], requirements: [] }

assert.deepEqual(
  extractAnthropicStructuredOutput({
    content: [{ type: "tool_use", id: "tool-1", name: "structured_output", input: expected }],
    stop_reason: "tool_use",
  }),
  expected,
  "tool_use input must be accepted as structured output",
)

assert.deepEqual(
  extractAnthropicStructuredOutput({
    content: [
      { type: "thinking", thinking: "redacted" },
      { type: "text", text: '{"document_type":"personal_audit",' },
      { type: "text", text: '"courses":[],"requirements":[]}' },
    ],
    stop_reason: "end_turn",
  }),
  expected,
  "multiple text blocks must be combined before JSON validation",
)

assert.deepEqual(
  extractAnthropicStructuredOutput({
    content: [{ type: "text", text: "" }, { type: "text", text: JSON.stringify(expected) }],
  }),
  expected,
  "an empty text block must not hide a later valid result",
)

assert.throws(
  () => extractAnthropicStructuredOutput({ content: [{ type: "thinking" }], stop_reason: "end_turn" }),
  /no usable structured content.*blocks=thinking.*stop_reason=end_turn/,
)

assert.deepEqual(
  anthropicResponseShape({ content: [{ type: "tool_use", input: { secret: "not logged" } }] }),
  {
    stop_reason: null,
    content_block_types: ["tool_use"],
    text_block_count: 0,
    structured_block_count: 1,
    output_tokens: null,
  },
  "diagnostics must log shape metadata without response content",
)

console.log("Anthropic structured response parsing checks passed")
