import Bun from "bun"
import { resolve } from "path"
import { z } from "zod"
import { type TriggerCheck } from "./types.js"
import { type ProposerWriter } from "./writer.js"

const Signals = z.object({
  sessionID: z.string(),
  timestamp: z.number(),
  signals: z.array(z.object({ type: z.string() })),
})

type Input = {
  directory: string
  writer: ProposerWriter
}

export class ProposerTrigger {
  private dir: string
  private writer: ProposerWriter

  constructor(input: Input) {
    this.dir = input.directory
    this.writer = input.writer
  }

  async check(input?: { manual?: boolean }): Promise<TriggerCheck> {
    const list = await this.sessions()
    const top = list.slice(0, 10)
    const last = await this.writer.lastGeneratedAt()
    const reprompt = top.filter(x => x.signals.some(y => y.type === "REPROMPT")).length
    const reversion = top.filter(x => x.signals.some(y => y.type === "REVERSION")).length

    const stats = {
      sessions_since_last: list.filter(x => x.timestamp > last).length,
      reprompt_rate: top.length > 0 ? reprompt / top.length : 0,
      reversion_rate: top.length > 0 ? reversion / top.length : 0,
      recent_sessions: top.length,
    }

    if (input?.manual) {
      return { should: true, reason: "manual", stats }
    }

    if (stats.sessions_since_last >= 10) {
      return { should: true, reason: "session_count", stats }
    }

    if (stats.reprompt_rate > 0.3) {
      return { should: true, reason: "reprompt_rate", stats }
    }

    if (stats.reversion_rate > 0.25) {
      return { should: true, reason: "reversion_rate", stats }
    }

    return { should: false, reason: "none", stats }
  }

  private async sessions(): Promise<Array<z.infer<typeof Signals>>> {
    const root = resolve(this.dir, ".coevolve", "experience")
    try {
      const files = await Array.fromAsync(new Bun.Glob("session-*/signals.json").scan({ cwd: root }))
      const list = await Promise.all(files.map(async file => Signals.parse(await Bun.file(resolve(root, file)).json())))
      return list.sort((a, b) => b.timestamp - a.timestamp)
    } catch {
      return []
    }
  }
}
