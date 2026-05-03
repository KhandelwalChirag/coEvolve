import { type Hooks, type PluginInput } from "@opencode-ai/plugin"
import { type Part } from "@opencode-ai/sdk"
import { resolve } from "path"
import { SessionTraceRecorder } from "./trace/index.js"
import { extractAllSignals, calculateHealthScore } from "./signal/index.js"
import { SignalsWriter } from "./signal/writer.js"
import { gitDiffSummary } from "./git/index.js"
import { ReflectionGenerator } from "./reflection/generator.js"
import { ReflectionWriter } from "./reflection/writer.js"
import { MemoryGenerator } from "./memory/generator.js"
import { MemoryWriter } from "./memory/writer.js"
import { HarnessWriter } from "./harness/writer.js"
import { HarnessApplicator } from "./harness/applicator.js"
import { HarnessBootstrap } from "./harness/bootstrap.js"
import { HarnessOps } from "./harness/ops.js"
import { HarnessTree } from "./harness/tree.js"
import { ProposerWriter } from "./proposer/writer.js"
import { ProposerTrigger } from "./proposer/trigger.js"
import { ProposerGenerator } from "./proposer/generator.js"
import { ProposerRunner } from "./proposer/runner.js"
import { ProposerReview } from "./proposer/review.js"
import { autoConfig, autoSafe } from "./proposer/auto.js"
import { analyze } from "./cli/analyze.js"
import { exportHarness } from "./cli/export.js"
import { explain } from "./cli/explain.js"
import { history } from "./cli/history.js"
import { report } from "./cli/report.js"
import { reset } from "./cli/reset.js"
import { status } from "./cli/status.js"
import { sessions } from "./cli/common.js"

/**
 * CoEvolve plugin - tracks session traces and extracts signals
 * This is Phase 0 - foundation layer
 */

type State = {
  id: string
  trace: SessionTraceRecorder
  sig: SignalsWriter
  start: number
  tool: Map<string, number>
}

