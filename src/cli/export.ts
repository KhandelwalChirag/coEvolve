import Bun from "bun"
import { resolve } from "path"
import { HarnessWriter } from "../harness/writer.js"

export async function exportHarness(dir: string, out?: string): Promise<string> {
  const writer = new HarnessWriter(resolve(dir, ".coevolve", "harness"))
  const cur = await writer.init()
  const path = out
    ? resolve(dir, out)
    : resolve(dir, ".coevolve", "export", `harness-${Date.now()}.json`)
  await Bun.write(path, JSON.stringify(cur, null, 2))
  return `export_written: ${path}`
}
