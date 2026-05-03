import Bun from "bun"
import { resolve } from "path"
import { type Harness } from "./types.js"

type Input = {
  harness: Harness
  directory: string
  sessionID?: string
}

export class HarnessApplicator {
  async build(input: Input): Promise<string | null> {
    const ext = input.harness.system_prompt_extensions
      .map(x => `- ${x.content}`)

    const ctx = await this.ctx(input)
    const tool = input.harness.tool_preferences.map(x => `- ${x.rule}`)
    const sup = input.harness.suppression_rules.map(x => `- ${x.rule}`)
    const aci = input.harness.aci_format_rules.map(x => `- ${x.rule}`)
    const inv = input.harness.invariant_rules.map(x => `- ${x.content}`)

    const out: string[] = ["[CoEvolve Harness Injection]"]
    if (ext.length > 0) {
      out.push("", "System Prompt Extensions:")
      out.push(...ext)
    }
    if (ctx.length > 0) {
      out.push("", "Initial Context:")
      out.push(...ctx)
    }
    if (tool.length > 0) {
      out.push("", "Tool Preferences:")
      out.push(...tool)
    }
    if (sup.length > 0) {
      out.push("", "Suppression Rules:")
      out.push(...sup)
    }
    if (aci.length > 0) {
      out.push("", "ACI Format Rules:")
      out.push(...aci)
    }
    if (inv.length > 0) {
      out.push("", "Invariant Rules:")
      out.push(...inv)
    }

    if (out.length <= 1) return null
    return out.join("\n")
  }

  private async ctx(input: Input): Promise<string[]> {
    const out: string[] = []
    for (const item of input.harness.initial_context_files) {
      const ok = await this.allow(item.condition, input.directory, input.sessionID)
      if (!ok) continue
      const text = await this.file(input.directory, item.path, item.format)
      if (!text) continue
      out.push(`- ${item.path}`)
      out.push(text)
    }
    return out
  }

  private async allow(cond: string | null, dir: string, sid?: string): Promise<boolean> {
    if (!cond) return true
    if (!cond.startsWith("session_touches_path:")) return false
    if (!sid) return false

    const prefix = cond.replace("session_touches_path:", "")
    const path = resolve(dir, ".coevolve", "experience", `session-${sid}`, "trace.jsonl")
    const file = Bun.file(path)
    if (!(await file.exists())) return false

    const text = await file.text()
    const rows = text.trim().split("\n").filter(Boolean)
    return rows.some(row => {
      try {
        const item = JSON.parse(row) as { type?: string; path?: string }
        return item.type === "tool_call" && typeof item.path === "string" && item.path.startsWith(prefix)
      } catch {
        return false
      }
    })
  }

  private async file(dir: string, path: string, format: "full" | "summary_10_lines" | "summary_20_lines"): Promise<string | null> {
    const full = resolve(dir, path)
    const file = Bun.file(full)
    if (!(await file.exists())) return null
    const text = await file.text()

    if (format === "full") {
      const body = text.length > 4000 ? `${text.slice(0, 4000)}\n... [truncated]` : text
      return "```\n" + body + "\n```"
    }

    const lim = format === "summary_10_lines" ? 10 : 20
    const body = text
      .split("\n")
      .slice(0, lim)
      .join("\n")
    return "```\n" + body + "\n```"
  }
}
