function parseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export function anthropicResponseShape(response) {
  const content = Array.isArray(response?.content) ? response.content : []
  return {
    stop_reason: typeof response?.stop_reason === "string" ? response.stop_reason : null,
    content_block_types: content.map((block) =>
      block && typeof block.type === "string" ? block.type : "unknown"
    ),
    text_block_count: content.filter((block) => block?.type === "text").length,
    structured_block_count: content.filter((block) =>
      block?.type === "tool_use" || block?.type === "json"
    ).length,
  }
}

export function extractAnthropicStructuredOutput(response) {
  const content = Array.isArray(response?.content) ? response.content : []

  for (const block of content) {
    if (block?.type === "tool_use" && block.input && typeof block.input === "object") {
      return block.input
    }
    if (block?.type === "json") {
      const value = block.json ?? block.data ?? block.input
      if (value && typeof value === "object") return value
      if (typeof value === "string") {
        const parsed = parseJson(value.trim())
        if (parsed !== undefined) return parsed
      }
    }
  }

  const textBlocks = content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text.trim())
    .filter(Boolean)

  for (const text of textBlocks) {
    const parsed = parseJson(text)
    if (parsed !== undefined) return parsed
  }

  if (textBlocks.length > 1) {
    const parsed = parseJson(textBlocks.join(""))
    if (parsed !== undefined) return parsed
  }

  const shape = anthropicResponseShape(response)
  if (textBlocks.length) {
    throw new Error(
      `Anthropic structured output was not valid JSON (blocks=${shape.content_block_types.join(",") || "none"}; stop_reason=${shape.stop_reason || "unknown"}).`,
    )
  }
  throw new Error(
    `Anthropic returned no usable structured content (blocks=${shape.content_block_types.join(",") || "none"}; stop_reason=${shape.stop_reason || "unknown"}).`,
  )
}
