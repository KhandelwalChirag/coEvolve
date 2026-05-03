import { describe, expect, it } from "bun:test"
import { autoConfig, autoSafe } from "../src/proposer/auto.js"

describe("Proposer Auto Apply", () => {
  it("should default auto apply to enabled", () => {
    expect(autoConfig(undefined).auto_apply).toBeTrue()
    expect(autoConfig({}).auto_apply).toBeTrue()
  })

  it("should allow disabling auto apply", () => {
    expect(autoConfig({ auto_apply: false }).auto_apply).toBeFalse()
  })

  it("should auto apply only high confidence additive changes", () => {
    expect(autoSafe({ confidence: "high", change_type: "add_instruction" })).toBeTrue()
    expect(autoSafe({ confidence: "medium", change_type: "add_instruction" })).toBeFalse()
    expect(autoSafe({ confidence: "high", change_type: "remove_instruction" })).toBeFalse()
  })
})
