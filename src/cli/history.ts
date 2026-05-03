import { resolve } from "path"
import { HarnessTree } from "../harness/tree.js"

export async function history(dir: string): Promise<string> {
  const tree = new HarnessTree(resolve(dir, ".coevolve", "harness"))
  const ids = await tree.list().catch(() => [])
  const rows = await Promise.all(
    ids.map(async id => ({
      id,
      node: await tree.readNode(id),
      score: await tree.readScore(id),
    })),
  )

  const map = Object.fromEntries(rows.map(x => [x.id, x]))
  const roots = rows.filter(x => x.node?.parent === null).map(x => x.id)

  const out: string[] = ["CoEvolve History"]
  const walk = (id: string, depth: number) => {
    const row = map[id]
    if (!row || !row.node) return
    const score = row.score?.rolling_health ?? []
    const avg = score.length > 0 ? score.reduce((sum, x) => sum + x, 0) / score.length : 0
    out.push(`${"  ".repeat(depth)}- ${id} health=${avg.toFixed(3)} children=${row.node.children.length}`)
    for (const child of row.node.children) walk(child, depth + 1)
  }

  for (const id of roots) walk(id, 0)
  if (out.length === 1) out.push("- no_harness_tree")
  return out.join("\n")
}
