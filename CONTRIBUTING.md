# Contributing to CoEvolve

CoEvolve is a standard TypeScript Node.js package. It uses `bun` for fast package management, test execution, and type checking, and `changesets` for versioning.

## Development Setup

1. Ensure you have `bun` installed on your system.
2. Clone the repository natively:
   ```bash
   git clone https://github.com/opencode-ai/coevolve.git
   cd coevolve
   bun install
   ```

## Key Commands

- `bun run typecheck` — Validates TypeScript types (we enforce strict checking without emitting JS locally, as the build step is automated).
- `bun test` — Runs the test suite via the `bun test` framework. It is fast and enforces high coverage.
- `bun run release` — Usually run automatically by CI. Builds the package and pushes to NPM.

## Submitting Changes

We use [Changesets](https://github.com/changesets/changesets) to manage semantic version bumps and changelogs.
When you finish a feature or fix a bug:

1. Run `bunx changeset` locally and follow the prompt. Ensure you select the appropriate semver bump (patch, minor, major) for your change, and provide an accurate changelog message.
2. Commit the generated `.changeset/*.md` file alongside your code.
3. Open a Pull Request.

Upon merge to `main`, GitHub Actions will automatically create a "Release Pull Request" detailing the final changelog. Merging that PR deploys the new version directly to NPM!

## Plugin Architecture
If you are adding new core behaviors, ensure that any heavy logic added to `src/plugin.ts` remains decoupled and asynchronous to guarantee OpenCode's main execution loop does not visually halt or lag while traces are recording.
