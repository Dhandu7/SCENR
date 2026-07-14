// scripts/theme-loader/index.js
import { createClient } from "@supabase/supabase-js"
import { SEED_QUERIES } from "./seed-queries.js"
import { harvestTheme, runApifyActor } from "./harvest.js"
import { extractFeatures, embedImage, tagImage } from "./extract-features.js"
import { aggregateFingerprint } from "./aggregate.js"

const MAX_ITEMS_PER_THEME = 80

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function processTheme(themeId, config) {
  console.log(`[${themeId}] harvesting up to ${MAX_ITEMS_PER_THEME} pins for "${config.query}"...`)
  const pins = await harvestTheme({ runApifyActor }, config.query, MAX_ITEMS_PER_THEME)
  console.log(`[${themeId}] harvested ${pins.length} unique pins with images`)

  const features = []
  for (const pin of pins) {
    const feature = await extractFeatures({ embedImage, tagImage }, pin)
    if (feature) features.push(feature)
  }
  console.log(`[${themeId}] extracted features for ${features.length}/${pins.length} pins`)

  if (features.length === 0) {
    console.warn(`[${themeId}] no usable features extracted, skipping upsert`)
    return
  }

  const fingerprint = aggregateFingerprint(themeId, config.displayName, features)
  const { error } = await supabase
    .from("theme_fingerprints")
    .upsert({ ...fingerprint, refreshed_at: new Date().toISOString() }, { onConflict: "theme_id" })

  if (error) {
    console.error(`[${themeId}] failed to upsert fingerprint: ${error.message}`)
    return
  }
  console.log(`[${themeId}] fingerprint saved (${fingerprint.sample_count} samples)`)
}

async function main() {
  for (const [themeId, config] of Object.entries(SEED_QUERIES)) {
    try {
      await processTheme(themeId, config)
    } catch (error) {
      console.error(`[${themeId}] failed: ${error.message}`)
    }
  }
}

main()
