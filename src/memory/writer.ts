import Bun from "bun"
import { resolve } from "path"
import { type MemoryGraph, type MemoryIndex, type MemoryNode } from "./types.js"

export class MemoryWriter {
  private root: string

  constructor(root = ".coevolve/memory") {
    this.root = root
  }

  async init(): Promise<void> {
    await Bun.write(resolve(this.root, "nodes", ".gitkeep"), "")
    const idx = resolve(this.root, "index.json")
    const graph = resolve(this.root, "graph.json")

    if (!(await Bun.file(idx).exists())) {
      await Bun.write(idx, JSON.stringify({ keywords: {}, updated_at: Date.now() }, null, 2))
    }

    if (!(await Bun.file(graph).exists())) {
      await Bun.write(graph, JSON.stringify({ links: {}, updated_at: Date.now() }, null, 2))
    }
  }

  async writeNode(node: MemoryNode): Promise<void> {
    await Bun.write(resolve(this.root, "nodes", `${node.id}.json`), JSON.stringify(node, null, 2))
  }

  async readNodes(): Promise<MemoryNode[]> {
    const dir = resolve(this.root, "nodes")
    const names = await Array.fromAsync(new Bun.Glob("node-*.json").scan({ cwd: dir }))
    const files = await Promise.all(names.map(x => Bun.file(resolve(dir, x)).json()))
    return files as MemoryNode[]
  }

  async readIndex(): Promise<MemoryIndex> {
    const path = resolve(this.root, "index.json")
    const file = Bun.file(path)
    if (!(await file.exists())) {
      return { keywords: {}, updated_at: Date.now() }
    }
    return (await file.json()) as MemoryIndex
  }

  async writeIndex(index: MemoryIndex): Promise<void> {
    await Bun.write(resolve(this.root, "index.json"), JSON.stringify(index, null, 2))
  }

  async readGraph(): Promise<MemoryGraph> {
    const path = resolve(this.root, "graph.json")
    const file = Bun.file(path)
    if (!(await file.exists())) {
      return { links: {}, updated_at: Date.now() }
    }
    return (await file.json()) as MemoryGraph
  }

  async writeGraph(graph: MemoryGraph): Promise<void> {
    await Bun.write(resolve(this.root, "graph.json"), JSON.stringify(graph, null, 2))
  }

  private score(a: MemoryNode, b: MemoryNode): number {
    const ka = new Set(a.keywords)
    const kb = new Set(b.keywords)
    const ta = new Set(a.tags)
    const tb = new Set(b.tags)
    const ki = [...ka].filter(x => kb.has(x)).length
    const ku = new Set([...ka, ...kb]).size || 1
    const ti = [...ta].filter(x => tb.has(x)).length
    const tu = new Set([...ta, ...tb]).size || 1
    return ki / ku * 0.7 + ti / tu * 0.3
  }

  private merge(base: MemoryNode, add: MemoryNode): MemoryNode {
    return {
      ...base,
      content: add.content.length > base.content.length ? add.content : base.content,
      keywords: [...new Set([...base.keywords, ...add.keywords])].slice(0, 24),
      tags: [...new Set([...base.tags, ...add.tags])].slice(0, 24),
      evidence_sessions: [...new Set([...base.evidence_sessions, ...add.evidence_sessions])],
      linked_nodes: [...new Set([...base.linked_nodes, ...add.linked_nodes].filter(x => x !== base.id))],
      link_reasons: { ...base.link_reasons, ...add.link_reasons },
      confidence: Math.max(base.confidence, add.confidence),
      source: add.source === "llm" || base.source === "llm" ? "llm" : "heuristic",
    }
  }

  async append(node: MemoryNode): Promise<{ id: string; merged: boolean }> {
    const all = await this.readNodes()
    const hit = all
      .map(x => ({ id: x.id, score: this.score(x, node) }))
      .sort((a, b) => b.score - a.score)
      .find(x => x.score >= 0.6)

    const next = hit
      ? this.merge(all.find(x => x.id === hit.id) as MemoryNode, node)
      : node

    await this.writeNode(next)

    const idx = await this.readIndex()
    const graph = await this.readGraph()

    for (const key of next.keywords) {
      idx.keywords[key] = [...new Set([...(idx.keywords[key] ?? []), next.id])]
    }

    graph.links[next.id] = [...new Set(next.linked_nodes)]
    for (const id of next.linked_nodes) {
      graph.links[id] = [...new Set([...(graph.links[id] ?? []), next.id])]
    }

    idx.updated_at = Date.now()
    graph.updated_at = Date.now()

    await this.writeIndex(idx)
    await this.writeGraph(graph)

    return { id: next.id, merged: Boolean(hit) }
  }

  async retrieve(query: string, limit = 5): Promise<Array<MemoryNode & { score: number }>> {
    const idx = await this.readIndex()
    const words = query
      .toLowerCase()
      .replace(/[^a-z0-9_\s/.-]/g, " ")
      .split(/\s+/)
      .filter(Boolean)

    const ids = [...new Set(words.flatMap(x => idx.keywords[x] ?? []))]
    const all = await this.readNodes()
    const pick = ids.length > 0 ? all.filter(x => ids.includes(x.id)) : all

    return pick
      .map(x => {
        const key = x.keywords.filter(y => words.includes(y)).length
        const tag = x.tags.filter(y => words.some(w => y.includes(w))).length
        const age = Math.max(0, Date.now() - x.created_at)
        const rec = 1 / (1 + age / 86_400_000)
        return { ...x, score: key * 3 + tag * 2 + rec }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  async stats(): Promise<{ nodes: number; keywords: number; links: number }> {
    const nodes = await this.readNodes()
    const idx = await this.readIndex()
    const graph = await this.readGraph()
    const links = Object.values(graph.links).reduce((sum, arr) => sum + arr.length, 0)
    return {
      nodes: nodes.length,
      keywords: Object.keys(idx.keywords).length,
      links,
    }
  }

  async resolve(ids: string[], proposal: string): Promise<number> {
    if (ids.length === 0) return 0
    const set = new Set(ids)
    const all = await this.readNodes()
    const pick = all.filter(x => set.has(x.id))
    await Promise.all(
      pick.map(x =>
        this.writeNode({
          ...x,
          status: "resolved",
          resolved_by_proposal: proposal,
        }),
      ),
    )
    return pick.length
  }

  async dismiss(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0
    const set = new Set(ids)
    const all = await this.readNodes()
    const pick = all.filter(x => set.has(x.id))
    await Promise.all(
      pick.map(x =>
        this.writeNode({
          ...x,
          tags: [...new Set([...x.tags, "proposal:dismissed_once"])],
        }),
      ),
    )
    return pick.length
  }
}
