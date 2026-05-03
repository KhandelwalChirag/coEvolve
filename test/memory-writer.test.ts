import { describe, it, expect } from "bun:test"
import { resolve } from "path"
import { MemoryWriter } from "../src/memory/writer.js"
import { type MemoryNode } from "../src/memory/types.js"

describe("MemoryWriter", () => {
  const root = resolve(`.coevolve-memory-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  it("should initialize index and graph files", async () => {
    const w = new MemoryWriter(root)
    await w.init()

    expect(await Bun.file(resolve(root, "index.json")).exists()).toBeTrue()
    expect(await Bun.file(resolve(root, "graph.json")).exists()).toBeTrue()
    expect(await Bun.file(resolve(root, "nodes", ".gitkeep")).exists()).toBeTrue()
  })

  it("should append node and update index/graph", async () => {
    const w = new MemoryWriter(root)
    await w.init()

    const node: MemoryNode = {
      id: "node-a",
      created_at: Date.now(),
      content: "test",
      keywords: ["context_gap", "src/types.ts"],
      tags: ["severity:high"],
      evidence_sessions: ["sess-a"],
      linked_nodes: ["node-b"],
      link_reasons: { "node-b": "related" },
      confidence: 0.7,
      status: "active",
      source: "heuristic",
      resolved_by_proposal: null,
    }

    const added = await w.append(node)

    const nodes = await w.readNodes()
    const idx = await w.readIndex()
    const graph = await w.readGraph()

    expect(added.id).toBe("node-a")
    expect(nodes.some(x => x.id === "node-a")).toBeTrue()
    expect(idx.keywords.context_gap).toContain("node-a")
    expect(graph.links["node-a"]).toContain("node-b")
    expect(graph.links["node-b"]).toContain("node-a")
  })

  it("should merge highly similar nodes and return existing id", async () => {
    const w = new MemoryWriter(root)
    await w.init()

    await w.append({
      id: "node-base",
      created_at: Date.now(),
      content: "context gap in auth",
      keywords: ["context_gap", "auth", "ratelimiter"],
      tags: ["signal:context_gap", "severity:high"],
      evidence_sessions: ["s1"],
      linked_nodes: [],
      link_reasons: {},
      confidence: 0.7,
      status: "active",
      source: "heuristic",
      resolved_by_proposal: null,
    })

    const merged = await w.append({
      id: "node-new",
      created_at: Date.now(),
      content: "context gap in auth module needs preload",
      keywords: ["context_gap", "auth", "preload"],
      tags: ["signal:context_gap", "severity:high"],
      evidence_sessions: ["s2"],
      linked_nodes: [],
      link_reasons: {},
      confidence: 0.8,
      status: "active",
      source: "heuristic",
      resolved_by_proposal: null,
    })

    const nodes = await w.readNodes()
    expect(merged.id).toBe("node-base")
    expect(nodes.filter(x => x.id === "node-base").length).toBe(1)
    expect(nodes.find(x => x.id === "node-base")?.evidence_sessions.includes("s2")).toBeTrue()
  })

  it("should retrieve ranked nodes from query", async () => {
    const w = new MemoryWriter(root)
    await w.init()

    await w.append({
      id: "node-r1",
      created_at: Date.now(),
      content: "auth context gap",
      keywords: ["auth", "context_gap"],
      tags: ["signal:context_gap"],
      evidence_sessions: ["s3"],
      linked_nodes: [],
      link_reasons: {},
      confidence: 0.7,
      status: "active",
      source: "heuristic",
      resolved_by_proposal: null,
    })

    const out = await w.retrieve("auth context gap", 3)
    expect(out.length).toBeGreaterThan(0)
    expect(out[0].id).toBe("node-r1")
    expect(out[0].score).toBeGreaterThan(0)
  })
})
