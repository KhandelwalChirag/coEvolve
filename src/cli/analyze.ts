import { resolve } from "path"
import { MemoryWriter } from "../memory/writer.js"
import { avg, sessions } from "./common.js"

export async function analyze(dir: string): Promise<string> {
  const sig = await sessions(dir)
  const top = sig.slice(0, 30)
  const rates: Record<string, number> = {}
  for (const row of top) {
    for (const x of row.signals) {
      rates[x.type] = (rates[x.type] ?? 0) + 1
    }
  }

  const list = Object.entries(rates)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
  const mem = new MemoryWriter(resolve(dir, ".coevolve", "memory"))
  const nodes = await mem.readNodes().catch(() => [])
  const keys = Object.entries(
    nodes.flatMap(x => x.keywords).reduce<Record<string, number>>((acc, x) => ({ ...acc, [x]: (acc[x] ?? 0) + 1 }), {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  return [
    "CoEvolve Analyze",
    `sessions: ${sig.length}`,
    `health_avg_30: ${avg(top.map(x => x.health_score)).toFixed(3)}`,
    "signals:",
    ...list.map(([k, v]) => `- ${k}: ${v}`),
    "top_keywords:",
    ...keys.map(([k, v]) => `- ${k}: ${v}`),
  ].join("\n")
}
