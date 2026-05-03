# @opencode-ai/coevolve

CoEvolve is an autonomous AI agent that runs in the background of OpenCode. As you work and interact with your project, CoEvolve observes your sessions, learns your codebase's patterns, and continuously generates custom "harness rules" (system instructions) designed specifically to adapt OpenCode to your project's unique conventions.

## How it works

CoEvolve runs fully in the background via OpenCode's plugin architecture:
1. **Traces**: It records interactions, errors, and tool usage during your OpenCode sessions.
2. **Reflects**: It analyzes completed sessions for friction points (e.g., repeated errors, misaligned paths).
3. **Evolves**: It proactively auto-generates (and applies) "harness proposals" to fix those friction points for future sessions.

## Installation

Because CoEvolve operates locally and hooks directly into the OpenCode lifecycle, you only need to reference its NPM package in your project's standard OpenCode configuration. No complex manual cloning.

1. Ensure you have installed OpenCode.
2. In the root of your project, add the `@opencode-ai/coevolve` package to your OpenCode configuration.

Edit `.opencode/opencode.json`:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "@opencode-ai/coevolve"
  ]
}
```

*(Optional)* To view CoEvolve's local dashboard and interact with its UI inside OpenCode, edit `.opencode/tui.json`:
```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "@opencode-ai/coevolve/dist/tui.js"
  ]
}
```

## Commands

Once installed, you can use these commands inside the OpenCode conversational interface:

- `/coevolve status` - Check the background agent's current health and active rules.
- `/coevolve analyze` - Run an immediate analysis on recent sessions.
- `/coevolve history` - View the evolution history of the project.
- `/coevolve evolve` - Enter the manual review queue for pending system proposals.

## Auto-Apply Behavior

By default, CoEvolve operates safely and autonomously. It will **automatically apply** generated rules if and only if:
- the AI has `high` confidence in the rule.
- the change is strictly additive (`add_*`).

If you prefer to manually review all rules, you can create a local configuration file at `.coevolve/config.json` in your project:
```json
{
  "auto_apply": false
}
```

## Developing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to build and test this project locally.
