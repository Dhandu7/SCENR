export async function handleRender(deps, req) {
  const { source_url, upload_url } = req
  if (!source_url || !upload_url) return { status: 400, body: { success: false, error: "missing_fields" } }

  let sourceBuffer
  try {
    sourceBuffer = await deps.fetchImage(source_url)
  } catch (error) {
    return { status: 502, body: { success: false, error: `source_fetch_failed: ${error.message}` } }
  }

  let outputBuffer
  try {
    outputBuffer = await deps.compose(sourceBuffer)
  } catch (error) {
    return { status: 500, body: { success: false, error: `compose_failed: ${error.message}` } }
  }

  const uploaded = await deps.uploadImage(upload_url, outputBuffer)
  if (!uploaded) return { status: 502, body: { success: false, error: "upload_failed" } }
  return { status: 200, body: { success: true } }
}
