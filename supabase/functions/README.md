# Supabase Edge Functions

Shared code lives in `_shared/` as a **sibling** of each function directory (the standard Supabase convention). Locally, `deno test` resolves this correctly via `../_shared/...` imports, since `_shared/` really is one level up from each function's own directory on disk.

## Deploying via the Supabase MCP `deploy_edge_function` tool

This tool bundles each function in isolation — the `files` array you pass becomes that function's entire deployment root, with no access to anything outside it (no `../` escape). To include shared code, you must:

1. Read `_shared/content-types.ts` and `_shared/cors.ts` from disk.
2. Include them in the `files` array **nested inside that function's own bundle**, named e.g. `_shared/content-types.ts` (not `../_shared/content-types.ts`).
3. **Rewrite the import statements in the deployed `handler.ts`/`index.ts` content from `../_shared/...` to `./_shared/...`** before passing them to the tool — the nested bundle makes `_shared/` a child of the function's own root, not a sibling of it.

The files committed to git always use `../_shared/...` (correct for local `deno test` and matches the on-disk sibling layout). Only the deploy payload's in-memory content needs the `./_shared/...` rewrite — don't commit that rewritten version.

If the Supabase CLI (`supabase functions deploy`) is ever installed for this project, it deploys directly from the on-disk `supabase/functions/` tree and does NOT need this rewrite — `../_shared/...` will resolve correctly on its own, since the CLI preserves the real sibling directory structure.
