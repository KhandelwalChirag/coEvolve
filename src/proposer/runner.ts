import { ProposerGenerator } from "./generator.js"
import { ProposerSelector } from "./selector.js"
import { ProposerTrigger } from "./trigger.js"
import { ProposerWriter } from "./writer.js"

type Input = {
  directory: string
  writer: ProposerWriter
  trigger: ProposerTrigger
  generator: ProposerGenerator
}

export type RunResult = {
  state: "created" | "skipped"
  reason: string
  proposal_id: string | null
}

export class ProposerRunner {
  private static busy = new Set<string>()
  private dir: string
  private writer: ProposerWriter
  private trigger: ProposerTrigger
  private generator: ProposerGenerator

  constructor(input: Input) {
    this.dir = input.directory
    this.writer = input.writer
    this.trigger = input.trigger
    this.generator = input.generator
  }

  async run(input?: { manual?: boolean }): Promise<RunResult> {
    if (ProposerRunner.busy.has(this.dir)) {
      return {
        state: "skipped",
        reason: "runner_busy",
        proposal_id: null,
      }
    }

    ProposerRunner.busy.add(this.dir)
    return this.exec(input).finally(() => {
      ProposerRunner.busy.delete(this.dir)
    })
  }

  private async exec(input?: { manual?: boolean }): Promise<RunResult> {
    await this.writer.init()

    if (await this.writer.hasPending()) {
      return {
        state: "skipped",
        reason: "pending_exists",
        proposal_id: null,
      }
    }

    const gate = await this.trigger.check({ manual: input?.manual })
    if (!gate.should) {
      return {
        state: "skipped",
        reason: "trigger_not_met",
        proposal_id: null,
      }
    }

    const selector = new ProposerSelector(this.dir)
    const pick = await selector.pick()

    const proposal = await this.generator.generate({
      trigger: gate.reason,
      parent: pick.parent,
      tried: pick.tried,
    })

    if (!proposal) {
      return {
        state: "skipped",
        reason: "insufficient_evidence",
        proposal_id: null,
      }
    }

    await this.writer.writePending(proposal)
    return {
      state: "created",
      reason: gate.reason,
      proposal_id: proposal.id,
    }
  }
}
