# CLAUDE.md — association-set

pnpm monorepo: `packages/core` (`@intelena/association-set`) + `packages/cli` + `examples/`. Depends on the sibling repo `../shielded-notes` via `file:` (CI checks it out next to this repo). Run `pnpm build` before `pnpm typecheck`/`test` so the CLI resolves core.

- `SPEC.md` is normative; changes to rules semantics, snapshot shape or innocence constraints update it first.
- Rules must stay pure (no fetches inside rules) — screening results are passed in.
- Snapshot loading must keep rejecting root/size mismatches.
- Commit messages: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, …), English, single line.
