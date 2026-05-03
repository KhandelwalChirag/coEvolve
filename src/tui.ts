import { type TuiPlugin, type TuiPluginModule } from "@opencode-ai/plugin/tui"
import { resolve } from "path"
import { historyCount, sessions } from "./cli/common.js"
import { HarnessWriter } from "./harness/writer.js"
import { ProposerWriter } from "./proposer/writer.js"

type Snap = {
  node: string
  pending: number
  applied: number
  dismissed: number
  sessions: number
  health: number
}

type Queue = {
  id: string
  sessionID: string | null
  change: string
  target: string
  confidence: string
  reason: string
}

const id = "coevolve"
const skey = "coevolve.snapshot"
const qkey = "coevolve.queue"

function avg(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((sum, x) => sum + x, 0) / nums.length
}

function empty(): Snap {
  return {
    node: "root",
    pending: 0,
    applied: 0,
    dismissed: 0,
    sessions: 0,
    health: 0,
  }
}

export async function snapshot(dir: string): Promise<Snap> {
  const harness = new HarnessWriter(resolve(dir, ".coevolve", "harness"))
  const writer = new ProposerWriter(resolve(dir, ".coevolve", "proposals"))
  const sig = await sessions(dir)
  const cur = await harness.init()
  const hist = await historyCount(dir)
  const rows = await writer.readPending().catch(() => [])
  return {
    node: cur.tree_node,
    pending: rows.length,
    applied: hist.applied,
    dismissed: hist.dismissed,
    sessions: sig.length,
    health: avg(sig.slice(0, 10).map(x => x.health_score)),
  }
}

export async function queue(dir: string): Promise<Queue[]> {
  const writer = new ProposerWriter(resolve(dir, ".coevolve", "proposals"))
  const rows = await writer.readPending().catch(() => [])
  return rows.map(x => ({
    id: x.id,
    sessionID: x.evidence_sessions[0] ?? null,
    change: x.change_type,
    target: x.target_section,
    confidence: x.confidence,
    reason: x.rationale,
  }))
}

const tui: TuiPlugin = async (api) => {
  const dir = api.state.path.directory

  const sync = async () => {
    api.kv.set(skey, await snapshot(dir).catch(() => empty()))
    api.kv.set(qkey, await queue(dir).catch(() => []))
  }

  const open = async (name: "coevolve" | "evolve") => {
    await sync()
    api.route.navigate(name)
  }

  const run = (value: string) => {
    api.command.trigger(`/coevolve ${value}`)
  }

  const pick = async (): Promise<string | undefined> => {
    const rows = await queue(dir)
    return rows[0]?.id
  }

  await sync()
  const off = api.event.on("session.deleted", () => {
    void sync()
  })
  api.lifecycle.onDispose(off)

  api.command.register(() => {
    const snap = api.kv.get<Snap>(skey, empty())
    return [
      {
        title: "CoEvolve Dashboard",
        value: "coevolve.dashboard",
        category: "CoEvolve",
        slash: { name: "coevolve" },
        onSelect() {
          void open("coevolve")
        },
      },
      {
        title: `CoEvolve Review Queue (${snap.pending})`,
        value: "coevolve.review",
        category: "CoEvolve",
        slash: { name: "evolve" },
        onSelect() {
          void open("evolve")
        },
      },
      {
        title: "CoEvolve Evolve Now",
        value: "coevolve.evolve",
        category: "CoEvolve",
        onSelect() {
          run("evolve")
        },
      },
      {
        title: "CoEvolve Apply Latest",
        value: "coevolve.apply.latest",
        category: "CoEvolve",
        enabled: snap.pending > 0,
        onSelect() {
          void pick().then(id => {
            if (!id) return
            run(`apply ${id}`)
          })
        },
      },
      {
        title: "CoEvolve Dismiss Latest",
        value: "coevolve.dismiss.latest",
        category: "CoEvolve",
        enabled: snap.pending > 0,
        onSelect() {
          void pick().then(id => {
            if (!id) return
            run(`dismiss ${id}`)
          })
        },
      },
    ]
  })

  api.route.register([
    {
      name: "coevolve",
      render() {
        const snap = api.kv.get<Snap>(skey, empty())
        return api.ui.DialogSelect({
          title: "CoEvolve Dashboard",
          flat: true,
          options: [
            {
              title: "Open review queue",
              value: "review",
              description: `${snap.pending} pending proposals`,
            },
            {
              title: "Run analyze",
              value: "analyze",
              description: `sessions=${snap.sessions} health_10=${snap.health.toFixed(3)}`,
            },
            {
              title: "Generate report",
              value: "report",
              description: `node=${snap.node} applied=${snap.applied} dismissed=${snap.dismissed}`,
            },
            {
              title: "Back",
              value: "back",
            },
          ],
          onSelect(item) {
            if (item.value === "review") {
              void open("evolve")
              return
            }
            if (item.value === "analyze") {
              run("analyze")
              return
            }
            if (item.value === "report") {
              run("report")
              return
            }
            api.route.navigate("home")
          },
        })
      },
    },
    {
      name: "evolve",
      render() {
        const rows = api.kv.get<Queue[]>(qkey, [])
        return api.ui.DialogSelect({
          title: "CoEvolve Review Queue",
          placeholder: "Select proposal",
          flat: true,
          options: [
            ...rows.flatMap(row => [
              {
                title: `Apply ${row.id}`,
                value: `apply:${row.id}`,
                description: `${row.change} -> ${row.target}`,
                footer: row.reason,
              },
              {
                title: `Dismiss ${row.id}`,
                value: `dismiss:${row.id}`,
                description: `${row.change} -> ${row.target}`,
                footer: row.reason,
              },
              {
                title: `Edit before applying ${row.id}`,
                value: `edit:${row.id}`,
                description: "Edit before applying",
                footer: row.reason,
              },
              {
                title: `Explain ${row.id}`,
                value: `explain:${row.id}`,
                description: `${row.change} -> ${row.target}`,
                footer: row.reason,
              },
            ]),
            { title: "Back", value: "back" },
          ],
          onSelect(item) {
            if (item.value === "back") {
              api.route.navigate("coevolve")
              return
            }
            const raw = String(item.value)
            const [kind, id] = raw.split(":")
            const row = rows.find(x => x.id === id)
            if (!row) {
              run("status")
              return
            }

            if (kind === "apply") {
              run(`apply ${id}`)
              return
            }

            if (kind === "dismiss") {
              run(`dismiss ${id}`)
              return
            }

            if (kind === "edit") {
              run(`explain ${row.sessionID ?? id}`)
              return
            }

            if (!row.sessionID) {
              run("analyze")
              return
            }

            run(`explain ${row.sessionID}`)
          },
        })
      },
    },
  ])
}

export const coevolveTuiPlugin = tui

const plugin: TuiPluginModule & { id: string } = {
  id,
  tui,
}

export default plugin