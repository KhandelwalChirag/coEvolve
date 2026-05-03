/**
 * CoEvolve - Evolution layer for OpenCode
 * Makes AI agents learn your project over time
 */

export * from "./trace/index.js"
export * from "./signal/index.js"
export * from "./git/index.js"
export * from "./reflection/index.js"
export * from "./memory/index.js"
export * from "./harness/index.js"
export * from "./proposer/index.js"
export * from "./cli/index.js"
export * from "./tui.js"
export { coevolvePlugin, default } from "./plugin.js"

// Re-export for convenience
export { SessionTraceRecorder } from "./trace/writer.js"
export { SignalsWriter } from "./signal/writer.js"
export { ReflectionGenerator } from "./reflection/generator.js"
export { ReflectionWriter } from "./reflection/writer.js"
export { MemoryGenerator } from "./memory/generator.js"
export { MemoryWriter } from "./memory/writer.js"
export { HarnessWriter } from "./harness/writer.js"
export { ProposerWriter } from "./proposer/writer.js"
export { ProposerTrigger } from "./proposer/trigger.js"
export { ProposerGenerator } from "./proposer/generator.js"
