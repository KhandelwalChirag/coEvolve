import Bun from "bun"
import { resolve } from "path"
import { Proposal, type Proposal as Info } from "./types.js"

type State = {
  last_generated_at: number
  dismissed_nodes: Record<string, number>
}

type Entry = {
  name: string
  proposal: Info
}

export class ProposerWriter {
  private root: string

  constructor(root = ".coevolve/proposals") {
    this.root = root
  }

  private pending(): string {
    return resolve(this.root, "pending")
  }

  private history(kind: "applied" | "dismissed"): string {
    return resolve(this.root, "history", kind)
  }

  private state(): string {
    return resolve(this.root, "state.json")
  }

  async init(): Promise<void> {
    await Bun.write(resolve(this.pending(), ".gitkeep"), "")
    await Bun.write(resolve(this.history("applied"), ".gitkeep"), "")
    await Bun.write(resolve(this.history("dismissed"), ".gitkeep"), "")

    const file = Bun.file(this.state())
    if (await file.exists()) return
    await Bun.write(
      this.state(),
      JSON.stringify({ last_generated_at: 0, dismissed_nodes: {} } satisfies State, null, 2),
    )
  }

  async hasPending(): Promise<boolean> {
    const list = await Array.fromAsync(new Bun.Glob("proposal-*.json").scan({ cwd: this.pending() }))
    return list.length > 0
  }

  async writePending(input: Info): Promise<string> {
    const data = Proposal.parse(input)
    const name = `proposal-${Date.now()}.json`
    const path = resolve(this.pending(), name)
    await Bun.write(path, JSON.stringify(data, null, 2))
    const state = await this.readState()
    await Bun.write(
      this.state(),
      JSON.stringify({ ...state, last_generated_at: Date.now() } satisfies State, null, 2),
    )
    return path
  }

  async readPending(): Promise<Info[]> {
    const out = (await this.readEntries()).map(x => x.proposal)
    return out.sort((a, b) => a.generated_at.localeCompare(b.generated_at)).reverse()
  }

  async readPendingEntry(id?: string): Promise<Entry | null> {
    const list = await this.readEntries()
    if (list.length === 0) return null
    if (!id) return list.sort((a, b) => b.proposal.generated_at.localeCompare(a.proposal.generated_at))[0]
    return list.find(x => x.proposal.id === id) ?? null
  }

  async archive(name: string, kind: "applied" | "dismissed", data: Record<string, unknown>): Promise<void> {
    const path = resolve(this.history(kind), name)
    await Bun.write(path, JSON.stringify(data, null, 2))
  }

  async removePending(name: string): Promise<void> {
    const path = resolve(this.pending(), name)
    const file = Bun.file(path)
    if (await file.exists()) {
      await file.delete()
    }
  }

  async markDismissed(nodes: string[]): Promise<void> {
    if (nodes.length === 0) return
    const state = await this.readState()
    const next = {
      ...state,
      dismissed_nodes: {
        ...state.dismissed_nodes,
        ...Object.fromEntries(nodes.map(x => [x, Date.now()])),
      },
    }
    await Bun.write(this.state(), JSON.stringify(next satisfies State, null, 2))
  }

  async lastGeneratedAt(): Promise<number> {
    const data = await this.readState()
    return data.last_generated_at ?? 0
  }

  private async readEntries(): Promise<Entry[]> {
    const list = await Array.fromAsync(new Bun.Glob("proposal-*.json").scan({ cwd: this.pending() }))
    return Promise.all(
      list.map(async name => ({
        name,
        proposal: Proposal.parse(await Bun.file(resolve(this.pending(), name)).json()),
      })),
    )
  }

  private async readState(): Promise<State> {
    const file = Bun.file(this.state())
    if (!(await file.exists())) {
      return { last_generated_at: 0, dismissed_nodes: {} }
    }

    const data = (await file.json()) as Partial<State>
    return {
      last_generated_at: data.last_generated_at ?? 0,
      dismissed_nodes: data.dismissed_nodes ?? {},
    }
  }
}
