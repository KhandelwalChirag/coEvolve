import Bun from "bun"
import { resolve } from "path"
import { type Harness, HarnessNode, HarnessScore } from "./types.js"
import { HarnessWriter } from "./writer.js"

type CreateInput = {
  parent: string
  harness: Harness
  note: string
  health: number
  apply?: boolean
}

export class HarnessTree {
  private root: string
  private writer: HarnessWriter

  constructor(root = ".coevolve/harness") {
    this.root = root
    this.writer = new HarnessWriter(root)
  }

  private node(id: string): string {
    return resolve(this.root, "tree", id, "node.json")
  }

  private score(id: string): string {
    return resolve(this.root, "tree", id, "score.json")
  }

  private id(): string {
    return `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  async create(input: CreateInput): Promise<string> {
    await this.writer.init()

    const parent = await this.readNode(input.parent)
    if (!parent) throw new Error(`missing_parent:${input.parent}`)

    const id = this.id()
    const now = Date.now()

    const harness = {
      ...input.harness,
      tree_node: id,
      parent_node: input.parent,
      created_at: now,
      updated_at: now,
      health_at_creation: input.health,
    }

    await this.writer.writeNode(id, harness)
    await Bun.write(
      this.node(id),
      JSON.stringify(
        {
          id,
          parent: input.parent,
          children: [],
          created_at: now,
          note: input.note,
        },
        null,
        2,
      ),
    )
    await Bun.write(
      this.score(id),
      JSON.stringify(
        {
          node: id,
          created_at: now,
          health_at_creation: input.health,
          rolling_health: [input.health],
        },
        null,
        2,
      ),
    )

    const next = {
      ...parent,
      children: [...new Set([...parent.children, id])],
    }
    await Bun.write(this.node(input.parent), JSON.stringify(next, null, 2))

    if (input.apply !== false) {
      await this.writer.writeCurrent(harness)
    }

    return id
  }

  async readNode(id: string): Promise<{ id: string; parent: string | null; children: string[]; created_at: number; note: string } | null> {
    const file = Bun.file(this.node(id))
    if (!(await file.exists())) return null
    return HarnessNode.parse(await file.json())
  }

  async readScore(id: string): Promise<{ node: string; created_at: number; health_at_creation: number; rolling_health: number[] } | null> {
    const file = Bun.file(this.score(id))
    if (!(await file.exists())) return null
    return HarnessScore.parse(await file.json())
  }

  async recordHealth(id: string, health: number): Promise<void> {
    const score = await this.readScore(id)
    const now = Date.now()
    const next = score
      ? {
          ...score,
          rolling_health: [...score.rolling_health, health].slice(-30),
        }
      : {
          node: id,
          created_at: now,
          health_at_creation: health,
          rolling_health: [health],
        }

    await Bun.write(this.score(id), JSON.stringify(next, null, 2))
  }

  async list(): Promise<string[]> {
    const dir = resolve(this.root, "tree")
    const out = await Array.fromAsync(new Bun.Glob("**/node.json").scan({ cwd: dir }))
    return out.map(x => x.replace(/\/node\.json$/, ""))
  }
}
