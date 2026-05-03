import { type Proposal } from "./types.js"

export type AutoConfig = {
  auto_apply: boolean
}

export function autoConfig(raw: unknown): AutoConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { auto_apply: true }
  }

  const val = (raw as { auto_apply?: unknown }).auto_apply
  return {
    auto_apply: val !== false,
  }
}

export function autoSafe(input: Pick<Proposal, "confidence" | "change_type">): boolean {
  if (input.confidence !== "high") return false
  return input.change_type.startsWith("add_")
}
