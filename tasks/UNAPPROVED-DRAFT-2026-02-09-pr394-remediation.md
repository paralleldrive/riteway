# PR #394 Remediation Plan — AI Testing Framework

**PR**: https://github.com/paralleldrive/riteway/pull/394
**Review**: janhesters (review ID: 3764740159)
**Epic**: [tasks/archive/2026-01-22-riteway-ai-testing-framework](tasks/archive/2026-01-22-riteway-ai-testing-framework/2026-01-22-riteway-ai-testing-framework.md)
**Branch**: `riteway-ai-testing-framework-implementation`
**Created**: 2026-02-09

---

## Review Summary

19 inline comments + 1 general review comment across 4 files. Themes:

| Theme | Comments | Severity |
|---|---|---|
| Architecture refactor (judge + orchestrator) | #17, #18, #19, general | High |
| Test patterns & `Try` usage | #6, #8, #9–#13, #14–#16 | High |
| Schema validation (Zod) | #1, #2, #3 | Medium |
| Error handling (error-causes switch) | #4 | Medium |
| Code style (mutations, JS guide) | #5 | Medium |
| Color flag simplification | #7 | Low |
| Failure fixture | general review body | Medium |

## Decisions Made

| Question | Decision | Rationale |
|---|---|---|
| Zod dependency? | **Yes** | More developers will consume the codebase; convenience benefits outweigh bundle cost |
| Architecture refactor scope? | **Full refactor** | AI judge returns structured output + TAP; orchestrator aggregates |
| Color flags? | **`--color` opt-in only** | Drop `--no-color`; default is no color |
| Fail-fast for missing filePath? | **Yes, in `parseAIArgs`** | Zod schema validates required filePath at parse time |

---

## Task Breakdown

### Task 1: Add Zod & Implement Schema Validation for `parseAIArgs`

**Addresses**: Comments #1, #2, #3, #6, #7

**Context**: Replace manual type coercion and magic numbers in `parseAIArgs` with a Zod schema. Centralize defaults. Drop `--no-color` flag.

