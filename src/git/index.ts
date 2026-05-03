import { $ } from "bun"

/**
 * Git utilities for detecting edit reversions
 */

export type DiffSummary = {
  filePaths: string[]
  linesAdded: number
  linesRemoved: number
  filesChanged: number
}

/**
 * Get git diff summary
 * Detects which lines were changed but reverted
 */
export async function gitDiffSummary(cwd: string, fromRef = "HEAD"): Promise<DiffSummary> {
  try {
    // Get list of changed files
    const filesOutput = await $`cd ${cwd} && git diff ${fromRef} --name-only`.text()
    const filePaths = filesOutput
      .trim()
      .split("\n")
      .filter(Boolean)

    // Get unified diff to count additions/deletions
    const diffOutput = await $`cd ${cwd} && git diff ${fromRef}`.text()
    const lines = diffOutput.split("\n")

    let added = 0
    let removed = 0

    for (const line of lines) {
      if (line.startsWith("+") && !line.startsWith("+++")) added++
      if (line.startsWith("-") && !line.startsWith("---")) removed++
    }

    return {
      filePaths,
      linesAdded: added,
      linesRemoved: removed,
      filesChanged: filePaths.length,
    }
  } catch {
    // Not a git repo or git not available
    return {
      filePaths: [],
      linesAdded: 0,
      linesRemoved: 0,
      filesChanged: 0,
    }
  }
}

/**
 * Check if file was modified from a reference point
 */
export async function gitFileModified(cwd: string, filePath: string, fromRef = "HEAD"): Promise<boolean> {
  try {
    const output = await $`cd ${cwd} && git diff ${fromRef} -- ${filePath}`.text()
    return output.trim().length > 0
  } catch {
    return false
  }
}

/**
 * Get git status to detect if changes are staged
 */
export async function gitStatus(cwd: string): Promise<{
  staged: string[]
  unstaged: string[]
  untracked: string[]
}> {
  try {
    const output = await $`cd ${cwd} && git status --porcelain`.text()
    const lines = output.trim().split("\n").filter(Boolean)

    const staged: string[] = []
    const unstaged: string[] = []
    const untracked: string[] = []

    for (const line of lines) {
      const status = line.substring(0, 2)
      const filePath = line.substring(3)

      if (status === "??") {
        untracked.push(filePath)
      } else if (status[0] !== " ") {
        staged.push(filePath)
      } else if (status[1] !== " ") {
        unstaged.push(filePath)
      }
    }

    return { staged, unstaged, untracked }
  } catch {
    return { staged: [], unstaged: [], untracked: [] }
  }
}
