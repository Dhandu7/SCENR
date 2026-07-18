import sharp from "sharp"

const OUTPUT_SIZE = 1080

// Crop to a 1080x1080 square (content-aware "attention" crop), then optionally apply a
// theme color grade: a brightness/saturation modulate plus a low-alpha solid-color
// overlay (the "wash" that gives a theme its tone). No watermark. `grade` is supplied
// by the caller — render-worker stays generic and knows nothing about theme names.
export async function composePost(imageBuffer, grade) {
  let img = sharp(imageBuffer).resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover", position: "attention" })

  if (grade) {
    img = img.modulate({ brightness: grade.brightness, saturation: grade.saturation })
    if (grade.overlay) {
      const { r, g, b, alpha } = grade.overlay
      img = img.composite([
        {
          input: { create: { width: OUTPUT_SIZE, height: OUTPUT_SIZE, channels: 4, background: { r, g, b, alpha } } },
          blend: "over",
        },
      ])
    }
  }

  return img.jpeg({ quality: 90 }).toBuffer()
}
