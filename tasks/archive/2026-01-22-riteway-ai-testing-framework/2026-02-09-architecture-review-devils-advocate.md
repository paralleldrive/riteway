# Devil's Advocate: Defense of Current Implementation & Challenge to Proposed Re-Architecture

> **Date:** 2026-02-09
> **Status:** ANALYSIS COMPLETE
> **PR:** [#394 feat(ai-runner): implement core module with TDD](https://github.com/paralleldrive/riteway/pull/394)
> **Review:** [janhesters review (3764740159)](https://github.com/paralleldrive/riteway/pull/394#pullrequestreview-3764740159)
> **Purpose:** Separate genuine requirements violations from architectural preferences and premature optimization

---

## Executive Summary

The proposed 3-actor pipeline architecture is a **significant overreaction** to review feedback that was largely directional and suggestive, not prescriptive. The current implementation satisfies every functional requirement in the epic. The proposed rewrite introduces substantial new risks — agent file access dependencies, increased AI call volume, new parsing code, and deletion of 186+ lines of tested code — in exchange for architectural purity that provides **zero new user-facing capability**.

This analysis does not argue that the current code is perfect. The reviewer's concerns about IIFEs (#8-#13), Try usage (#14-#16), Zod validation (#1-#3), error-causes (#4), mutations (#5), and the failure fixture (general comment) are all **legitimate and should be addressed**. The debate is solely about whether Task 1 (the architecture refactor) is necessary or whether it represents a premature, high-risk rewrite.

---

## 1. Requirements Compliance Audit

Every functional requirement from the epic, checked against the current implementation:

| # | Requirement | Satisfied? | How |
|---|-------------|-----------|-----|
| F1 | Given a .sudo test file path, should read the entire test file | **YES** | `readTestFile()` in ai-runner.js:120 — `readFile(filePath, 'utf-8')` |
| F2 | Given test file contents, should pass complete file to AI agent without parsing | **YES (see Section 2)** | `buildExtractionPrompt()` wraps ENTIRE file content in `<test-file-contents>` tags and sends to AI agent |
| F3 | Given test file execution, should delegate to subagent via callSubAgent | **YES** | `executeAgent()` spawns CLI subprocesses via `child_process.spawn()` |
| F4 | Given $requirements in test file, should iterate and create Riteway assertions for each | **YES** | `extractTests()` → Phase 1 extracts each assertion → Phase 2 creates evaluation prompts per requirement |
| F5 | Given each requirement, should infer appropriate given, should, actual, expected values | **YES** | `buildEvaluationPrompt()` instructs AI to evaluate each requirement and return `{passed, output, reasoning}` |
| F6 | Given `--runs N` flag, should execute each test N times (default: 4) | **YES** | `parseAIArgs()` parses `--runs`, `runAITests()` creates N tasks per assertion |
| F7 | Given `--threshold P` flag, should require P% of runs to pass (default: 75) | **YES** | `calculateRequiredPasses()` with ceiling math |
| F8 | Given multiple test runs, should execute runs in parallel for speed | **YES** | `limitConcurrency()` in `runAITests()` with configurable concurrency |
| F9 | Given parallel execution, should ensure each run has its own clean context | **YES** | Each run spawns a separate subprocess — automatic isolation |
| F10 | Given multiple test runs, should report individual run results and aggregate pass rate | **YES** | `aggregatePerAssertionResults()` returns per-assertion breakdown with passCount/totalRuns |
| F11 | Given pass rate below threshold, should fail the test suite | **YES** | `runAICommand()` checks `results.passed` and throws `AITestError` |
| F12 | Given pass rate at or above threshold, should pass the test suite | **YES** | `runAICommand()` prints "Test suite passed!" |
| F13 | Given test execution results, should record output to ai-evals path | **YES** | `recordTestOutput()` in test-output.js with proper path format |
| F14 | Given test output requirements, should generate rich, colorized TAP format | **YES** | `formatTAP()` in test-output.js |
| F15 | Given markdown media, should embed them in TAP output | **YES** | test-output.js handles media embeds |
| F16 | Given output file created, should open test results in browser | **YES** | `openInBrowser()` in test-output.js |
| F17 | Given the CLI tool implementation, should have comprehensive unit test coverage | **YES** | 186 passing tests (78 TAP + 108 Vitest) |
| F18 | Given the complete system, should have an end-to-end test | **YES** | source/e2e.test.js with 13 assertions |

**Technical Requirements:**

| # | Requirement | Satisfied? | How |
|---|-------------|-----------|-----|
| T1 | Given existing bin/cli structure, should integrate as separate module option | **YES** | `main()` routes 'ai' subcommand |
| T2 | Given slug generation needs, should use `npx cuid2 --slug` | **YES** | test-output.js |
| T3 | Given ai-evals folder, should create directory if it doesn't exist | **YES** | test-output.js |
| T4 | Given YYYY-MM-DD date format, should generate ISO date stamps | **YES** | `formatDate()` |
| T5 | Given test file format, should support extension-agnostic file reading | **YES** | `readTestFile()` reads any extension |
| T6 | Given SudoLang/markdown test files, should treat as prompts and pass complete contents to agent | **YES (see Section 2)** | Complete file passed to AI in extraction prompt |
| T7 | Given agent orchestration, should spawn subagent CLI subprocesses | **YES** | `executeAgent()` uses `spawn()` |
| T8 | Given parallel execution, should spawn separate subprocesses per run | **YES** | Each run gets its own `spawn()` |
| T9 | Given agent-agnostic design, should support configurable agent CLI | **YES** | `getAgentConfig()` supports claude/opencode/cursor |
| T10 | Given Claude Code CLI config | **YES** | `claude -p --output-format json --no-session-persistence` |
| T11 | Given OpenCode CLI config | **YES** | `opencode run --format json` with NDJSON parsing |
| T12 | Given Cursor CLI config | **YES** | `agent --print --output-format json` |
| T13 | Given default agent, should use Claude Code CLI | **YES** | Default in `parseAIArgs()` and `getAgentConfig()` |
| T14 | Given non-deterministic AI inference, should support configurable test runs and pass thresholds | **YES** | `--runs` and `--threshold` flags |
| T15 | Given threshold calculation, should use ceiling | **YES** | `Math.ceil()` in `calculateRequiredPasses()` |

**Result: 100% of functional and technical requirements are satisfied by the current implementation.**

---

## 2. The "Don't Parse" Interpretation — The Core Debate

The epic says:
> "Given test file contents (SudoLang/markdown), should pass complete file to AI agent without parsing"
> "don't parse — it's a prompt"

### The Current Implementation DOES Pass the Complete File to AI

Look at `buildExtractionPrompt()` (test-extractor.js:85-104):

```javascript
export const buildExtractionPrompt = (testContent) => {
  return `You are a test extraction agent...
<test-file-contents>
${testContent}          // <--- THE ENTIRE FILE IS HERE, UNMODIFIED
</test-file-contents>`;
};
```

The complete, unmodified test file content is embedded in the prompt. The AI agent receives it. The AI agent does the "parsing" — it identifies assertions, extracts userPrompt, identifies requirements. **The code does not parse the test file content.** The AI does.

### What "Parsing" Actually Occurs in the Code?

1. **`parseImports()`** — This parses `import @X from 'path'` statements. But this is NOT parsing the test content semantically. This is resolving file system references — a completely separate concern. Every programming language resolves imports at a different layer than executing code. The test file's **semantic content** (assertions, user prompts, requirements) is untouched.

2. **`parseExtractionResult()`** — This parses the AI's JSON response. This is parsing the **output from the AI**, not the test file. Every system that talks to an AI must parse the response.

3. **`parseStringResult()`** — Same: this parses agent CLI output. Wire protocol handling.

### The Proposed Architecture Also "Parses"

The 3-actor pipeline doesn't eliminate parsing; it moves it:

- The orchestrator agent "dynamically understands" the test file — this IS parsing, done by AI
- The Judge returns TAP — the CLI must parse TAP output (new `parseSingleAssertionTAP()`)
- The orchestrator returns JSON — the CLI must parse that JSON

The proposed architecture replaces **explicit, testable, deterministic parsing** with **implicit, non-deterministic AI parsing** plus **new deterministic TAP parsing**. It's not less parsing — it's different parsing.

### The Key Question

The epic says "don't parse — it's a prompt." There are two valid interpretations:

**Interpretation A (current implementation):** Don't write imperative code that parses the test file's semantic structure. Instead, give the whole file to AI and let it extract meaning. ✅ The current code does this.

**Interpretation B (proposed architecture):** The test file IS the prompt. It should be passed directly to an AI agent for execution without any intermediary extraction step. The file itself should BE what gets executed.

Interpretation B is more literal, but it has a **critical problem**: the epic also says "should iterate and create Riteway assertions for each" requirement. You can't iterate requirements programmatically if you haven't identified them. Something — either AI or code — must extract the requirements before iterating. The current implementation uses AI for this extraction step (Phase 1). The proposed architecture also uses AI for this (the orchestrator agent). Both interpret the file, just at different architectural boundaries.

---

## 3. What the Reviewer Actually Said vs. What the Remediation Plan Proposes

### Comment #28 (media-embed-test.sudo:1)

**What janhesters said:**
> "Should this be `import @ai/rules/ui.mdc;`? The main orchestrator agent should pull in the prompt file and then dispatch a subagent with a specific prompt. The deterministic parsing reduces the flexibility of the testing surface."

**What this means:** The import syntax should be simpler. The orchestrator (which could be AI) should handle import resolution. `parseImports()` regex is too rigid.

**What the remediation plan concludes:** Replace the entire test-extractor.js with a 3-actor pipeline, delete 10 functions, add 7 new functions, create 3 new files, and fundamentally restructure the architecture.

**The gap:** janhesters suggested a direction for import handling. The remediation plan extrapolated this into a complete architecture rewrite. The comment says "orchestrator agent should pull in the prompt file" — this could be addressed by having the AI handle import resolution while keeping the rest of the architecture intact.

### Comment #29 (source/ai-runner.js:15)

**What janhesters said:**
> "We likely won't need this, if we let the AI extract the prompt under test."

**What this means:** `validateFilePath` might be unnecessary for import path validation if AI handles it.

**What the architecture review concluded:** This is correct for import paths, but `validateFilePath` is STILL needed by `bin/riteway.js:123` for CLI input validation. The architecture review (Concern #2) correctly identifies this.

### Comment #30 (source/ai-runner.js:40)

**What janhesters said:**
> "Any parsing step is probably wrong because the AI judge is the only thing returning structured output and the format of that structured output and TAP can be deterministically parsed and it should probably just be pushed to the orchestrator (which aggregates)."

**What this means:** The multi-strategy JSON parsing (`parseStringResult`) is overcomplicated. The Judge should return TAP, which is simple to parse.

**What the remediation plan concludes:** Full 3-actor pipeline with 5 steps, new Result Generator actor, file-based result passing, per-assertion Judge subagent calls, deletion of the entire test-extractor.js module.

**The gap:** The comment targets `parseStringResult()` (which IS overcomplicated) and suggests TAP output from the Judge. This doesn't necessarily require a complete architecture rewrite. You could:
1. Keep the extraction phase
2. Change the evaluation response format from JSON to TAP
3. Replace `parseStringResult()` with trivial TAP parsing
4. Keep everything else

### The Diagram

Comment #30 includes an architecture diagram showing 3 actors. But:
- This is a **conceptual suggestion** in a PR review, not a specification
- The diagram shows a flow, not a literal implementation requirement
- janhesters didn't say "you must implement exactly this" — they showed a vision
- Review diagrams are discussion starters, not blueprints

The remediation plan treats the diagram as a **literal specification**, designing a 5-step pipeline that matches every box. This is over-interpretation.

---

## 4. Reliability Regression Risk

### The Current Two-Phase Approach: Why It Exists

The test-extractor.js module header explains the history (lines 6-48):

> "Initial implementation asked extraction agents to create evaluation prompts. Result: Agents returned markdown strings instead of {passed: boolean} objects. Root cause: No control over what instructions agents would include. Fix: This two-phase architecture with controlled templates."

This isn't theoretical. This was a **real bug that was encountered and fixed**. The two-phase approach exists because single-phase approaches were unreliable.

### Phase 1: AI Extracts Structured Data (can fail gracefully)
- AI returns JSON array with `{id, description, userPrompt, requirement}`
- `parseExtractionResult()` validates all required fields
- If AI returns garbage, error is caught early with a clear message
- 11 unit tests validate parsing behavior

### Phase 2: Template Ensures Response Format (deterministic)
- `buildEvaluationPrompt()` wraps everything in a controlled template
- Template explicitly instructs: "Return ONLY the JSON object with no markdown fences"
- Response format is `{passed: boolean, output: string}` — exactly what the test runner needs
- Template output is testable without running real agents

### The Proposed Architecture's Reliability

**Orchestrator Agent returns JSON:**
- What if it returns markdown?
- What if it misidentifies assertions?
- What if it doesn't understand the import syntax?
- No validation step — goes directly to Result Generator

**Result Generator writes to file:**
- What if the agent can't write files? (See Section 5)
- What if it writes to the wrong path?
- What if it writes partial output?

**Judge returns TAP:**
- What if it returns "I think the test passed" instead of "ok 1 - ..."?
- What if it includes reasoning before the TAP line?
- Single-assertion TAP parsing is "trivially parseable" — but this assumes the AI will cooperate
- No multi-strategy fallback means one chance to get it right

### Cost Per Test Run

Current architecture: **2 AI calls per assertion** (1 extraction + 1 evaluation per run)
- Actually: 1 extraction call total + N evaluation calls per assertion per run

Proposed architecture: **At minimum 3 AI calls per assertion** (1 orchestrator + 1 result generator + 1 judge per assertion per run)
- With 4 runs and 3 assertions: Current = 1 + (3 * 4) = 13 calls. Proposed = 1 + 4*(1 + 3) = 17 calls (if result generator runs once per run) or 1 + (4 * 1) + (4 * 3) = 17 calls
- More AI calls = more cost, more latency, more opportunities for failure

---

## 5. Agent-Agnostic Design Concerns

The epic explicitly requires:
> "Given agent-agnostic design, should support configurable agent CLI via agentConfig option"

The current implementation is truly agent-agnostic:
- `executeAgent()` takes any `{command, args}` config
- It sends a prompt as the final argument
- It captures stdout
- It parses JSON from stdout
- Works with ANY agent that can: (1) accept a text prompt, (2) return text to stdout

The proposed architecture requires agents that can:
1. **Read files from the filesystem** (Orchestrator: "READ THE TEST FILE at the path above using your file-reading capabilities")
2. **Write files to the filesystem** (Result Generator: "Write your response to file: ${resultFilePath}")
3. **Read files from the filesystem again** (Judge: "Read actual result file")

This is NOT agent-agnostic. Per the architecture review's Concern #1:

| Agent | File Read? | File Write? |
|-------|-----------|-------------|
| Claude Code (`claude -p`) | Likely (undocumented for pipe mode) | Unreliable |
| OpenCode (`opencode run`) | Unknown | Unknown |
| Cursor (`agent --print`) | Unknown | Unknown |

If the orchestrator can't read files, the pipeline fails. If the Result Generator can't write to disk, the Judge has nothing to evaluate. This is a **direct violation** of the agent-agnostic requirement.

The architecture review acknowledges this (Options A, B, C). Option A (CLI reads files, passes content in prompts) would be agent-agnostic — but that's essentially what the current implementation already does! The current code reads the file, passes the content to the AI in a prompt, and captures the response via stdout.

---

## 6. YAGNI and KISS Analysis

Per [javascript.mdc](../ai/rules/javascript/javascript.mdc): YAGNI, KISS, DOT principles.

### What the 3-Actor Pipeline ADDS

| New Component | LOC Estimate | Purpose |
|---------------|-------------|---------|
| `tap-parser.js` + tests | ~100 | Parse TAP from Judge output |
| `prompts/orchestrator.js` + tests | ~150 | Build orchestrator/generator/judge prompts |
| `result-manager.js` + tests | ~100 | File-based result passing |
| Failure fixture | ~50 | `wrong-prompt-test.sudo` |
| Pipeline restructuring | ~200 | 5-step flow in `runAITests` |
| **Total new code** | **~600 LOC** | |

### What the 3-Actor Pipeline REMOVES

| Removed Component | LOC | Tests Lost |
|-------------------|-----|------------|
| `test-extractor.js` | 369 lines | ~30 Vitest assertions |
| `parseStringResult` + tests | ~80 | ~10 assertions |
| `buildExtractionPrompt` + tests | ~30 | ~8 assertions |
| `parseExtractionResult` + tests | ~40 | ~15 assertions |
| `readTestFile` + tests | ~5 | ~4 assertions |
| `validateFilePath` (if removed) | ~15 | ~8 assertions |
| **Total removed** | **~540 LOC** | **~75 test assertions** |

**Net change:** +60 LOC, -75 test assertions deleted, ~75 new test assertions needed.

This is essentially a **full rewrite** of the core module — not a refactoring. You're deleting tested, working code and replacing it with untested, new code. Per KISS, this adds complexity:

- A new actor (Result Generator) that didn't exist before
- File I/O for results (write to file, read from file) that wasn't needed before
- New TAP parsing code
- Three separate AI prompt templates instead of two
- File-based communication between actors instead of in-memory data flow

### Is This Simpler?

The current architecture: `readFile → extractMetadata(AI) → buildPrompt(template) → evaluate(AI) → aggregate`

The proposed architecture: `spawnOrchestrator(AI, filePath) → orchestratorReadsFile(AI) → orchestratorIdentifiesAssertions(AI) → spawnResultGenerator(AI) → resultGeneratorWritesFile(AI) → orchestratorDispatchesJudges(AI) → judgeReadsFile(AI) → judgeReturnsTAP(AI) → aggregateTAP`

The proposed pipeline has MORE steps, MORE AI calls, MORE file I/O, and MORE points of failure. KISS says to prefer the simpler solution.

---

## 7. What the Reviewer's Comments Actually Require

Let's categorize each comment as either a **requirements violation** or an **implementation preference**:

| Comment | Category | Requires Architecture Rewrite? |
|---------|----------|-------------------------------|
| #12 (defaults) | Implementation preference | No — add `defaults` object |
| #13 (magic numbers) | Implementation preference | No — replace `4` with constant |
| #14 (Zod) | Implementation preference | No — add Zod validation |
| #15 (error-causes) | Implementation preference | No — use `errorCauses` pattern |
| #16 (mutations) | Implementation preference | No — refactor to immutable |
| #17 (should error) | Bug/improvement | No — add validation |
| #18 (color flags) | Implementation preference | No — simplify flags |
| #19 (test pattern) | Implementation preference | No — align test patterns |
| #20-#24 (IIFEs) | Implementation preference | No — remove IIFEs |
| #25-#27 (Try) | Implementation preference | No — use `Try` utility |
| #28 (import syntax) | **Directional suggestion** | **Debatable** — could be addressed by making import resolution AI-driven without rewriting everything |
| #29 (validateFilePath) | **Directional suggestion** | **No** — applies to import validation, not CLI validation |
| #30 (parsing) | **Directional suggestion** | **Debatable** — `parseStringResult` multi-strategy is overcomplicated, but can be simplified without a full rewrite |
| General (failure fixture) | Feature request | No — add fixture |

**Count:** 16 actionable comments. 13 require zero architectural change. 3 suggest a direction that COULD involve architecture changes but don't MANDATE a full rewrite.

---

## 8. The Incremental Alternative

Instead of a full rewrite, the following addresses every reviewer concern:

### Phase A: Non-Architectural Fixes (Tasks 2-6, as-is)
1. **Zod validation** (#12-#14, #17) — Add schema validation ✅
2. **Error-causes switch** (#15) — Use `errorCauses` pattern ✅
3. **Remove IIFEs** (#19-#24) — Change `getAgentConfig` return value ✅
4. **Use Try** (#25-#27) — Replace try/catch in tests ✅
5. **Remove mutations** (#16) — const + .catch() pattern ✅
6. **Simplify color flags** (#18) — Drop `--no-color` ✅
7. **Failure fixture** (general) — Add wrong-prompt test ✅

### Phase B: Targeted Architecture Improvements (addresses #28-#30)
1. **Make `parseImports()` AI-driven** — Instead of regex, pass the file to AI and ask it to identify import paths. Keep the CLI handling the actual file I/O (agent-agnostic).
2. **Replace `parseStringResult()` with simpler parsing** — Since the evaluation prompt explicitly requests JSON, reduce to single-strategy JSON parsing or switch evaluation format to TAP.
3. **Optionally separate execution from evaluation** — If desired, add a dedicated "Result Generator" step while keeping the existing extraction phase. This is additive, not a rewrite.

### What This Achieves
- Addresses ALL 16 reviewer comments ✅
- Keeps 186+ tests passing ✅
- Maintains agent-agnostic design ✅
- Preserves reliability guarantees ✅
- No deletion of working, tested code ✅
- Lower risk than full rewrite ✅
- Can be shipped incrementally ✅

---

## 9. Honest Assessment: Where the Current Implementation IS Weak

To be fair, the current implementation has genuine weaknesses:

1. **`parseStringResult()` IS overcomplicated** — Multi-strategy parsing (direct JSON, markdown extraction, plain text fallback) is a code smell. It exists because AI agents are unpredictable, but it's fragile. This should be simplified. (Comment #30 is correct here.)

2. **`parseImports()` IS inflexible** — The regex `import @\w+ from ['"](.+?)['"]` only handles one import syntax. This should be more flexible. (Comment #28 is correct here.)

3. **The extraction prompt IS complex** — `buildExtractionPrompt()` asks for structured JSON output, which is exactly the kind of parsing instruction the epic wanted to avoid. There's a philosophical tension.

4. **No failure fixture** — The general review comment is right: you need to test that tests can fail. This is a gap.

5. **IIFEs in tests** — The IIFE pattern in `getAgentConfig` tests is genuinely bad. Should be fixed.

6. **Try not used for error tests** — The project has a `Try` utility specifically for this. It should be used.

**But none of these weaknesses require a full architecture rewrite.** They can all be fixed incrementally, in the existing architecture.

---

## 10. Risk-Benefit Summary

| | Current + Incremental Fixes | Full 3-Actor Rewrite |
|---|---|---|
| **Requirements satisfied** | 100% (already) | 100% (in theory) |
| **Tests preserved** | All 186+ | ~75 deleted, ~75 new needed |
| **New user-facing features** | Failure fixture | Failure fixture |
| **New bugs introduced** | Low risk (incremental changes) | High risk (rewrite of core module) |
| **Agent-agnostic** | Yes (current design) | Uncertain (file access dependency) |
| **AI calls per test** | 1 extraction + N evaluations | 1 orchestrator + N*(1 generator + M judges) |
| **Reliability** | Proven (two-phase with template) | Unproven (new TAP parsing, AI file I/O) |
| **Time to ship** | Days (incremental) | Weeks (rewrite + re-test) |
| **Addresses reviewer comments** | All 16 | All 16 |
| **KISS compliance** | Simpler (fewer actors, fewer steps) | More complex (3 actors, 5 steps, file I/O) |
| **YAGNI compliance** | No unnecessary additions | Adds Result Generator, file management, TAP parser |

---

## 11. Conclusion

The remediation plan's Task 1 (Architecture Refactor) conflates three different things:

1. **Legitimate code quality issues** — `parseStringResult` complexity, IIFE patterns, missing Zod validation, etc. These should be fixed. Everyone agrees.

2. **A directional architectural suggestion from the reviewer** — "The orchestrator agent should pull in the prompt file" and "Any parsing step is probably wrong." These are valuable insights that should inform incremental improvements.

3. **A maximalist interpretation** — The remediation plan extrapolates the reviewer's suggestions into a complete 3-actor pipeline rewrite with 5 steps, 3 new files, 10 deleted functions, and fundamental restructuring of the core module.

Per [please.mdc](../ai/rules/please.mdc): "Do ONE THING at a time, get user approval before moving on."
Per [javascript.mdc](../ai/rules/javascript/javascript.mdc): YAGNI, KISS, DRY.
Per [tdd.mdc](../ai/rules/tdd.mdc): "Implement ONLY the code needed to make the test pass."

The current implementation works. It passes all tests. It satisfies all requirements. It's agent-agnostic. The proposed rewrite adds risk, complexity, and cost for **no new user-facing capability**. The reviewer's feedback can be fully addressed through incremental improvements to the existing architecture.

**Recommendation:** Ship Tasks 2-6 immediately (they're independent and non-controversial). For Task 1, propose the incremental alternative (Phase B above) and discuss with the reviewer whether a full rewrite is truly necessary or if targeted improvements satisfy the intent.

---

## References

- [Epic requirements](../tasks/archive/2026-01-22-riteway-ai-testing-framework/2026-01-22-riteway-ai-testing-framework.md)
- [Remediation plan](../tasks/2026-02-09-pr394-remediation.md)
- [Architecture review](../tasks/2026-02-09-task1-architecture-review.md)
- [vision.md](../vision.md) — "The standard testing framework for AI Driven Development and software agents"
- [javascript.mdc](../ai/rules/javascript/javascript.mdc) — YAGNI, KISS, DRY, SDA
- [please.mdc](../ai/rules/please.mdc) — "Do ONE THING at a time"
- [tdd.mdc](../ai/rules/tdd.mdc) — "Implement ONLY the code needed"
- [error-causes.mdc](../ai/rules/javascript/error-causes.mdc) — Structured error handling
- [AGENTS.md](../AGENTS.md) — Progressive discovery, vision-first