export async function coevolvePlugin(input: PluginInput): Promise<Hooks> {
  const { project, directory, client } = input
  const reflectionGenerator = new ReflectionGenerator({ client, directory })
  const memoryGenerator = new MemoryGenerator({ client, directory })
  const harnessWriter = new HarnessWriter(resolve(directory, ".coevolve", "harness"))
  const harnessTree = new HarnessTree(resolve(directory, ".coevolve", "harness"))
  const harnessApplicator = new HarnessApplicator()
  const bootstrap = new HarnessBootstrap({ directory, client })
  const proposerWriter = new ProposerWriter(resolve(directory, ".coevolve", "proposals"))
  const proposerTrigger = new ProposerTrigger({ directory, writer: proposerWriter })
  const proposerGenerator = new ProposerGenerator({ directory, client })
  const proposerRunner = new ProposerRunner({
    directory,
    writer: proposerWriter,
    trigger: proposerTrigger,
    generator: proposerGenerator,
  })
  const review = new ProposerReview(directory)
  const ops = new HarnessOps(resolve(directory, ".coevolve", "harness"))
  const state = new Map<string, State>()
  await harnessWriter.init(await bootstrap.seed())
  await proposerWriter.init()

  const auto = async (): Promise<boolean> => {
    const path = resolve(directory, ".coevolve", "config.json")
    const data = await Bun.file(path).json().catch(() => ({}))
    return autoConfig(data).auto_apply
  }

  const applyAuto = async (id: string | null): Promise<void> => {
    if (!id) return
    if (!(await auto())) return
    const hit = await proposerWriter.readPendingEntry(id)
    if (!hit) return
    if (!autoSafe(hit.proposal)) return
    await review.apply({ id })
  }

  const open = async (id: string): Promise<State> => {
    const hit = state.get(id)
    if (hit) return hit
    const trace = new SessionTraceRecorder({
      basePath: resolve(directory, ".coevolve", "experience"),
      sessionID: id,
      projectID: project.id,
      directory,
    })
    await trace.init()
    const row = {
      id,
      trace,
      sig: new SignalsWriter(trace.getSessionPath()),
      start: Date.now(),
      tool: new Map<string, number>(),
    }
    state.set(id, row)
    return row
  }

  const close = async (row: State): Promise<void> => {
    const events = await row.trace.getEvents()
    const messageCount = events.filter(x => x.type === "message").length
    const toolCallCount = events.filter(x => x.type === "tool_call").length
    const acceptedEdits = events.filter(
      x => x.type === "tool_result" && x.tool === "edit" && x.status === "success",
    ).length

    const history = await sessions(directory)
    const diff = await gitDiffSummary(directory)

    const signals = extractAllSignals(events, {
      messageCount,
      acceptedEdits,
      toolCallCount,
      reversionData: {
        filePaths: diff.filePaths,
        linesReverted: diff.linesRemoved,
      },
      history,
      sessionID: row.id,
    })

    const healthScore = calculateHealthScore(signals)
    const effort = (messageCount + toolCallCount * 2) / Math.max(1, acceptedEdits)

    await row.sig.write({
      sessionID: row.id,
      signals,
      healthScore,
      messageCount,
      acceptedEdits,
      toolCallCount,
      tokensPerAcceptedEditLine: effort,
    })

    const reflection = await reflectionGenerator.generate({
      sessionID: row.id,
      projectID: project.id,
      traceEvents: events as Array<Record<string, unknown>>,
      signals,
      healthScore,
      messageCount,
      toolCallCount,
      acceptedEdits,
      summary: `signals=${signals.length};tools=${toolCallCount};messages=${messageCount}`,
    })

    const reflectionWriter = new ReflectionWriter(row.trace.getSessionPath())
    await reflectionWriter.write(reflection)

    const memoryWriter = new MemoryWriter(resolve(directory, ".coevolve", "memory"))
    await memoryWriter.init()
    const existing = await memoryWriter.readNodes()
    const node = await memoryGenerator.generate(
      {
        sessionID: row.id,
        projectID: project.id,
        signals,
        healthScore,
        summary: reflection.task_summary,
        reflection,
      },
      existing,
    )
    const mem = await memoryWriter.append(node)

    const live = await harnessWriter.readCurrent()
    await harnessTree.recordHealth(live.tree_node, healthScore)

    const run = await proposerRunner.run()
    if (run.state === "created") {
      await applyAuto(run.proposal_id)
    }

    const end = Date.now()
    await row.trace.saveMetadata({
      started: row.start,
      ended: end,
      duration_ms: end - row.start,
      signal_count: signals.length,
      health_score: healthScore,
      memory_node_id: mem.id,
    })

    state.delete(row.id)
  }

  return {
    "command.execute.before": async (cmdInput, output) => {
      const name = cmdInput.command.trim().toLowerCase()
      const raw = cmdInput.arguments.trim()
      const args = raw.split(/\s+/).filter(Boolean)
      const cmd = (args[0] ?? "").toLowerCase()
      const id = args[1]
      if (!(name === "coevolve" || name === "/coevolve")) return

      const result = cmd === "evolve"
        ? await proposerRunner.run({ manual: true })
        : cmd === "apply"
          ? await review.apply({ id })
          : cmd === "dismiss"
            ? await review.dismiss({ id, note: raw.split(/\s+/).slice(2).join(" ") || undefined })
            : cmd === "status"
              ? { state: "ok", reason: await status(directory), proposal_id: null }
            : cmd === "analyze"
              ? { state: "ok", reason: await analyze(directory), proposal_id: null }
            : cmd === "history"
              ? { state: "ok", reason: await history(directory), proposal_id: null }
            : cmd === "rollback"
              ? id
                ? (await ops.rollback(id), { state: "ok", reason: `rolled_back:${id}`, proposal_id: null })
                : { state: "skipped", reason: "missing_node", proposal_id: null }
            : cmd === "lock"
              ? id
                ? (await ops.lock(id), { state: "ok", reason: `locked:${id}`, proposal_id: null })
                : { state: "skipped", reason: "missing_rule", proposal_id: null }
            : cmd === "unlock"
              ? id
                ? (await ops.unlock(id), { state: "ok", reason: `unlocked:${id}`, proposal_id: null })
                : { state: "skipped", reason: "missing_rule", proposal_id: null }
            : cmd === "export"
              ? { state: "ok", reason: await exportHarness(directory, args[1]), proposal_id: null }
            : cmd === "reset"
              ? { state: "ok", reason: await reset({ directory, client }), proposal_id: null }
            : cmd === "report"
              ? { state: "ok", reason: await report(directory), proposal_id: null }
            : cmd === "explain"
              ? { state: "ok", reason: await explain(directory, id), proposal_id: null }
            : null
      if (!result) return

      const part = {
        type: "text",
        text: `CoEvolve ${cmd}: ${result.state}${result.proposal_id ? ` id=${result.proposal_id}` : ""}\n${result.reason}`,
      }
      output.parts.push(part as unknown as Part)
    },

    "experimental.chat.system.transform": async (msgInput, output) => {
      const harness = await harnessWriter.readCurrent()
      const block = await harnessApplicator.build({
        harness,
        directory,
        sessionID: msgInput.sessionID,
      })
      if (!block) return
      output.system = [...output.system, block]
    },

    /**
     * Called when a new message is received
     * Tracks message flow and detects user corrections
     */
    "chat.message": async (msgInput, output) => {
      const row = await open(msgInput.sessionID)

      // Record message
      const { message } = output
      const role = message.role === "user" ? "user" : "assistant"
      const text = output.parts
        .filter(part => part.type === "text")
        .map(part => part.text)
        .join(" ")

      // Detect reprompt patterns from user messages
      let signal: "reprompt" | "initial" | undefined
      if (message.role === "user" && text) {
        const lower = text.toLowerCase()
        if (
          lower.includes("actually") ||
          lower.includes("no,") ||
          lower.includes("instead") ||
          lower.includes("i said") ||
          lower.includes("you missed")
        ) {
          signal = "reprompt"
        } else if (lower.startsWith("/")) {
          signal = "initial"
        }
      }

      await row.trace.recordMessage(role, signal)
    },

    /**
     * Called before tool execution
     * Tracks tool invocations
     */
    "tool.execute.before": async (toolInput, output) => {
      const sid = toolInput.sessionID
      if (!sid) return
      const row = await open(sid)

      const { tool, callID } = toolInput
      const { args } = output

      row.tool.set(String(callID ?? tool), Date.now())

      // Extract path from common tools
      let path: string | undefined
      if (args && typeof args === "object") {
        if ("path" in args) path = args.path as string
        if ("file" in args) path = args.file as string
      }

      await row.trace.recordToolCall(tool, path, args as Record<string, unknown> | undefined)
    },

    /**
     * Called after tool execution
     * Records tool results
     */
    "tool.execute.after": async (toolInput, output) => {
      const sid = toolInput.sessionID
      if (!sid) return
      const row = await open(sid)

      const { tool } = toolInput
      const { output: toolOutput } = output

      // Assume success if output is provided
      const status = toolOutput ? ("success" as const) : ("error" as const)
      const key = String(toolInput.callID ?? tool)
      const start = row.tool.get(key)
      const duration = start ? Date.now() - start : 0
      row.tool.delete(key)

      await row.trace.recordToolResult(tool, status, duration)
    },

    /**
     * Called on events (session created, updated, etc.)
     * Detects session end to trigger signal extraction
     */
    event: async (eventInput) => {
      const { event } = eventInput
      if (event.type !== "session.deleted") return

      const sid = (event as { sessionID?: string }).sessionID
      if (sid) {
        const row = state.get(sid)
        if (row) await close(row)
        return
      }

      const rows = [...state.values()]
      await Promise.all(rows.map(close))
    },
  }
}

export default coevolvePlugin
