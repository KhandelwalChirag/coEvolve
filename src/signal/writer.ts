import { resolve } from "path"
import Bun from "bun"
import { type Signal, type SignalsOutput } from "./types.js"

/**
 * Signals writer - writes signals to JSON file
 */
export class SignalsWriter {
  private sessionPath: string

  constructor(sessionPath: string) {
    this.sessionPath = sessionPath
  }

  /**
   * Write signals to file
   */
  async write(input: {
    sessionID: string
    signals: Signal[]
    healthScore: number
    messageCount?: number
    acceptedEdits?: number
    toolCallCount?: number
    tokensPerAcceptedEditLine?: number
  }): Promise<void> {
    const output: SignalsOutput = {
      sessionID: input.sessionID,
      signals: input.signals,
      health_score: input.healthScore,
      timestamp: Date.now(),
      message_count: input.messageCount,
      accepted_edits: input.acceptedEdits,
      tool_call_count: input.toolCallCount,
      tokens_per_accepted_edit_line: input.tokensPerAcceptedEditLine,
    }

    const path = resolve(this.sessionPath, "signals.json")
    await Bun.write(path, JSON.stringify(output, null, 2))
  }

  /**
   * Read signals from file
   */
  async read(): Promise<SignalsOutput | null> {
    const path = resolve(this.sessionPath, "signals.json")
    const file = Bun.file(path)
    if (!(await file.exists())) return null
    const text = await file.text()
    return JSON.parse(text) as SignalsOutput
  }
}
