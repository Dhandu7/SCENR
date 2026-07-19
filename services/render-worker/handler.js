// providedSecret is whatever the caller sent (e.g. an x-render-worker-secret header).
// If deps.expectedSecret is unset, the check is skipped entirely — local /run testing
// never needs a secret configured. Once hosted publicly, generate sends the real
// secret and render-worker rejects anyone else (otherwise it's an open fetch relay).
export async function handleRender(deps, req, providedSecret) {
  if (deps.expectedSecret && providedSecret !== deps.expectedSecret) {
    return { status: 401, body: { success: false, error: "unauthorized" } }
  }

  const { source_url, upload_url, grade } = req
  if (!source_url || !upload_url) return { status: 400, body: { success: false, error: "missing_fields" } }

  let sourceBuffer
  try {
    sourceBuffer = await deps.fetchImage(source_url)
  } catch (error) {
    return { status: 502, body: { success: false, error: `source_fetch_failed: ${error.message}` } }
  }

  let outputBuffer
  try {
    outputBuffer = await deps.compose(sourceBuffer, grade)
  } catch (error) {
    return { status: 500, body: { success: false, error: `compose_failed: ${error.message}` } }
  }

  const uploaded = await deps.uploadImage(upload_url, outputBuffer)
  if (!uploaded) return { status: 502, body: { success: false, error: "upload_failed" } }
  return { status: 200, body: { success: true } }
}
