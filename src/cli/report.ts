import Bun from "bun"
import { resolve } from "path"
import { historyCount, sessions } from "./common.js"

export async function report(dir: string): Promise<string> {
  const sig = await sessions(dir)
  const top = sig.slice(0, 23)
  const rates: Record<string, number> = {}
  for (const row of top) {
    for (const s of row.signals) rates[s.type] = (rates[s.type] ?? 0) + 1
  }
  const lines = Object.entries(rates).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const hist = await historyCount(dir)
  const trend = top.map(x => x.health_score)
  const week = trend.slice(0, 7)
  const prev = trend.slice(7, 14)
  const weekAvg = week.length ? week.reduce((sum, x) => sum + x, 0) / week.length : 0
  const prevAvg = prev.length ? prev.reduce((sum, x) => sum + x, 0) / prev.length : 0
  const delta = weekAvg - prevAvg

  const out = [
    "# CoEvolve Project Intelligence Report",
    `Generated: ${new Date().toISOString()} | Sessions since last report: ${top.length}`,
    "",
    "## Health trend",
    `Last window avg: ${weekAvg.toFixed(3)} | Previous window avg: ${prevAvg.toFixed(3)} | Delta: ${delta >= 0 ? "+" : ""}${delta.toFixed(3)}`,
    "",
    "## Harness evolution",
    `Applied: ${hist.applied} | Dismissed: ${hist.dismissed}`,
    "",
    "## Active patterns",
    ...lines.map(([k, v], i) => `${i + 1}. ${k} (${v})`),
  ].join("\n")

  const path = resolve(dir, ".coevolve", "reports", `weekly-${new Date().toISOString().slice(0, 10)}.md`)
  await Bun.write(path, out)
  return `report_written: ${path}`
}
