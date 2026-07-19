import { stripMarkdownFence } from "../_shared/strip-markdown-fence.ts"

export interface CaptionInput {
  tripName: string
  themeName: string | null
  categorySummary: string
  slideCount: number
}

// Writes a short Instagram caption with Claude Sonnet from the generation's
// content (trip + theme + the selected photos' category mix). Text-only — no
// per-photo vision this day.
export async function writeCaption(input: CaptionInput): Promise<string> {
  const themeClause = input.themeName ? ` with a ${input.themeName} mood` : ""
  const prompt =
    `Write a short, natural Instagram caption (1-2 sentences, at most one emoji, no hashtags) ` +
    `for a ${input.slideCount}-photo carousel from a trip called "${input.tripName}"${themeClause}. ` +
    `The photos are ${input.categorySummary}. Respond with ONLY the caption text — no quotes, no preamble.`

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 150,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    }),
  })
  if (!response.ok) throw new Error(`Anthropic request failed: ${response.status} ${await response.text()}`)
  const body = await response.json()
  const text = body.content?.[0]?.text
  if (!text) throw new Error(`Unexpected Anthropic response shape: ${JSON.stringify(body).slice(0, 300)}`)
  // Strip a stray code fence and any surrounding quotes the model may add.
  return stripMarkdownFence(text).trim().replace(/^["'“”]+|["'“”]+$/g, "").trim()
}
