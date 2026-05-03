import { describe, expect, it } from "bun:test"
import { resolve } from "path"
import { coevolvePlugin } from "../src/plugin.js"
import { MemoryWriter } from "../src/memory/index.js"

function dir(name: string): string {
  return resolve(`.coevolve-auto-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
}

function input(root: string): any {
  return {
    client: undefined,
    project: { id: "proj-auto" },
    directory: root,
    worktree: root,
    serverUrl: new URL("http://localhost"),
    $: {},
  }
}

async function prep(root: string): Promise<void> {
  await Bun.write(resolve(root, ".gitkeep"), "")
}

async function seedSignals(root: string): Promise<void> {
  for (let i = 1; i <= 10; i++) {
    await Bun.write(
      resolve(root, ".coevolve", "experience", `session-${i}`, "signals.json"),
      JSON.stringify({
        sessionID: `session-${i}`,
        timestamp: i,
        health_score: 0.6,
        signals: [{ type: "TOOL_LOOP" }],
      }),
    )
  }
}

async function seedMemory(root: string): Promise<void> {
  const mem = new MemoryWriter(resolve(root, ".coevolve", "memory"))
  await mem.init()
  await mem.writeNode({
    id: "node-seed",
    created_at: Date.now(),
    content: "Repeated context gap around src/auth/RateLimiter.ts in auth sessions",
    keywords: ["context_gap", "src/auth/RateLimiter.ts", "auth"],
    tags: ["signal:context_gap"],
    evidence_sessions: ["a", "b", "c", "d", "e"],
    linked_nodes: [],
    link_reasons: {},
    confidence: 0.9,
    status: "active",
    source: "heuristic",
    resolved_by_proposal: null,
  })
}

async function closeOne(hooks: Awaited<ReturnType<typeof coevolvePlugin>>, id: string): Promise<void> {
  await hooks["chat.message"]?.(
    { sessionID: id } as any,
    {
      message: { role: "user" },
      parts: [{ type: "text", text: "run" }],
    } as any,
  )

  await hooks.event?.({ event: { type: "session.deleted", sessionID: id } } as any)
}

describe("Plugin Auto Apply Runtime", () => {
  it("should auto apply safe high-confidence proposals by default", async () => {
    const root = dir("default-on")
    await prep(root)
    const hooks = await coevolvePlugin(input(root))
    await seedSignals(root)
    await seedMemory(root)

    await closeOne(hooks, "live-default")

    const applied = await Array.fromAsync(
      new Bun.Glob("proposal-*.json").scan({ cwd: resolve(root, ".coevolve", "proposals", "history", "applied") }),
    )
    const pending = await Array.fromAsync(
      new Bun.Glob("proposal-*.json").scan({ cwd: resolve(root, ".coevolve", "proposals", "pending") }),
    )

    expect(applied.length).toBe(1)
    expect(pending.length).toBe(0)
  })

  it("should keep manual review flow when auto_apply is disabled", async () => {
    const root = dir("disabled")
    await prep(root)
    const hooks = await coevolvePlugin(input(root))
    await seedSignals(root)
    await seedMemory(root)

    await Bun.write(
      resolve(root, ".coevolve", "config.json"),
      JSON.stringify({ auto_apply: false }, null, 2),
    )

    await closeOne(hooks, "live-disabled")

    const applied = await Array.fromAsync(
      new Bun.Glob("proposal-*.json").scan({ cwd: resolve(root, ".coevolve", "proposals", "history", "applied") }),
    )
    const pending = await Array.fromAsync(
      new Bun.Glob("proposal-*.json").scan({ cwd: resolve(root, ".coevolve", "proposals", "pending") }),
    )

    expect(applied.length).toBe(0)
    expect(pending.length).toBe(1)
  })
})
