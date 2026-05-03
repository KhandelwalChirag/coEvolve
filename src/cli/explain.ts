import Bun from "bun"
import { resolve } from "path"
import { HarnessWriter } from "../harness/writer.js"
import { MemoryWriter } from "../memory/writer.js"

type Reflection = {
  task_summary?: string
  root_cause?: { main_issue: string }
}

export async function explain(dir: string, sessionID?: string): Promise<string> {
  const root = resolve(dir, ".coevolve", "experience")
  const sid = sessionID ?? ""
  const path = sid ? resolve(root, `session-${sid}`) : null
  const pick = path && (await Bun.file(path).exists())
    ? path
    : await latest(root)

  if (!pick) return "CoEvolve Explain\n- no_session_data"

  const signals = await Bun.file(resolve(pick, "signals.json")).json().catch(() => null) as
    | { sessionID: string; health_score: number; signals: Array<{ type: string; description: string }> }
    | null
  const reflection = await Bun.file(resolve(pick, "reflection.json")).json().catch(() => null) as Reflection | null
  const harness = new HarnessWriter(resolve(dir, ".coevolve", "harness"))
  const cur = await harness.init()
  const mem = new MemoryWriter(resolve(dir, ".coevolve", "memory"))
  const nodes = await mem.readNodes().catch(() => [])
  const sess = signals?.sessionID ?? pick.split("session-").pop() ?? "unknown"
  const similar = nodes
    .filter(x => x.evidence_sessions.includes(sess))
    .slice(0, 4)
    .flatMap(x => x.evidence_sessions)
    .filter(x => x !== sess)
    .slice(0, 4)

  return [
    `Session ${sess} analysis`,
    `task: ${reflection?.task_summary ?? "unknown"}`,
    `health: ${(signals?.health_score ?? 0).toFixed(3)}`,
    `root_cause: ${reflection?.root_cause?.main_issue ?? "unknown"}`,
    `active_harness_node: ${cur.tree_node}`,
    `signals: ${(signals?.signals ?? []).map(x => x.type).join(", ") || "none"}`,
    `similar_sessions: ${similar.join(", ") || "none"}`,
  ].join("\n")
}

async function latest(root: string): Promise<string | null> {
  try {
    const dirs = await Array.fromAsync(new Bun.Glob("session-*").scan({ cwd: root, onlyFiles: false }))
    const rows = await Promise.all(
      dirs.map(async id => ({
        id,
        ts: (await Bun.file(resolve(root, id, "signals.json")).json().catch(() => ({ timestamp: 0 }))) as { timestamp: number },
      })),
    )
    const pick = rows.sort((a, b) => (b.ts.timestamp ?? 0) - (a.ts.timestamp ?? 0))[0]
    return pick ? resolve(root, pick.id) : null
  } catch {
    return null
  }
}
