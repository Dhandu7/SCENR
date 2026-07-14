export const CONTENT_CATEGORIES = [
  "solo_portrait",
  "group",
  "scenery",
  "food",
  "action_fit",
  "candid_funny",
]

export async function extractFeatures(deps, pin) {
  let embedding
  try {
    embedding = await deps.embedImage(pin.imageUrl)
  } catch (error) {
    console.warn(`skipping pin ${pin.id}: embedding failed: ${error.message}`)
    return null
  }

  let tag
  try {
    tag = await deps.tagImage(pin.imageUrl)
  } catch (error) {
    console.warn(`skipping pin ${pin.id}: tagging failed: ${error.message}`)
    return null
  }

  if (!CONTENT_CATEGORIES.includes(tag.category)) {
    console.warn(`skipping pin ${pin.id}: unrecognized category "${tag.category}"`)
    return null
  }

  return {
    id: pin.id,
    embedding,
    category: tag.category,
    palette: tag.palette ?? [],
    description: tag.description ?? "",
  }
}

export async function embedImage(imageUrl) {
  const response = await fetch("https://api.voyageai.com/v1/multimodalembeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: [{ content: [{ type: "image_url", image_url: imageUrl }] }],
      model: "voyage-multimodal-3",
    }),
  })
  if (!response.ok) {
    throw new Error(`Voyage request failed: ${response.status} ${await response.text()}`)
  }
  const body = await response.json()
  const embedding = body.data?.[0]?.embedding
  if (!Array.isArray(embedding)) {
    throw new Error(`Unexpected Voyage response shape: ${JSON.stringify(body).slice(0, 500)}`)
  }
  return embedding
}

export async function tagImage(imageUrl) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: imageUrl } },
            {
              type: "text",
              text:
                'Classify the main subject of this photo into exactly one category: solo_portrait, group, scenery, food, action_fit, or candid_funny. Then provide up to 3 short palette/tone descriptors (e.g. "warm amber", "soft pastel blue") and a note (under 20 words) on lighting and composition. Respond with ONLY a JSON object: {"category": "...", "palette": ["...", "..."], "description": "..."}. No other text.',
            },
          ],
        },
      ],
    }),
  })
  if (!response.ok) {
    throw new Error(`Anthropic request failed: ${response.status} ${await response.text()}`)
  }
  const body = await response.json()
  const text = body.content?.[0]?.text
  if (!text) {
    throw new Error(`Unexpected Anthropic response shape: ${JSON.stringify(body).slice(0, 500)}`)
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`Could not parse tag response as JSON: ${error.message}. Raw text: ${text.slice(0, 500)}`)
  }
}
