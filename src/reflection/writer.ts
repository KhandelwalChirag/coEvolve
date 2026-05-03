import { resolve } from "path"
import Bun from "bun"
import { type ReflectionNote } from "./types.js"

/**
 * Reflection writer - saves reflection notes to JSON
 */
export class ReflectionWriter {
  private sessionPath: string

  constructor(sessionPath: string) {
    this.sessionPath = sessionPath
  }

  /**
   * Write reflection to file
   */
  async write(reflection: ReflectionNote): Promise<void> {
    const path = resolve(this.sessionPath, "reflection.json")
    await Bun.write(path, JSON.stringify(reflection, null, 2))
  }

  /**
   * Read reflection from file
   */
  async read(): Promise<ReflectionNote | null> {
    const path = resolve(this.sessionPath, "reflection.json")
    try {
      const file = Bun.file(path)
      const text = await file.text()
      return JSON.parse(text) as ReflectionNote
    } catch {
      return null
    }
  }

  /**
   * Get path to reflection file
   */
  getPath(): string {
    return resolve(this.sessionPath, "reflection.json")
  }
}
