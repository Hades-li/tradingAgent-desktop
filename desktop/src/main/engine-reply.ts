/**
 * One-shot sidecar commands answer with a single JSON line on stdout. An
 * `error` event becomes a thrown Error so the
 * renderer sees the engine's own message instead of a bare exit code.
 */

export function parseEngineReply(stdout: string): Record<string, unknown> | null {
  const line = stdout.split('\n').find((candidate) => candidate.trim().startsWith('{'))
  if (!line) return null
  const reply = JSON.parse(line) as Record<string, unknown>
  if (reply.type === 'error') throw new Error(String(reply.message))
  return reply
}
