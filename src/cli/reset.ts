import Bun from "bun"
import { cp, rm } from "fs/promises"
import { resolve } from "path"
import { HarnessBootstrap } from "../harness/bootstrap.js"
import { HarnessWriter } from "../harness/writer.js"

type Input = {
  directory: string
  client?: unknown
}

export async function reset(input: Input): Promise<string> {
  const dir = input.directory
  const root = resolve(dir, ".coevolve")
  const ts = Date.now()
  const arch = resolve(root, "archive", `reset-${ts}`)
  const harness = resolve(root, "harness")
  const proposals = resolve(root, "proposals")

  if (await Bun.file(harness).exists()) {
    await cp(harness, resolve(arch, "harness"), { recursive: true })
    await rm(harness, { recursive: true, force: true })
  }

  if (await Bun.file(proposals).exists()) {
    await cp(proposals, resolve(arch, "proposals"), { recursive: true })
    await rm(proposals, { recursive: true, force: true })
  }

  const boot = new HarnessBootstrap({ directory: dir, client: input.client })
  const writer = new HarnessWriter(harness)
  await writer.init(await boot.seed())
  return `reset_complete: archive=${arch}`
}
