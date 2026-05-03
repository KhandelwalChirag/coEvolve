import Bun from "bun"
import { resolve } from "path"
import { z } from "zod"
import { askJSON } from "../llm/json.js"
import { type Harness } from "./types.js"

type Input = {
  directory: string
  client?: any
}

export class HarnessBootstrap {
  private dir: string
  private client?: any

  constructor(input: Input) {
    this.dir = input.directory
    this.client = input.client
  }

  async seed(): Promise<Partial<Harness>> {
    const llm = await this.llm()
    if (llm) return llm
    return this.local()
  }

  private async llm(): Promise<Partial<Harness> | null> {
    if (!this.client) return null

    const files = await this.files()
    const langs = await this.langs()
    const schema = z.object({
      extension: z.string().min(1),
      context: z.array(z.string()).max(6),
    })

    const out = await askJSON({
      client: this.client,
      directory: this.dir,
      title: "CoEvolve Bootstrap",
      prompt: [
        "Create seed harness hints for this codebase.",
        `Languages: ${langs.join(", ")}`,
        `Files: ${files.join(", ")}`,
      ].join("\n"),
      schema,
    })

    if (!out) return null

    const now = Date.now()
    return {
      source: "bootstrap",
      confidence: "low",
      system_prompt_extensions: [
        {
          id: "ext-bootstrap-1",
          content: out.extension,
          reason: "bootstrap_scan",
          added_at: now,
          added_by: "bootstrap",
          confidence: "medium",
          locked: false,
        },
      ],
      initial_context_files: out.context.map((x, i) => ({
        id: `ctx-bootstrap-${i + 1}`,
        path: x,
        format: "summary_10_lines",
        reason: "bootstrap_scan",
        condition: null,
        locked: false,
      })),
    }
  }

  private async local(): Promise<Partial<Harness>> {
    const langs = await this.langs()
    const files = await this.files()
    const ctx = await this.context(files)
    const now = Date.now()

    return {
      source: "bootstrap",
      confidence: "low",
      system_prompt_extensions: [
        {
          id: "ext-bootstrap-1",
          content: `Project appears to use ${langs.join(", ") || "mixed stack"}. Respect existing patterns before proposing refactors.`,
          reason: "bootstrap_scan",
          added_at: now,
          added_by: "bootstrap",
          confidence: "low",
          locked: false,
        },
      ],
      initial_context_files: ctx.map((x, i) => ({
        id: `ctx-bootstrap-${i + 1}`,
        path: x,
        format: "summary_10_lines",
        reason: "bootstrap_scan",
        condition: null,
        locked: false,
      })),
    }
  }

  private async files(): Promise<string[]> {
    const pick = ["package.json", "README.md", "AGENTS.md", "CLAUDE.md", "tsconfig.json"]
    const out: string[] = []
    for (const name of pick) {
      if (await Bun.file(resolve(this.dir, name)).exists()) out.push(name)
    }
    return out
  }

  private async context(files: string[]): Promise<string[]> {
    const base = ["README.md", "AGENTS.md", "package.json"]
    const out = base.filter(x => files.includes(x))

    const picks = ["src/index.ts", "src/types.ts", "src/main.ts"]
    for (const path of picks) {
      if (await Bun.file(resolve(this.dir, path)).exists()) out.push(path)
    }

    return out.slice(0, 6)
  }

  private async langs(): Promise<string[]> {
    const exts = new Set<string>()
    const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx,py,rs,go,java,kt,swift}")
    for await (const file of glob.scan({ cwd: this.dir })) {
      const ext = file.split(".").pop()
      if (ext) exts.add(ext)
      if (exts.size >= 5) break
    }

    const map: Record<string, string> = {
      ts: "TypeScript",
      tsx: "TypeScript",
      js: "JavaScript",
      jsx: "JavaScript",
      py: "Python",
      rs: "Rust",
      go: "Go",
      java: "Java",
      kt: "Kotlin",
      swift: "Swift",
    }

    return [...exts].map(x => map[x] ?? x)
  }
}
