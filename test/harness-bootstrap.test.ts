import { describe, expect, it } from "bun:test"
import { resolve } from "path"
import { HarnessBootstrap } from "../src/harness/index.js"

describe("HarnessBootstrap", () => {
  const root = resolve(`.coevolve-bootstrap-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)

  it("should generate heuristic bootstrap seed", async () => {
    await Bun.write(resolve(root, "README.md"), "hello")
    await Bun.write(resolve(root, "package.json"), '{"name":"x"}')
    await Bun.write(resolve(root, "src", "index.ts"), "export const x = 1")

    const boot = new HarnessBootstrap({ directory: root })
    const out = await boot.seed()

    expect(out.source).toBe("bootstrap")
    expect(out.confidence).toBe("low")
    expect((out.initial_context_files ?? []).some(x => x.path === "README.md")).toBeTrue()
    expect((out.system_prompt_extensions ?? []).length).toBeGreaterThan(0)
  })

  it("should use llm path when client is available", async () => {
    const client = {
      session: {
        create: async () => ({ data: { id: "s1" } }),
        prompt: async () => ({
          data: {
            info: {
              structured: {
                extension: "Prefer existing architecture patterns",
                context: ["README.md"],
              },
            },
            parts: [],
          },
        }),
        delete: async () => ({ data: {} }),
      },
    }

    const boot = new HarnessBootstrap({ directory: root, client })
    const out = await boot.seed()

    expect((out.system_prompt_extensions ?? [])[0].content).toContain("architecture")
    expect((out.initial_context_files ?? [])[0].path).toBe("README.md")
  })
})
