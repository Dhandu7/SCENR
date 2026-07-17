import { corsHeaders } from "./cors.ts"

export interface JsonResult {
  status: number
  body: Record<string, unknown>
}

// Shared request envelope for the JSON edge functions: handles the CORS
// preflight, the POST-only method guard, body parsing, and wrapping the
// handler's {status, body} result in a Response. Each function supplies only
// its own body→handler adapter. The raw `req` is passed as a second argument
// for handlers that need the request headers (e.g. to build an RLS-scoped
// client from the Authorization header); handlers that only need the body can
// ignore it.
export function serveJson<T = Record<string, unknown>>(
  handler: (body: T, req: Request) => Promise<JsonResult>,
): void {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders })
    }
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const body = (await req.json().catch(() => ({}))) as T
    const result = await handler(body, req)

    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  })
}
