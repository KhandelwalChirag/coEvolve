import { resolve } from "path"
import { HarnessWriter } from "../harness/writer.js"
import { ProposerWriter } from "../proposer/writer.js"
import { MemoryWriter } from "../memory/writer.js"
import { avg, chart, pending, sessions } from "./common.js"

export async function status(dir: string): Promise<string> {
  const harness = new HarnessWriter(resolve(dir, ".coevolve", "harness"))
  const proposer = new ProposerWriter(resolve(dir, ".coevolve", "proposals"))
  const memory = new MemoryWriter(resolve(dir, ".coevolve", "memory"))
  const [cur, sig, pen, last, mem] = await Promise.all([
    harness.init(),
    sessions(dir),
    pending(dir),
    proposer.lastGeneratedAt(),
    memory.stats().catch(() => ({ nodes: 0, keywords: 0, links: 0 })),
  ])

  const health = sig.slice(0, 10).map(x => x.health_score)
  const top = avg(health)
  return [
    "CoEvolve Status",
    `node: ${cur.tree_node}`,
    `source: ${cur.source} confidence=${cur.confidence}`,
    `pending_proposals: ${pen}`,
    `sessions_since_last_proposal: ${last ? sig.filter(x => x.timestamp > last).length : sig.length}`,
    `rolling_health_10: ${top.toFixed(3)}`,
    `trend: ${chart(sig.slice(0, 30).map(x => x.health_score), 30) || "n/a"}`,
    `memory: nodes=${mem.nodes} keywords=${mem.keywords} links=${mem.links}`,
  ].join("\n")
}
