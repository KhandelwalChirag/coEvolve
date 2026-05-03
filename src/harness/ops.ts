import { HarnessWriter } from "./writer.js"

export class HarnessOps {
  private writer: HarnessWriter

  constructor(root = ".coevolve/harness") {
    this.writer = new HarnessWriter(root)
  }

  async rollback(node: string): Promise<void> {
    await this.writer.init()
    const info = await this.writer.readNode(node)
    if (!info) throw new Error(`missing_node:${node}`)
    await this.writer.writeCurrent(info)
  }

  async lock(rule: string): Promise<void> {
    await this.writer.init()
    const cur = await this.writer.readCurrent()

    const ext = cur.system_prompt_extensions.map(x => x.id === rule ? { ...x, locked: true } : x)
    const ctx = cur.initial_context_files.map(x => x.id === rule ? { ...x, locked: true } : x)
    const tool = cur.tool_preferences.map(x => x.id === rule ? { ...x, locked: true } : x)
    const sup = cur.suppression_rules.map(x => x.id === rule ? { ...x, locked: true } : x)
    const aci = cur.aci_format_rules.map(x => x.id === rule ? { ...x, locked: true } : x)

    const text = this.text({ ext, ctx, tool, sup, aci }, rule)
    const inv = cur.invariant_rules.some(x => x.id === rule || x.id === `inv-${rule}`)
      ? cur.invariant_rules
      : text
        ? [...cur.invariant_rules, { id: `inv-${rule}`, content: text, set_by: "user" as const, locked: true as const }]
        : cur.invariant_rules

    await this.writer.writeCurrent({
      ...cur,
      system_prompt_extensions: ext,
      initial_context_files: ctx,
      tool_preferences: tool,
      suppression_rules: sup,
      aci_format_rules: aci,
      invariant_rules: inv,
    })
  }

  async unlock(rule: string): Promise<void> {
    await this.writer.init()
    const cur = await this.writer.readCurrent()

    await this.writer.writeCurrent({
      ...cur,
      system_prompt_extensions: cur.system_prompt_extensions.map(x => x.id === rule ? { ...x, locked: false } : x),
      initial_context_files: cur.initial_context_files.map(x => x.id === rule ? { ...x, locked: false } : x),
      tool_preferences: cur.tool_preferences.map(x => x.id === rule ? { ...x, locked: false } : x),
      suppression_rules: cur.suppression_rules.map(x => x.id === rule ? { ...x, locked: false } : x),
      aci_format_rules: cur.aci_format_rules.map(x => x.id === rule ? { ...x, locked: false } : x),
      invariant_rules: cur.invariant_rules.filter(x => x.id !== rule && x.id !== `inv-${rule}`),
    })
  }

  private text(
    all: {
      ext: Array<{ id: string; content: string }>
      ctx: Array<{ id: string; path: string }>
      tool: Array<{ id: string; rule: string }>
      sup: Array<{ id: string; rule: string }>
      aci: Array<{ id: string; rule: string }>
    },
    rule: string,
  ): string | null {
    const ext = all.ext.find(x => x.id === rule)
    if (ext) return ext.content
    const ctx = all.ctx.find(x => x.id === rule)
    if (ctx) return `Context file: ${ctx.path}`
    const tool = all.tool.find(x => x.id === rule)
    if (tool) return tool.rule
    const sup = all.sup.find(x => x.id === rule)
    if (sup) return sup.rule
    const aci = all.aci.find(x => x.id === rule)
    if (aci) return aci.rule
    return null
  }
}