**Requirements**:
- Given the project needs schema validation, should install `zod` (latest stable, ESM-compatible)
- Given `parseAIArgs` defaults scattered across `minimist` config and inline code, should define a single Zod schema with all defaults centralized
- Given magic number `4` for concurrency (comment #2), should reference a named default constant
- Given `--no-color` flag is redundant (comment #7), should remove it; keep only `--color` (default: false)
- Given `parseAIArgs([])` with no file path (comment #6), should throw a `ValidationError` via Zod when `filePath` is missing
- Given Zod validation errors, should wrap with `createError` from error-causes for consistent error routing
- Given existing tests for `parseAIArgs`, should update tests to reflect Zod validation behavior (missing filePath now throws)
- Given the TDD process, should write tests first, then implement

**Files**:
- `bin/riteway.js` — `parseAIArgs` refactor
- `bin/riteway.test.js` — updated tests

**References**:
- [tdd.mdc](ai/rules/tdd.mdc) — TDD process
- [error-causes.mdc](ai/rules/javascript/error-causes.mdc) — error handling pattern
- [javascript.mdc](ai/rules/javascript/javascript.mdc) — KISS, YAGNI, named defaults
- [Zod docs](https://zod.dev) — official documentation

**Dependencies**: None

---

### Task 2: Refactor `getAgentConfig` Tests to Eliminate IIFEs and Use `Try`

**Addresses**: Comments #8, #9, #10, #11, #12, #13, #14

**Context**: The `getAgentConfig` tests use IIFEs to map output before asserting. The reviewer says `getAgentConfig` should return the shape we actually want to assert against, or the tests should define setup constants before `assert`. Error tests should use Riteway's `Try` pattern.

**Requirements**:
- Given `getAgentConfig` tests with IIFE wrappers (comments #9–#13), should either:
  - (a) Change `getAgentConfig` return value so tests can assert directly without mapping, OR
  - (b) Define setup constants before `assert` (no inline IIFEs)
- Given error test for invalid agent name (comment #14), should use Riteway's [`Try`](https://github.com/paralleldrive/riteway?tab=readme-ov-file#example-usage) pattern instead of try/catch
- Given the test pattern in `describe('getAgentConfig()')`, should follow the same patterns used in other test blocks
- Given the TDD process, should update tests first, then adjust implementation if needed

**Files**:
- `bin/riteway.test.js` — refactor `getAgentConfig` test block
- `bin/riteway.js` — adjust `getAgentConfig` return value if option (a) chosen

**References**:
- [tdd.mdc](ai/rules/tdd.mdc) — test patterns, 5 questions
- [javascript.mdc](ai/rules/javascript/javascript.mdc) — avoid IIFEs, KISS
- [Riteway Try docs](https://github.com/paralleldrive/riteway?tab=readme-ov-file#example-usage)

**Dependencies**: Task 1 (schema changes may affect agent config validation)

---

### Task 3: Refactor `runAICommand` Tests to Use `Try` and Promise Rejection

**Addresses**: Comments #14, #15, #16

**Context**: `runAICommand` returns a promise. Error cases should reject (not throw), and tests should use `Try` or `.then`/`.catch` branching instead of try/catch blocks.

**Requirements**:
- Given `runAICommand` returns a promise (comment #15), should test errors via rejection: `result.catch(error => ...)` with assertions in the `.catch` branch
- Given the Riteway `Try` helper (comment #14), should use it where applicable for sync error testing
- Given test blocks at lines 543–611 with try/catch (comment #16 "Same here"), should refactor all to promise-based or `Try`-based patterns
- Given the TDD process, should refactor tests to new pattern, verify they still pass

**Files**:
- `bin/riteway.test.js` — refactor `runAICommand` test block

**References**:
- [tdd.mdc](ai/rules/tdd.mdc) — test isolation, explicit tests
- [Riteway Try docs](https://github.com/paralleldrive/riteway?tab=readme-ov-file#example-usage)

**Dependencies**: Task 1 (validation now in parseAIArgs may change which errors runAICommand throws)

---

### Task 4: Apply Error-Causes Switch in `ai-runner.js`

**Addresses**: Comment #4

**Context**: `ai-runner.js` uses ad-hoc `createError` calls. The reviewer wants the `errorCauses` switch pattern (already used in `bin/riteway.js`) applied to `ai-runner.js` error handling.

**Requirements**:
- Given error handling in `ai-runner.js` uses individual `createError` calls (comment #4), should define error causes with `errorCauses()` at module level
- Given error types already present (SecurityError, ValidationError, ParseError), should register them in the `errorCauses` definition
- Given the `handleApiErrors` pattern in [error-causes.mdc](ai/rules/javascript/error-causes.mdc), should export error handler for consumer use
- Given existing tests in `source/ai-runner.test.js`, should verify error names/codes still match
- Given the TDD process, should verify tests pass after refactor

**Files**:
- `source/ai-runner.js` — add `errorCauses()` definition, refactor `createError` calls
- `source/ai-runner.test.js` — verify/update error assertions

**References**:
- [error-causes.mdc](ai/rules/javascript/error-causes.mdc) — `errorCauses` + `handleApiErrors` pattern
- [javascript.mdc](ai/rules/javascript/javascript.mdc) — DRY, composition

**Dependencies**: None (parallel with Tasks 1–3)

---

### Task 5: Code Style Review — Eliminate Mutations in `bin/riteway.js`

**Addresses**: Comment #5

**Context**: The reviewer asks to `/review` the file against the JavaScript style guide. Focus on avoiding mutations per `javascript.mdc` principles.

**Requirements**:
- Given `runAICommand` uses `let outputPath` and `let error` with reassignment (comment #5), should refactor to use immutable patterns (const, early return, pipe)
- Given the `asyncPipe` pattern already in the file, should leverage it where appropriate
- Given `console.log` sequences in `runAICommand` (lines 130–137, 184–192), should evaluate whether a logging utility or pipeline would reduce imperative mutation
- Given `assertions.forEach` with side effects (line 189), should prefer `map`/`join` for string building per [javascript.mdc](ai/rules/javascript/javascript.mdc)
- Given the TDD process, should ensure all tests still pass after refactoring

**Files**:
- `bin/riteway.js` — refactor `runAICommand` for immutability

**References**:
- [javascript.mdc](ai/rules/javascript/javascript.mdc) — favor immutability, functional style, map/filter/reduce over loops
- [tdd.mdc](ai/rules/tdd.mdc) — tests pass after refactor

**Dependencies**: Tasks 1, 4 (Zod and error-causes changes should land first)

---

### Task 6: Architecture Refactor — AI Judge + Orchestrator Pattern

**Addresses**: Comments #17, #18, #19, general review body

**Context**: This is the highest-impact change. The reviewer's architecture vision:
- The orchestrator reads the test file and dispatches subagents
- The AI judge is the only thing returning structured output
- TAP format from the judge can be deterministically parsed
- Structured output gets pushed to the orchestrator for aggregation
- The current `parseStringResult`/`validateFilePath`-for-imports approach is "probably wrong" because the AI should extract the prompt under test
- Fixture files should use `import @ai/rules/ui.mdc;` syntax — the orchestrator resolves imports

**Requirements**:
- Given the architecture diagram from the reviewer, should refactor so:
  1. **Orchestrator** (`ai-runner.js` / `runAITests`): reads test file, resolves imports, dispatches subagent per assertion
  2. **AI Judge** (subagent): receives prompt + requirement, returns structured `{passed, output, reasoning}` (the evaluation prompt template already does this)
  3. **Aggregator**: collects judge responses, applies threshold logic, produces final results
- Given comment #18 ("we likely won't need `validateFilePath` if AI extracts prompt under test"), should evaluate whether `validateFilePath` in its current position is still needed or should move
- Given comment #19 ("any parsing step is probably wrong"), should remove or simplify `parseStringResult` — the AI judge returns structured JSON, and TAP is deterministic; no fuzzy parsing needed
- Given fixture file `media-embed-test.sudo` (comment #17), should use `import @ai/rules/ui.mdc;` pattern (it already does — verify correctness)
- Given the general review comment, should create a **failure fixture** (`.sudo` file with an intentionally wrong prompt) to verify tests correctly fail
- Given `test-extractor.js` two-phase architecture, should evaluate which parts survive — the extraction phase may simplify if the orchestrator handles dispatch directly
- Given the TDD process, should write tests for new architecture components before implementing

**Files**:
- `source/ai-runner.js` — refactor to orchestrator pattern
- `source/test-extractor.js` — simplify or merge into orchestrator
- `source/ai-runner.test.js` — new/updated tests
- `source/test-extractor.test.js` — new/updated tests
- `source/fixtures/media-embed-test.sudo` — verify import syntax
- `source/fixtures/failing-test.sudo` — **NEW** failure fixture

**References**:
- [Epic requirements](tasks/archive/2026-01-22-riteway-ai-testing-framework/2026-01-22-riteway-ai-testing-framework.md) — "Given test file contents, should pass entire file to AI agent (don't parse)"
- [tdd.mdc](ai/rules/tdd.mdc) — TDD process
- [javascript.mdc](ai/rules/javascript/javascript.mdc) — composition, one job per function
- [error-causes.mdc](ai/rules/javascript/error-causes.mdc) — structured errors for judge failures

**Dependencies**: Tasks 4, 5 (error-causes switch and style cleanup should land first to minimize merge conflicts)

---

### Task 7: Update Help Text, README, and Documentation

**Addresses**: Downstream effects of all changes

**Requirements**:
- Given `--no-color` removed (Task 1), should update help text in `bin/riteway.js` and README
- Given architecture changes (Task 6), should update README's "Testing AI Prompts" section if the workflow changes
- Given Zod adoption, should update any contributing docs to mention schema validation approach
- Given all changes, should ensure `--help` output is accurate and consistent with actual behavior

**Files**:
- `bin/riteway.js` — help text
- `README.md` — AI testing section

**Dependencies**: Tasks 1–6

---

## Recommended Follow-ups (Out of Scope)

These are improvements identified during review that should be tracked separately:

1. **Migrate `parseArgs` to Zod** — The original test runner's `parseArgs` function would benefit from the same Zod schema validation pattern applied to `parseAIArgs`. This ensures consistency across both CLI entry points.

2. **Zod schemas for `ai-runner.js` function signatures** — Functions like `runAITests`, `executeAgent`, and `aggregatePerAssertionResults` accept complex option objects that could benefit from Zod validation at module boundaries.

3. **Integration tests for `main()` routing** — The `main()` function routes between test runner and AI runner but has no direct tests (noted in epic Task 6 nice-to-haves).

---

## Execution Order

```
Task 1 (Zod + parseAIArgs) ──┐
Task 4 (error-causes switch) ─┤──→ Task 5 (style) ──→ Task 6 (architecture) ──→ Task 7 (docs)
Task 2 (getAgentConfig tests) ┤
Task 3 (runAICommand tests) ──┘
```

Tasks 1–4 can run in parallel. Task 5 depends on 1 and 4. Task 6 depends on 4 and 5. Task 7 is last.

---

## Comment-to-Task Mapping

| Comment | File | Summary | Task |
|---|---|---|---|
| #1 | bin/riteway.js:90 | Centralize defaults in `default` param | 1 |
| #2 | bin/riteway.js:97 | Replace magic `4` with `defaults.concurrency` | 1 |
| #3 | bin/riteway.js:90 | Bring in Zod for schema validation | 1 |
| #4 | source/ai-runner.js:187 | Use error-causes switch | 4 |
| #5 | bin/riteway.js:160 | Review against JS style guide, avoid mutations | 5 |
| #6 | bin/riteway.test.js:110 | Missing filePath should error | 1 |
| #7 | bin/riteway.test.js:183 | Simplify --color/--no-color | 1 |
| #8 | bin/riteway.test.js:216 | Follow other test patterns | 2 |
| #9 | bin/riteway.test.js:235 | Setup before assert; change return value | 2 |
| #10 | bin/riteway.test.js:247 | Same as #9 | 2 |
| #11 | bin/riteway.test.js:265 | Same as #9 | 2 |
| #12 | bin/riteway.test.js:283 | Same as #9 | 2 |
| #13 | bin/riteway.test.js:301 | Same as #9 | 2 |
| #14 | bin/riteway.test.js:322 | Use `Try` for error testing | 2, 3 |
| #15 | bin/riteway.test.js:354 | Promise rejection + Try | 3 |
| #16 | bin/riteway.test.js:392 | Same as #15 | 3 |
| #17 | fixtures/media-embed-test.sudo:1 | Import syntax + orchestrator dispatch | 6 |
| #18 | source/ai-runner.js:15 | Won't need validateFilePath if AI extracts | 6 |
| #19 | source/ai-runner.js:40 | Parsing is wrong; judge returns structured output | 6 |
| General | — | Need failure fixture for correct test failures | 6 |
