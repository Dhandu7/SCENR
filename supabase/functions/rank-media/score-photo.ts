import { stripMarkdownFence } from "../_shared/strip-markdown-fence.ts"

export interface PhotoScore {
  quality_score: number
  content_category: string
}

export async function scorePhoto(imageUrl: string): Promise<PhotoScore> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: imageUrl } },
            {
              type: "text",
              text:
                "Rate this photo's quality as a shareable social media photo on a 0-100 scale " +
                "(sharpness, framing, lighting, subject appeal). Then classify its main subject " +
                "into exactly one category: solo_portrait, group, scenery, food, action_fit, or " +
                'candid_funny. Respond with ONLY a JSON object: {"quality_score": <integer 0-100>, ' +
                '"category": "..."}. No other text.',
            },
          ],
        },
      ],
    }),
  })
  if (!response.ok) throw new Error(`Anthropic request failed: ${response.status} ${await response.text()}`)
  const body = await response.json()
  const text = body.content?.[0]?.text
  if (!text) throw new Error(`Unexpected Anthropic response shape: ${JSON.stringify(body).slice(0, 500)}`)
  const parsed = JSON.parse(stripMarkdownFence(text))
  return { quality_score: Number(parsed.quality_score), content_category: parsed.category }
}
