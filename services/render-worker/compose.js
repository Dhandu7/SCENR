import sharp from "sharp"

const OUTPUT_SIZE = 1080

// Day 4 render: center-crop to a 1080x1080 square, no watermark, no color grade.
// The theme LUT/palette transform is Days 7-9; there is deliberately no watermark
// (plan Global Constraints / project_scenr_monetization_no_watermark).
export async function composePost(imageBuffer) {
  return sharp(imageBuffer)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover", position: "attention" })
    .jpeg({ quality: 90 })
    .toBuffer()
}
