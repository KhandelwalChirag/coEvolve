import Bun from "bun"
import { dirname, resolve } from "path"
import { Harness, type Harness as Info } from "./types.js"

export class HarnessWriter {
  private root: string

  constructor(root = ".coevolve/harness") {
    this.root = root
  }

  private current(): string {
    return resolve(this.root, "current.json")
  }

  private tree(): string {
    return resolve(this.root, "tree")
  }

  private file(id: string): string {
    return resolve(this.tree(), id, "harness.json")
  }

  private score(id: string): string {
    return resolve(this.tree(), id, "score.json")
  }

  private node(id: string): string {
    return resolve(this.tree(), id, "node.json")
  }

  async init(seed?: Partial<Info>): Promise<Info> {
    const cur = this.current()
    if (await Bun.file(cur).exists()) {
      return this.readCurrent()
    }

    const now = Date.now()
    const info = Harness.parse({
      version: "1.0",
      created_at: now,
      updated_at: now,
      tree_node: "root",
      parent_node: null,
      health_at_creation: 0.5,
      source: "manual",
      confidence: "low",
      ...seed,
    })

    await Bun.write(cur, JSON.stringify(info, null, 2))
    await Bun.write(this.file("root"), JSON.stringify(info, null, 2))
    await Bun.write(
      this.score("root"),
      JSON.stringify(
        {
          node: "root",
          created_at: now,
          health_at_creation: info.health_at_creation,
          rolling_health: [info.health_at_creation],
        },
        null,
        2,
      ),
    )
    await Bun.write(
      this.node("root"),
      JSON.stringify(
        {
          id: "root",
          parent: null,
          children: [],
          created_at: now,
          note: "initial_harness",
        },
        null,
        2,
      ),
    )

    return info
  }

  async readCurrent(): Promise<Info> {
    const file = Bun.file(this.current())
    const data = await file.json()
    return Harness.parse(data)
  }

  async writeCurrent(input: Info): Promise<void> {
    const info = Harness.parse({
      ...input,
      updated_at: Date.now(),
    })
    await Bun.write(this.current(), JSON.stringify(info, null, 2))
  }

  async writeNode(id: string, input: Info): Promise<void> {
    const info = Harness.parse(input)
    await Bun.write(this.file(id), JSON.stringify(info, null, 2))
  }

  async readNode(id: string): Promise<Info | null> {
    const file = Bun.file(this.file(id))
    if (!(await file.exists())) return null
    return Harness.parse(await file.json())
  }

  async listNodes(): Promise<string[]> {
    const dir = this.tree()
    if (!(await Bun.file(dir).exists())) return []
    const out = await Array.fromAsync(new Bun.Glob("*/node.json").scan({ cwd: dir }))
    return out.map(x => dirname(x))
  }
}
