import { resolve } from "path"
import { HarnessTree } from "../harness/tree.js"
import { HarnessWriter } from "../harness/writer.js"

type Pick = {
  parent: string
  plateaued: boolean
  tried: string | null
}

export class ProposerSelector {
  private dir: string

  constructor(directory: string) {
    this.dir = directory
  }

  async pick(): Promise<Pick> {
    const root = resolve(this.dir, ".coevolve", "harness")
    const writer = new HarnessWriter(root)
    const tree = new HarnessTree(root)
    const cur = await writer.init()
    const ids = await tree.list()

    const all = await Promise.all(ids.map(async id => ({ id, score: await tree.readScore(id), node: await tree.readNode(id) })))
    const rows = all
      .filter(x => x.score && x.node)
      .map(x => ({
        id: x.id,
        avg: this.avg(x.score?.rolling_health ?? []),
        value: x.score?.rolling_health ?? [],
        children: x.node?.children ?? [],
      }))

    if (rows.length === 0) {
      return { parent: cur.tree_node, plateaued: false, tried: null }
    }

    const best = rows.sort((a, b) => b.avg - a.avg)[0]
    const now = rows.find(x => x.id === cur.tree_node)
    const plateaued = now ? this.plateau(now.value) : false

    if (!plateaued) {
      return { parent: cur.tree_node, plateaued: false, tried: null }
    }

    const step = rows
      .filter(x => x.children.length > 0)
      .sort((a, b) => b.children.length - a.children.length || b.avg - a.avg)[0]

    const target = best.id === cur.tree_node ? (step?.id ?? best.id) : best.id
    const tried = target === cur.tree_node ? null : `plateau_switch:${cur.tree_node}->${target}`
    return { parent: target, plateaued: true, tried }
  }

  private plateau(list: number[]): boolean {
    if (list.length < 5) return false
    const top = list.slice(-5)
    const min = Math.min(...top)
    const max = Math.max(...top)
    return max - min <= 0.03
  }

  private avg(list: number[]): number {
    if (list.length === 0) return 0
    const top = list.slice(-10)
    return top.reduce((sum, x) => sum + x, 0) / top.length
  }
}
