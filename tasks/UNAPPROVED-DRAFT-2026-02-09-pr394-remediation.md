# PR #394 Remediation Plan — Architecture-First Refactor

> **Status:** UNAPPROVED DRAFT — requires user review before any implementation
> **Date:** 2026-02-09
> **PR:** [#394 feat(ai-runner): implement core module with TDD](https://github.com/paralleldrive/riteway/pull/394)
> **Review:** [janhesters review (3764740159)](https://github.com/paralleldrive/riteway/pull/394#pullrequestreview-3764740159) — 19 inline comments + 1 general
> **Epic:** [tasks/archive/2026-01-22-riteway-ai-testing-framework](../tasks/archive/2026-01-22-riteway-ai-testing-framework/2026-01-22-riteway-ai-testing-framework.md)
> **Branch:** `riteway-ai-testing-framework-implementation`
> **Supersedes:** [2026-02-06 remediation plan](../tasks/archive/2026-01-22-riteway-ai-testing-framework/2026-02-06-pr-394-remediation-plan.md) (cursor[bot] + self-review findings — all 7 items resolved)

---

## What Changed Since the Feb 6 Draft

The **Feb 6 remediation plan** addressed cursor[bot] Bugbot findings and the ianwhitedeveloper self-review: dependency misclassification (B1), NaN threshold (B2), import path traversal (B3), concurrency limiting (H1), dead OutputError code (H2), missing `openBrowser: false` (H3), and variable shadowing (H4). **All 7 items were completed and committed.**

This new plan addresses **janhesters' human review** (2026-02-09), which identified a fundamental **architecture concern** not covered by the automated reviews. The key difference: the Feb 6 plan fixed bugs within the existing architecture; this plan may **replace significant portions of that architecture**.

### New in this plan
- **Architecture refactor** (#17, #18, #19) — 3-actor orchestrator-subagent pipeline replacing two-phase extraction
- **Failure fixture** (general comment) — test suite with intentionally wrong prompt
- **Zod schema validation** (#1, #2, #3) — centralized defaults + schema validation
- **Test pattern fixes** (#6, #7, #8, #9-#13, #14, #15, #16) — IIFE removal, Try usage, color flag simplification
- **Error-causes switch** (#4) — module-level `errorCauses` in ai-runner.js
- **Code style mutations** (#5) — eliminate `let` and `forEach` mutations

### Retained from Feb 6
- B1-B3, H1-H4 fixes remain in the codebase (already committed)
- Some of those fixes (e.g., B3 `validateFilePath` in test-extractor, H1 concurrency limiter) may become unnecessary or change scope after the architecture refactor

---

## Review Summary

| Theme | Comments | Severity | Description |
|-------|----------|----------|-------------|
| **Architecture** | #17, #18, #19, general | Critical | Two-phase extraction violates epic; replace with 3-actor orchestrator pipeline |
| **Schema Validation** | #1, #2, #3, #6, #7 | High | Centralize defaults, replace magic numbers, add Zod validation |
| **Test Patterns** | #8, #9-#13 | Medium | Remove IIFEs from getAgentConfig tests |
| **Error Testing** | #14, #15, #16 | Medium | Use Riteway `Try` for sync and async error tests |
| **Error Handling** | #4 | Medium | Switch to `errorCauses` pattern in ai-runner.js |
| **Code Style** | #5 | Low | Eliminate mutations (`let`, `forEach`) |

**Architecture diagrams acknowledged:**

1. **[Diagram 1 — Orchestrator dispatch](https://github.com/user-attachments/assets/7f45f7e9-83b3-4ebc-bbde-d295a108e9c7)** (comment #17): Shows the orchestrator reading test files, resolving imports, and dispatching to the AI subagent. The orchestrator is deterministic; the AI call is the only non-deterministic step.

2. **[Diagram 2 — 3-actor pipeline (PREFERRED/LATEST)](https://github.com/user-attachments/assets/3e444a3f-2d88-408a-8240-fe1f51ac3326)** (comment #19): Shows the full 5-step, 3-actor pipeline: Orchestrator reads and parses deterministically, Result Generator executes the prompt, Judge evaluates per-assertion, Orchestrator aggregates TAP output.

---

## Task 1: Architecture Refactor (MUST BE RESOLVED FIRST)

> **Priority:** #1 — This task must be understood and agreed upon before any other task proceeds, because it may make other changes unnecessary or change their scope significantly.

### Architecture Diagram References (for implementation)

**Local annotated screenshots:**
- Full diagram: `/Users/ianwhite/Desktop/riteway-394-temp/final-arch-diagram.png`
- Steps 1-2 highlighted: `/Users/ianwhite/Desktop/riteway-394-temp/final-arch-diagram-steps-1-2.png`
- Step 3 highlighted: `/Users/ianwhite/Desktop/riteway-394-temp/final-arch-diagram-step-3.png`
- Steps 4-5 highlighted: `/Users/ianwhite/Desktop/riteway-394-temp/final-arch-diagram-steps-4-5.png`

**PR review diagram URLs:**
- [Diagram 1 (comment #17)](https://github.com/user-attachments/assets/7f45f7e9-83b3-4ebc-bbde-d295a108e9c7) — Orchestrator dispatch
- [Diagram 2 (comment #19, preferred/latest)](https://github.com/user-attachments/assets/3e444a3f-2d88-408a-8240-fe1f51ac3326) — Full 3-actor pipeline

### Comments Addressed
- **#17** (fixtures/media-embed-test.sudo:1): Import syntax + orchestrator dispatch + [architecture diagram 1](https://github.com/user-attachments/assets/7f45f7e9-83b3-4ebc-bbde-d295a108e9c7)
- **#18** (source/ai-runner.js:15): "`validateFilePath` — We likely won't need this, if we let the AI extract the prompt under test."
- **#19** (source/ai-runner.js:40): "Any parsing step is probably wrong because the AI judge is the only thing returning structured output..." + [architecture diagram 2](https://github.com/user-attachments/assets/3e444a3f-2d88-408a-8240-fe1f51ac3326)
- **General review comment**: "We should also have a test suite fixture with a WRONG prompt, so we can verify that tests also (correctly) fail."

### The 5-Step, 3-Actor Pipeline

The architecture is a **3-actor pipeline** (Orchestrator, Actual Result Generator, Judge) executed in **5 steps**. This is NOT 2 actors — the current implementation incorrectly combines execution and evaluation into one AI call. The new architecture separates them cleanly.

| Step | Actor | What Happens |
|------|-------|-------------|
| **Step 1** | Orchestrator (deterministic) | Reads Test File + Prompt Under Test file. Resolves imports. Parses assertions deterministically (YAML list or markdown bullets with regex). Combines Prompt Under Test + User Prompt. |
| **Step 2** | Actual Result Generator (AI subagent) | Receives Prompt Under Test + User Prompt. Executes the prompt. Writes actual results into files. Returns result file locations to orchestrator. |
| **Step 3** | Orchestrator (deterministic) | Gets result file locations. For EACH assertion, dispatches a separate Judge subagent with: (1) Prompt Under Test, (2) User Prompt, (3) Actual Result file path, (4) One assertion. |
| **Step 4** | Judge Agent (AI subagent, per-assertion) | Reads the actual result file. Evaluates whether the actual result satisfies the assertion. Returns TAP output for that single assertion. |
| **Step 5** | Orchestrator (deterministic) | Aggregates individual TAP outputs. Produces final aggregated TAP output. Delivers to user. |

```
Orchestrator (deterministic) — Step 1
  ├─ Read test file + prompt under test file
  ├─ Resolve imports (deterministic)
  ├─ Parse assertions deterministically (YAML/markdown regex)
  └─ Combine Prompt Under Test + User Prompt
        │
        ▼
Actual Result Generator (AI subagent) — Step 2
  ├─ Receives Prompt Under Test + User Prompt
  ├─ Executes the prompt
  ├─ Writes actual results to files
  └─ Returns result file locations
        │
        ▼
Orchestrator (deterministic) — Step 3
  ├─ Receives result file locations
  └─ For EACH assertion, dispatches separate Judge subagent
        │ (with: prompt under test, user prompt, result file path, one assertion)
        ▼
Judge Agent (AI subagent, per-assertion) — Step 4
  ├─ Reads actual result file
  ├─ Evaluates whether result satisfies the assertion
  └─ Returns TAP for that single assertion (ok 1 ... / not ok 1 ...)
        │
        ▼
Orchestrator (deterministic) — Step 5
  ├─ Aggregates individual TAP outputs
  ├─ Produces final aggregated TAP output
  └─ Delivers to user
```

This directly aligns with:
- **Epic requirement** (Task 2): "should pass entire file to AI agent (don't parse — it's a prompt)"
- **[vision.md](../vision.md)**: "The standard testing framework for AI Driven Development and software agents" — simplicity and agent-first design
- **[javascript.mdc](../ai/rules/javascript/javascript.mdc)**: "One job per function; separate mapping from IO" — the orchestrator handles IO, the Result Generator executes, the Judge evaluates
- **[AGENTS.md](../AGENTS.md)**: Progressive discovery principle — only consume what's needed
- **[please.mdc](../ai/rules/please.mdc)**: "Do ONE THING at a time" — each actor has a single responsibility

### Gap Analysis: Current Implementation vs 3-Actor Pipeline

| Aspect | Current Implementation | 3-Actor Pipeline | Gap |
|--------|----------------------|-------------------|-----|
| Test file reading | `readTestFile` reads file | Orchestrator reads file | Minimal — function survives |
| Prompt extraction | **Phase 1**: `buildExtractionPrompt` → AI → `parseExtractionResult` | **No Phase 1** — orchestrator parses deterministically | **Critical** — entire extraction pipeline removed |
| Import resolution | AI parses imports in Phase 1 | Orchestrator resolves imports deterministically | **Major** — logic moves from AI to orchestrator |
| Prompt execution | Combined with evaluation in one AI call | **Step 2**: Dedicated Result Generator subagent | **Major** — execution separated from evaluation |
| Evaluation | **Phase 2**: Per-assertion `buildEvaluationPrompt` → AI | **Step 4**: Per-assertion Judge subagent (separate from execution) | **Major** — evaluation is now isolated from execution |
| Output parsing | `parseStringResult` (multi-strategy JSON) | TAP per single assertion — trivially parseable | **Critical** — multi-strategy parsing removed |
| Aggregation | `aggregatePerAssertionResults` | Orchestrator aggregates TAP (Step 5) | Moderate — restructured for TAP instead of JSON |
| Failure testing | None | Failure fixture with wrong Prompt Under Test | **New** — not currently implemented |

### What Survives (Confirmed)

| Function | File | Status |
|----------|------|--------|
| `readTestFile` | ai-runner.js | Survives — orchestrator reads files (Step 1) |
| `executeAgent` | ai-runner.js | Survives, simplified — used for both Result Generator (Step 2) and Judge (Step 4) calls |
| `calculateRequiredPasses` | ai-runner.js | Survives as-is — threshold math unchanged |
| `aggregatePerAssertionResults` | ai-runner.js | Survives, restructured — aggregates TAP instead of JSON (Step 5) |
| `runAITests` | ai-runner.js | Survives, restructured — 5-step pipeline |
| `parseImports` | test-extractor.js | Survives — deterministic import parsing (may need syntax update for `import @path` format) |
| `parseOpenCodeNDJSON` | ai-runner.js | **MUST KEEP** — OpenCode CLI wire protocol parsing (see NDJSON warning below) |
| `validateFilePath` | ai-runner.js | Survives — orchestrator resolves imports, needs path safety |
| `createDebugLogger` | ai-runner.js | Survives — debugging infrastructure |

### NDJSON Warning — Critical Distinction

> **User caution:** "if it references the existing NDJSON implementation ensure you read existing documentation about why this was necessary for the opencode CLI responses"

`parseOpenCodeNDJSON` parses the **agent's wire protocol** — how the OpenCode CLI formats its stdout. This is NOT AI response content parsing. This function MUST SURVIVE the architecture refactor.

The "no multi-strategy parsing" directive applies to parsing **AI response content** (like `parseStringResult`), NOT agent wire protocols.

- **REMOVE**: `parseStringResult` — multi-strategy AI content parsing (replaced by trivial TAP parsing)
- **KEEP**: `parseOpenCodeNDJSON` — OpenCode CLI wire protocol parsing (required for OpenCode agent support)

### What Gets Removed (Confirmed)

| Function | File | Reason |
|----------|------|--------|
| `parseStringResult` | ai-runner.js | Multi-strategy AI content parsing — replaced by trivial TAP parsing |
| `buildExtractionPrompt` | ai-runner.js | Phase 1 elimination — no AI extraction phase |
| `parseExtractionResult` | ai-runner.js | Phase 1 elimination — no AI extraction phase |
| `extractJSONFromMarkdown` | ai-runner.js | No markdown JSON extraction needed |
| `tryParseJSON` | ai-runner.js | No speculative JSON parsing needed |
| `extractTests` | test-extractor.js | Entire two-phase pipeline replaced |
| `buildEvaluationPrompt` | ai-runner.js | Replaced by Result Generator prompt (Step 2) + Judge prompt (Step 4) — separate concerns |

### What Gets Added (Confirmed)

| Component | Description |
|-----------|-------------|
| **Deterministic assertion parser** | Regex or YAML parser — orchestrator parses assertions from test file (Step 1) |
| **Result Generator prompt builder** | Assembles Prompt Under Test + User Prompt for execution (Step 2) |
| **Judge prompt builder** | Assembles prompt under test + user prompt + actual result file path + single assertion for evaluation (Step 3/4) |
| **TAP single-assertion parser** | Trivially parseable — `ok 1 ...` or `not ok 1 ...` (Step 4 output) |
| **TAP aggregator** | Combines individual TAP outputs into final aggregated TAP (Step 5) |
| **Result file management** | Write actual results to files, pass locations from Result Generator back to orchestrator |
| **Failure fixture** | `wrong-prompt-test.sudo` with deliberately wrong Prompt Under Test (e.g., "Make everything brown") |

### Approach (TDD per [tdd.mdc](../ai/rules/tdd.mdc))

1. **Write failure fixture first** — create a `.sudo` test file with a deliberately wrong Prompt Under Test (e.g., instructions to "Make everything brown") that should fail assertions
2. **Write tests for the new orchestrator flow** — test that the orchestrator reads file, resolves imports, parses assertions deterministically, assembles prompt, dispatches to Result Generator, dispatches per-assertion to Judge
3. **Write tests for TAP output parsing** — test that single-assertion TAP is parsed trivially and aggregated correctly
4. **Implement 5-step pipeline** — make tests pass with minimal code
5. **Remove dead code** — delete extraction pipeline, multi-strategy parsing (keep `parseOpenCodeNDJSON`)
6. **Verify existing tests** — ensure all surviving tests still pass
7. **Run failure fixture** — verify that wrong-prompt tests correctly fail

### CLARIFYING QUESTIONS — Status

> **Q1-Q7 are now ALL RESOLVED.** No open questions remain.

**Q1. Who resolves imports — orchestrator or AI agent?** RESOLVED
- **Answer:** The **orchestrator** resolves imports. It reads both the Test File and the Prompt Under Test file, combines them, and passes them to the Actual Result Generator subagent.
- Comment #17 ([diagram 1](https://github.com/user-attachments/assets/7f45f7e9-83b3-4ebc-bbde-d295a108e9c7)) confirmed: orchestrator reads and resolves.

**Q2. What is the expected AI output format?** RESOLVED
- **Answer:** **TAP output** is preferred for all assertion judgements and final aggregation. The Judge returns TAP for a single assertion (`ok 1 ...` or `not ok 1 ...`), which is trivially parseable. The orchestrator aggregates TAP.

**Q3. Does per-assertion evaluation survive?** RESOLVED
- **Answer:** **Yes** — per-assertion isolation survives. Each assertion gets its own separate Judge subagent call (Step 4) to mitigate muddying context from other assertions.

**Q4. How should the failure fixture be designed?** RESOLVED
- **Answer:** Create a fixture where the imported Prompt Under Test has a deliberately wrong instruction. Example: modify the imported prompt content to say "Make everything brown" — which should obviously fail when asserted against proper UI/UX principles.

**Q5. What import syntax should test files use?** RESOLVED
- **Answer:** `import @ai/rules/ui.mdc` — no `from` clause, no variable binding. Just a direct path reference. Examples: `import @ai/rules/ui.mdc`, `import @ai/rules/javascript.mdc`.

**Q6. How do we ensure reliable structured output without multi-strategy parsing?** RESOLVED
- **Answer:** The Judge returns TAP for a single assertion. TAP is trivially parseable — no multi-strategy JSON parsing needed. The format is well-defined and deterministic.

**Q7. getAgentConfig — change return value or use block scope?** RESOLVED
- **Answer:** Option A — change `getAgentConfig` return value so tests can assert directly. Per [javascript.mdc](../ai/rules/javascript/javascript.mdc) SDA (Self Describing APIs) principle, the API should return the shape consumers need. Test `parseOutput` function behavior separately for OpenCode config (e.g., verify it's a function, or test its behavior with a known input). For configs WITHOUT `parseOutput` (claude, cursor), the return value can be compared directly. This eliminates ALL IIFEs and makes tests cleaner.

---

## Task 2: Zod Schema Validation + Centralized Defaults

> **Depends on:** Task 1 understood (architecture may change what gets validated)

### Comments Addressed
- **#1** (bin/riteway.js:90): "Should we have all defaults configured using this `default` parameter?"
- **#2** (bin/riteway.js:97): "Should we replace this number `4` with `defaults.concurrency`?"
- **#3** (bin/riteway.js:100): "Should we bring in Zod for schema validation and then connect to error causes for the error handling?"
- **#6** (bin/riteway.test.js:304): "This should probably error?"
- **#7** (bin/riteway.test.js:377): "Does it make sense to have a `--color` and `--no-color` flag?"

### Changes

1. **Extract centralized `defaults` object** in `parseAIArgs`:
   ```js
   const defaults = {
     runs: 4,
     threshold: 75,
     concurrency: 4,
     agent: 'claude',
     color: false,
   };
   ```

2. **Replace magic numbers** with `defaults.concurrency`, `defaults.runs`, etc.

3. **Add Zod schema validation** ([zod.dev](https://zod.dev)):
   ```js
   import { z } from 'zod';

   const aiArgsSchema = z.object({
     filePath: z.string().min(1, 'File path is required'),
     runs: z.number().int().positive().default(defaults.runs),
     threshold: z.number().min(0).max(100).default(defaults.threshold),
     concurrency: z.number().int().positive().default(defaults.concurrency),
     agent: z.enum(['claude', 'opencode', 'cursor']).default(defaults.agent),
     color: z.boolean().default(defaults.color),
   });
   ```

4. **Connect Zod to error-causes** per [error-causes.mdc](../ai/rules/javascript/error-causes.mdc):
   ```js
   const result = aiArgsSchema.safeParse(args);
   if (!result.success) {
     throw createError({
       name: 'ValidationError',
       message: result.error.issues.map(i => i.message).join('; '),
       code: 'INVALID_AI_ARGS',
       cause: result.error,
     });
   }
   ```

5. **Update test for `parseAIArgs([])`** (#6): should throw `ValidationError`, tested with `Try` from Riteway ([README](../README.md)):
   ```js
   import { Try } from 'riteway/index.js';

   const error = Try(parseAIArgs, []);
   assert({
     given: 'empty args',
     should: 'throw ValidationError',
     actual: error?.cause?.name,
     expected: 'ValidationError',
   });
   ```

6. **Simplify color flags** (#7): Drop `--no-color`, keep only `--color` (default: `false`). The `--color` flag enables color; absence means no color. Simpler API per [javascript.mdc](../ai/rules/javascript/javascript.mdc) (KISS, YAGNI).

### TDD approach per [tdd.mdc](../ai/rules/tdd.mdc)
1. Write test: `parseAIArgs([])` → `ValidationError`
2. Write test: `parseAIArgs(['file.sudo'])` → valid args with defaults
3. Write test: invalid threshold → `ValidationError`
4. Install Zod: `npm install zod`
5. Implement schema, make tests pass
6. Remove `--no-color` flag and update tests

---

## Task 3: Test Pattern Fixes — getAgentConfig

> **Depends on:** None (independent of architecture)

### Comments Addressed
- **#8** (bin/riteway.test.js:410): "Should this test follow the other test patterns?"
- **#9-#13** (bin/riteway.test.js:429+): "If we need a setup, should we define the constant before `assert`? Does this output need to be mapped, or should we change the return value of `getAgentConfig`?"

### Changes

1. **#8 — Align color default test** with other test patterns: compare full object instead of just the boolean value.

2. **#9-#13 — Remove IIFEs from getAgentConfig tests** per [javascript.mdc](../ai/rules/javascript/javascript.mdc) ("Avoid IIFEs. Use block scopes, modules, or normal arrow functions instead."):

   **Chosen approach (Q7 RESOLVED — Option A):** Change `getAgentConfig` return value so tests can assert directly without mapping. Per javascript.mdc SDA (Self Describing APIs) principle, the API should return the shape consumers need.

   - **For configs WITHOUT `parseOutput` (claude, cursor):** compare the full return value directly:
   ```js
   assert({
     given: 'claude agent',
     should: 'return claude config',
     actual: getAgentConfig('claude'),
     expected: { command: 'claude', args: ['-p', '--output-format', 'json'] },
   });
   ```

   - **For OpenCode config (has `parseOutput` function):** test the static properties directly, then test `parseOutput` behavior separately:
   ```js
   {
     const config = getAgentConfig('opencode');
     assert({
       given: 'opencode agent',
       should: 'return correct command',
       actual: config.command,
       expected: 'opencode',
     });
     assert({
       given: 'opencode agent parseOutput',
       should: 'be a function',
       actual: typeof config.parseOutput,
       expected: 'function',
     });
     assert({
       given: 'opencode agent parseOutput with known NDJSON input',
       should: 'return parsed result',
       actual: config.parseOutput('{"result":"test"}\n'),
       expected: 'test', // or whatever the expected parsed value is
     });
   }
   ```

   This eliminates ALL IIFEs and makes tests cleaner.

### TDD approach
1. Update `getAgentConfig` return value so claude/cursor configs are directly comparable (Option A per Q7)
2. Rewrite tests: direct comparison for claude/cursor, block scope + separate `parseOutput` behavior tests for opencode
3. Verify all tests pass

---

## Task 4: Test Pattern Fixes — Error Testing with Try

> **Depends on:** None (independent of architecture)

### Comments Addressed
- **#14** (bin/riteway.test.js:516): "Should we use the `Try` here?"
- **#15** (bin/riteway.test.js:548): "If you have a promise, it shouldn't throw but reject with an error, which will allow us to use `Try` here again."
- **#16** (bin/riteway.test.js:586): "Same here"

### Changes

Use Riteway's `Try` utility (exported from `riteway/index.js`, [README](../README.md)) for all error testing. `Try` internally uses `catchPromise` to handle promises — when passed an async function that rejects, it returns the rejection error:

**Sync errors (#14):**
```js
import { Try } from 'riteway/index.js';

const error = Try(getAgentConfig, 'invalid-agent');
assert({
  given: 'invalid agent name',
  should: 'return error',
  actual: error?.cause?.name,
  expected: 'ValidationError',
});
```

**Async errors (#15, #16):**
```js
const error = await Try(runAICommand, { /* invalid args */ });
assert({
  given: 'missing file path',
  should: 'return error',
  actual: error?.cause?.name,
  expected: 'ValidationError',
});
```

This replaces try/catch blocks in tests, making error tests more concise and consistent per [javascript.mdc](../ai/rules/javascript/javascript.mdc) (composition, avoid verbose patterns).

### TDD approach
1. Rewrite #14 test to use `Try` for sync error
2. Rewrite #15 test to use `await Try` for async error
3. Rewrite #16 test to use `await Try` for async error
4. Verify all tests pass

---

## Task 5: Error-Causes Switch in ai-runner.js

> **Depends on:** Task 1 (architecture refactor may change which errors exist)

### Comments Addressed
- **#4** (source/ai-runner.js:187): "Let's handle these errors with the error-causes switch."

### Changes

Define `errorCauses` at module level in `ai-runner.js` per [error-causes.mdc](../ai/rules/javascript/error-causes.mdc):

```js
import { createError, errorCauses } from 'error-causes';

const [aiErrors, handleAIErrors] = errorCauses({
  SecurityError: {
    code: 'SECURITY_VIOLATION',
    message: 'Security violation detected',
  },
  ParseError: {
    code: 'PARSE_FAILURE',
    message: 'Failed to parse AI response',
  },
  ValidationError: {
    code: 'VALIDATION_FAILURE',
    message: 'Invalid input parameters',
  },
  TimeoutError: {
    code: 'AGENT_TIMEOUT',
    message: 'AI agent timed out',
  },
  AgentProcessError: {
    code: 'AGENT_PROCESS_FAILURE',
    message: 'AI agent process failed',
  },
});
```

Replace all ad-hoc `createError` calls and `new Error()` calls with spread of defined error causes. Export `handleAIErrors` for consumer use in `bin/riteway.js`.

### TDD approach
1. Write tests verifying error cause names and codes for each error type
2. Refactor `createError` calls to use defined causes
3. Update bin/riteway.js to use exported `handleAIErrors`
4. Verify all tests pass

---

## Task 6: Code Style — Eliminate Mutations

> **Depends on:** Task 1 (code being refactored may change)

### Comments Addressed
- **#5** (bin/riteway.js:167): "Let's `/review` this with the JavaScript style guide. We can probably avoid some mutations."

### Changes per [javascript.mdc](../ai/rules/javascript/javascript.mdc)

1. **`let outputPath` → `.catch()` pattern:**
   ```js
   // Before: let + try/catch reassignment
   let outputPath;
   try { outputPath = await recordTestOutput(...); } catch (e) { ... }

   // After: const + .catch()
   const outputPath = await recordTestOutput(...).catch(e => {
     throw createError({ ...OutputError, cause: e });
   });
   ```

2. **`assertions.forEach` → `map/join`:**
   ```js
   // Before: forEach with side effects
   assertions.forEach(a => { output += formatAssertion(a); });

   // After: map/join (pure)
   const output = assertions.map(formatAssertion).join('');
   ```

3. **Extract `formatAssertionReport`** — separate IO from logic (one job per function)

4. **`executeAgent` result reassignment → pipeline** with `unwrapEnvelope`/`ensureParsed` helpers:
   ```js
   const parseAgentOutput = pipe(parseResponse, unwrapEnvelope, ensureParsed);
   ```

### TDD approach
1. Ensure existing tests cover the behavior
2. Refactor one mutation at a time
3. Verify tests pass after each change

---

## Task 7: Failure Fixture + Documentation

> **Depends on:** Task 1 (architecture determines fixture format)

### Changes

1. **Create failure fixture** (general review comment): A `wrong-prompt-test.sudo` test file in `source/fixtures/` with a deliberately wrong Prompt Under Test. Example: the imported prompt says "Make everything brown" — which should obviously fail when asserted against proper UI/UX principles. This verifies the framework correctly reports failures.

2. **Write test** that runs the failure fixture and asserts that the results report failures.

3. **Update help text** in `bin/riteway.js` if CLI interface changes from architecture refactor.

4. **Update README** AI testing section if the user-facing API or test file format changes.

---

## Decisions Made

| # | Decision | Rationale | Reference |
|---|----------|-----------|-----------|
| D1 | Architecture refactor is #1 priority | Reviewer's main concern; may make other changes unnecessary | #17, #19, epic Task 2 |
| D2 | Drop `--no-color`, keep `--color` only | KISS, YAGNI — simpler API | #7, [javascript.mdc](../ai/rules/javascript/javascript.mdc) |
| D3 | Use `Try` from Riteway for error tests | Project's own utility handles both sync and async via `catchPromise` | #14-#16, [README](../README.md) |
| D4 | Use Zod for schema validation | Reviewer suggested it; robust, well-maintained | #3, [zod.dev](https://zod.dev) |
| D5 | Connect Zod errors to error-causes | Consistent error handling pattern | #3, #4, [error-causes.mdc](../ai/rules/javascript/error-causes.mdc) |
| D6 | Remove IIFEs in favor of API change (Option A) | SDA + KISS per javascript.mdc — change `getAgentConfig` return value so tests assert directly; test `parseOutput` behavior separately for OpenCode | #9-#13, [javascript.mdc](../ai/rules/javascript/javascript.mdc), Q7 |
| D7 | Orchestrator resolves imports | Deterministic, secure, confirmed by user | #17, #18 — **RESOLVED** |
| D8 | Eliminate multi-strategy AI content parsing | "Any parsing step is probably wrong" | #19 |
| D9 | Import syntax: `import @path` (no from/variable) | Cleaner, simpler — just references a file path | #17, Q5 answer |
| D10 | Assertion format: YAML preferred, markdown bullets acceptable | Orchestrator parses deterministically with regex | Q2/Q3 answers |
| D11 | Judge reads result files directly | Orchestrator passes file paths, judge reads them | Architecture Step 3/4 |
| D12 | Keep `parseOpenCodeNDJSON` | Wire protocol parsing, not AI content parsing — required for OpenCode agent support | NDJSON warning |
| D13 | Failure fixture: wrong Prompt Under Test | Tests that framework correctly reports failures (e.g., "Make everything brown") | Q4 answer |
| D14 | 3-actor architecture: Orchestrator + Result Generator + Judge | Separates execution from evaluation cleanly | Comment #19, architecture diagram 2 |

---

## Comment-to-Task Mapping

| Comment | Location | Summary | Task |
|---------|----------|---------|------|
| General | Review body | Failure fixture with wrong prompt | Task 1 + Task 7 |
| #1 | bin/riteway.js:90 | Centralize defaults in `default` parameter | Task 2 |
| #2 | bin/riteway.js:97 | Replace magic `4` with `defaults.concurrency` | Task 2 |
| #3 | bin/riteway.js:100 | Bring in Zod for schema validation | Task 2 |
| #4 | source/ai-runner.js:187 | Use error-causes switch | Task 5 |
| #5 | bin/riteway.js:167 | Eliminate mutations (let, forEach) | Task 6 |
| #6 | bin/riteway.test.js:304 | `parseAIArgs([])` should error | Task 2 |
| #7 | bin/riteway.test.js:377 | Simplify `--color`/`--no-color` | Task 2 |
| #8 | bin/riteway.test.js:410 | Align color test pattern | Task 3 |
| #9 | bin/riteway.test.js:429 | Remove IIFE, setup before assert | Task 3 |
| #10 | bin/riteway.test.js | Same (getAgentConfig IIFE) | Task 3 |
| #11 | bin/riteway.test.js | Same (getAgentConfig IIFE) | Task 3 |
| #12 | bin/riteway.test.js | Same (getAgentConfig IIFE) | Task 3 |
| #13 | bin/riteway.test.js | Same (getAgentConfig IIFE) | Task 3 |
| #14 | bin/riteway.test.js:516 | Use `Try` for sync error test | Task 4 |
| #15 | bin/riteway.test.js:548 | Use `Try` for async error test (promise rejection) | Task 4 |
| #16 | bin/riteway.test.js:586 | Same (async Try) | Task 4 |
| #17 | fixtures/media-embed-test.sudo:1 | Import syntax + orchestrator architecture | Task 1 |
| #18 | source/ai-runner.js:15 | `validateFilePath` may not be needed | Task 1 |
| #19 | source/ai-runner.js:40 | "Any parsing step is probably wrong" + AI judge diagram | Task 1 |

---

## Execution Order / Dependency Graph

```
                    ┌──────────────────────────────┐
                    │  Task 1: Architecture Refactor │
                    │  (#17, #18, #19, general)      │
                    │  Q1-Q7 ALL RESOLVED            │
                    └────────────┬─────────────────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
                ▼                ▼                ▼
       ┌──────────────┐ ┌───────────┐ ┌──────────────┐
       │ Task 2: Zod  │ │ Task 5:   │ │ Task 6: Code │
       │ + Schema     │ │ Error-    │ │ Style        │
       │ Validation   │ │ Causes    │ │ Mutations    │
       │ (#1-3,#6,#7) │ │ Switch    │ │ (#5)         │
       └──────┬───────┘ │ (#4)      │ └──────────────┘
              │         └───────────┘
              ▼
       ┌──────────────┐
       │ Task 7:      │
       │ Failure      │
       │ Fixture +    │
       │ Docs         │
       └──────────────┘

       Independent (can proceed in parallel, no architecture dependency):
       ┌──────────────────┐  ┌──────────────────────┐
       │ Task 3: Test     │  │ Task 4: Error Testing │
       │ Patterns -       │  │ with Try              │
       │ getAgentConfig   │  │ (#14, #15, #16)       │
       │ (#8, #9-#13)     │  │                       │
       │ Q7 RESOLVED      │  │                       │
       └──────────────────┘  └──────────────────────┘
```

### Recommended execution sequence

1. **Task 1** — Architecture refactor (Q1-Q6 RESOLVED — ready to implement)
2. **Tasks 3 + 4** — Test pattern fixes (independent, can start immediately in parallel; Q7 now RESOLVED for Task 3)
3. **Task 2** — Zod + schema validation (after Task 1 settles what gets validated)
4. **Task 5** — Error-causes switch (after Task 1 settles which errors exist)
5. **Task 6** — Code style mutations (after Task 1 settles which code remains)
6. **Task 7** — Failure fixture + docs (after architecture is implemented)

---

## Clarifying Questions (Consolidated)

| # | Question | Status | Answer |
|---|----------|--------|--------|
| **Q1** | **Who resolves imports — orchestrator or AI agent?** | RESOLVED | Orchestrator resolves imports. Reads both Test File and Prompt Under Test file, combines them, passes to Result Generator. |
| **Q2** | **What is the expected AI output format?** | RESOLVED | TAP output. Judge returns TAP for a single assertion (`ok 1 ...` / `not ok 1 ...`), trivially parseable. Orchestrator aggregates TAP. |
| **Q3** | **Does per-assertion evaluation survive?** | RESOLVED | Yes. Each assertion gets its own separate Judge subagent call (Step 4) to prevent context muddying. |
| **Q4** | **How should the failure fixture be designed?** | RESOLVED | Wrong Prompt Under Test (e.g., "Make everything brown") — should obviously fail assertions. |
| **Q5** | **What import syntax should test files use?** | RESOLVED | `import @ai/rules/ui.mdc` — no `from` clause, no variable binding. Direct path reference. |
| **Q6** | **How do we ensure reliable structured output without multi-strategy parsing?** | RESOLVED | Judge returns TAP for single assertion. TAP is trivially parseable. No multi-strategy JSON parsing needed. |
| **Q7** | **getAgentConfig: change return value or use block scope?** | RESOLVED | Option A — change `getAgentConfig` return value so tests can assert directly. Per javascript.mdc SDA principle, the API should return the shape consumers need. Test `parseOutput` function behavior separately for OpenCode config. |

---

## Alignment Verdict

The reviewer's architecture is **more faithful** to:
- The **epic requirement** ("don't parse" — pass entire file to AI agent)
- The **vision** (simplicity, agent-first design)
- **javascript.mdc** principles (one job per function, composition, KISS)

The current two-phase approach was a pragmatic workaround for output reliability that introduced the very parsing the epic said to avoid. The 3-actor pipeline eliminates this contradiction by cleanly separating execution (Result Generator) from evaluation (Judge), with the orchestrator handling all deterministic work.

---

## References

### Project Files
- [vision.md](../vision.md) — "The standard testing framework for AI Driven Development and software agents"
- [AGENTS.md](../AGENTS.md) — AI agent guidelines, progressive discovery, vision-first
- [Epic task file](../tasks/archive/2026-01-22-riteway-ai-testing-framework/2026-01-22-riteway-ai-testing-framework.md) — Original requirements, especially Task 2: "pass entire file to AI agent (don't parse)"
- [Feb 6 remediation plan](../tasks/archive/2026-01-22-riteway-ai-testing-framework/2026-02-06-pr-394-remediation-plan.md) — Previous plan (7/7 items completed)

### Rules
- [please.mdc](../ai/rules/please.mdc) — General agent guidance, one thing at a time, get approval
- [javascript.mdc](../ai/rules/javascript/javascript.mdc) — KISS, YAGNI, DRY, one job per function, avoid IIFEs, favor immutability
- [tdd.mdc](../ai/rules/tdd.mdc) — Red-green-refactor, assert answers 5 questions, `Try` for error tests
- [error-causes.mdc](../ai/rules/javascript/error-causes.mdc) — `createError`, `errorCauses` pattern, test `.cause` property

### External Documentation
- [Zod](https://zod.dev) — Schema validation library
- [Riteway `Try`](../README.md) — `Try(fn, ...args)` catches sync throws and async rejections via `catchPromise`, returns the error
- [PR #394](https://github.com/paralleldrive/riteway/pull/394) — The pull request under review
- [janhesters review](https://github.com/paralleldrive/riteway/pull/394#pullrequestreview-3764740159) — The review being remediated
