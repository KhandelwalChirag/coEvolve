import Bun from "bun"
import { resolve } from "path"

export type SessionSignals = {
  sessionID: string
  timestamp: number
  health_score: number
  signals: Array<{ type: string; severity: string }>
  message_count?: number
  accepted_edits?: number
  tool_call_count?: number
  tokens_per_accepted_edit_line?: number
}

export async function sessions(dir: string): Promise<SessionSignals[]> {
  const root = resolve(dir, ".coevolve", "experience")
  try {
    const list = await Array.fromAsync(new Bun.Glob("session-*/signals.json").scan({ cwd: root }))
    const out = await Promise.all(
      list.map(async file => Bun.file(resolve(root, file)).json() as Promise<SessionSignals>),
    )
    return out.sort((a, b) => b.timestamp - a.timestamp)
  } catch {
    return []
  }
}

export async function pending(dir: string): Promise<number> {
  const root = resolve(dir, ".coevolve", "proposals", "pending")
  try {
    const list = await Array.fromAsync(new Bun.Glob("proposal-*.json").scan({ cwd: root }))
    return list.length
  } catch {
    return 0
  }
}

export async function historyCount(dir: string): Promise<{ applied: number; dismissed: number }> {
  const applied = resolve(dir, ".coevolve", "proposals", "history", "applied")
  const dismissed = resolve(dir, ".coevolve", "proposals", "history", "dismissed")
  try {
    const [a, d] = await Promise.all([
      Array.fromAsync(new Bun.Glob("proposal-*.json").scan({ cwd: applied })),
      Array.fromAsync(new Bun.Glob("proposal-*.json").scan({ cwd: dismissed })),
    ])
    return { applied: a.length, dismissed: d.length }
  } catch {
    return { applied: 0, dismissed: 0 }
  }
}

export function avg(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((sum, x) => sum + x, 0) / nums.length
}

export function chart(nums: number[], width = 20): string {
  const chars = "▁▂▃▄▅▆▇█"
  if (nums.length === 0) return ""
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const pick = nums.slice(0, width).reverse().reverse()
  if (max === min) return pick.map(() => chars[3]).join("")
  return pick
    .map(x => {
      const i = Math.max(0, Math.min(chars.length - 1, Math.round(((x - min) / (max - min)) * (chars.length - 1))))
      return chars[i]
    })
    .join("")
}

export function formatTs(ts: number): string {
  return new Date(ts).toISOString()
}
