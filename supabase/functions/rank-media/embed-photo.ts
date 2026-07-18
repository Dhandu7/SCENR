// Voyage multimodal embedding of a photo — the SAME model the theme-loader used to
// build theme_fingerprints.centroid_vec, so a photo's vector and a theme's centroid
// live in one space and their cosine similarity is a meaningful "how on-theme" score.
// Voyage fetches the image by URL (unaffected by robots.txt, unlike Anthropic).
export async function embedPhoto(imageUrl: string): Promise<number[]> {
  const response = await fetch("https://api.voyageai.com/v1/multimodalembeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("VOYAGE_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: [{ content: [{ type: "image_url", image_url: imageUrl }] }],
      model: "voyage-multimodal-3",
    }),
  })
  if (!response.ok) throw new Error(`Voyage request failed: ${response.status} ${await response.text()}`)
  const body = await response.json()
  const embedding = body.data?.[0]?.embedding
  if (!Array.isArray(embedding)) {
    throw new Error(`Unexpected Voyage response shape: ${JSON.stringify(body).slice(0, 300)}`)
  }
  return embedding as number[]
}
