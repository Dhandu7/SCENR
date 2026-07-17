import { assertEquals } from "jsr:@std/assert@1"
import { stripMarkdownFence } from "./strip-markdown-fence.ts"

Deno.test("removes a ```json fence", () => {
  assertEquals(stripMarkdownFence('```json\n{"quality_score": 80}\n```'), '{"quality_score": 80}')
})
Deno.test("removes a bare fence", () => {
  assertEquals(stripMarkdownFence('```\n{"quality_score": 80}\n```'), '{"quality_score": 80}')
})
Deno.test("passes through unfenced text", () => {
  assertEquals(stripMarkdownFence('{"quality_score": 80}'), '{"quality_score": 80}')
})
