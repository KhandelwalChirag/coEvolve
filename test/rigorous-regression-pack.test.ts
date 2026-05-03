import { describe, expect, it } from "bun:test"
import { resolve } from "path"
import { coevolvePlugin } from "../src/plugin.js"
import { HarnessTree, HarnessWriter } from "../src/harness/index.js"
import { ProposalChangeType, ProposerRunner } from "../src/proposer/index.js"

function dir(name: string): string {
  return resolve(`.coevolve-rigorous-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
}

function input(root: string): any {
  return {
    client: undefined,
    project: { id: "proj-rigorous" },
    directory: root,
    worktree: root,
    serverUrl: new URL("http://localhost"),
    $: {},
  }
}

async function prep(root: string): Promise<void> {
  await Bun.write(resolve(root, ".gitkeep"), "")
}

function proposal(id: string) {
  return {
    id,
    generated_at: new Date().toISOString(),
    proposer_version: "1.0" as const,
    harness_tree_parent: "root",
    change_type: "add_instruction" as const,
    target_section: "system_prompt_extensions" as const,
    proposed_addition: {
      path: null,
      content: "test",
      format: null,
      reason: "test",
      condition: null,
    },
    rationale: "test",
    evidence_nodes: ["n1", "n2", "n3"],
    evidence_sessions: ["s1", "s2", "s3"],
    confidence: "medium" as const,
    expected_improvement: "test",
    detection_criterion: "test",
    reversibility_note: "test",
    what_was_tried_before: null,
    trigger: "manual" as const,
  }
}

describe("Rigorous Regression Pack", () => {
  it("should isolate concurrent sessions instead of mixing traces", async () => {
    const root = dir("session-isolation")
    await prep(root)
    const hooks = await coevolvePlugin(input(root))

    await hooks["chat.message"]?.(
      { sessionID: "A" } as any,
      {
        message: { role: "user" },
        parts: [{ type: "text", text: "first" }],
      } as any,
    )

    await hooks["chat.message"]?.(
      { sessionID: "B" } as any,
      {
        message: { role: "user" },
        parts: [{ type: "text", text: "second" }],
      } as any,
    )

    await hooks.event?.({ event: { type: "session.deleted" } } as any)

    const a = await Bun.file(resolve(root, ".coevolve", "experience", "session-A", "trace.jsonl")).exists()
    const b = await Bun.file(resolve(root, ".coevolve", "experience", "session-B", "trace.jsonl")).exists()

    expect(a).toBeTrue()
    expect(b).toBeTrue()
  })

  it("should record health on the current harness node after branch switch", async () => {
    const root = dir("health-node")
    await prep(root)
    const hooks = await coevolvePlugin(input(root))
    const harness = new HarnessWriter(resolve(root, ".coevolve", "harness"))
    const tree = new HarnessTree(resolve(root, ".coevolve", "harness"))
    const cur = await harness.readCurrent()

    const child = await tree.create({
      parent: cur.tree_node,
      harness: cur,
      note: "switch",
      health: 0.73,
      apply: true,
    })

    await hooks["chat.message"]?.(
      { sessionID: "S1" } as any,
      {
        message: { role: "user" },
        parts: [{ type: "text", text: "run" }],
      } as any,
    )

    await hooks.event?.({ event: { type: "session.deleted" } } as any)

    const score = await tree.readScore(child)
    expect((score?.rolling_health.length ?? 0) > 1).toBeTrue()
  })

  it("should preserve case-sensitive command arguments for export path", async () => {
    const root = dir("case-args")
    await prep(root)
    const hooks = await coevolvePlugin(input(root))
    const out = { parts: [] as any[] }

    await hooks["command.execute.before"]?.(
      {
        command: "coevolve",
        sessionID: "sess-1",
        arguments: "export Reports/CaseSensitive.json",
      } as any,
      out as any,
    )

    const want = await Bun.file(resolve(root, "Reports", "CaseSensitive.json")).exists()
    expect(want).toBeTrue()
  })

  it("should prevent duplicate proposal creation under concurrent manual runs", async () => {
    let writes = 0

    const writer: any = {
      async init() {},
      async hasPending() {
        await Bun.sleep(25)
        return false
      },
      async writePending() {
        await Bun.sleep(25)
        writes += 1
      },
    }

    const trigger: any = {
      async check() {
        return {
          should: true,
          reason: "manual",
          stats: { sessions_since_last: 0, reprompt_rate: 0, reversion_rate: 0, recent_sessions: 0 },
        }
      },
    }

    let n = 0
    const generator: any = {
      async generate() {
        n += 1
        return proposal(`prop-${n}`)
      },
    }

    const runner = new ProposerRunner({ directory: ".", writer, trigger, generator } as any)
    await Promise.all([runner.run({ manual: true }), runner.run({ manual: true })])

    expect(writes).toBe(1)
  })

  it("should support non-additive proposer change types from plan", async () => {
    expect(ProposalChangeType.safeParse("remove_context_file").success).toBeTrue()
  })

  it("should expose apply dismiss and edit actions directly in evolve route", async () => {
    const txt = await Bun.file(resolve(import.meta.dir, "../src/tui.ts")).text()
    const apply = /name:\s*"evolve"[\s\S]*run\(`apply\s+\$\{/.test(txt)
    const dismiss = /name:\s*"evolve"[\s\S]*run\(`dismiss\s+\$\{/.test(txt)
    const edit = txt.includes("Edit before applying")

    expect(apply && dismiss && edit).toBeTrue()
  })
})
