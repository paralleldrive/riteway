# Technical Feasibility & Risk Assessment — Architecture Review

> **Date:** 2026-02-09
> **Role:** Technical Feasibility Analyst (neutral position)
> **PR:** [#394](https://github.com/paralleldrive/riteway/pull/394)
> **Review:** [janhesters review (3764740159)](https://github.com/paralleldrive/riteway/pull/394#pullrequestreview-3764740159)
> **References:** Epic requirements, remediation plan, architecture review, all rules files

---

## 1. Agent CLI Capabilities Audit

### Claude Code (`claude -p`)

| Capability | Status | Evidence |
|-----------|--------|----------|
| Read files from disk | **YES** | `--allowedTools "Read"` enables auto-approved file reads. Tools include Read, Edit, Bash. ([source](https://code.claude.com/docs/en/headless)) |
| Write files to disk | **YES** | `--allowedTools "Edit"` or `--allowedTools "Bash"` enables file writing. ([source](https://code.claude.com/docs/en/headless)) |
| Execute shell commands | **YES** | `--allowedTools "Bash"` enables shell execution. ([source](https://code.claude.com/docs/en/headless)) |
| Structured JSON output | **YES** | `--output-format json` wraps response in `{result: ...}` envelope. `--json-schema` for constrained output. ([source](https://code.claude.com/docs/en/headless)) |
| Tool access in pipe mode | **YES, but requires explicit flags** | Without `--allowedTools`, tools require user approval (impossible in subprocess). Must explicitly pass `--allowedTools "Read,Edit,Bash"` for autonomous tool use. |
| Session persistence | **Configurable** | `--no-session-persistence` prevents session files. |

**Critical finding:** The current codebase spawns Claude with `['-p', '--output-format', 'json', '--no-session-persistence']` — this does **NOT** include `--allowedTools`. Without `--allowedTools`, Claude in pipe mode may still attempt tool use but cannot get user approval. This means **the orchestrator cannot currently read files** unless `--allowedTools "Read"` is added.

### OpenCode (`opencode run`)

| Capability | Status | Evidence |
|-----------|--------|----------|
| Read files from disk | **LIKELY YES** | Built-in tools include ReadTool, WriteTool, EditTool. ([DeepWiki source](https://deepwiki.com/sst/opencode/6.1-file-editing-tools)) |
| Write files to disk | **LIKELY YES** | WriteTool and EditTool in tool registry. |
| Execute shell commands | **LIKELY YES** | BashTool in tool registry. |
| Structured JSON output | **YES** | `--format json` outputs raw JSON events (NDJSON). ([source](https://opencode.ai/docs/cli/)) |
| Tool access in run mode | **UNCERTAIN** | Docs state "all permissions are auto-approved for the session" for run mode, but this isn't detailed. Tool registry appears shared across contexts. |
| File attachment | **YES** | `--file` or `-f` flag for attaching files. |

**Critical finding:** OpenCode documentation does not explicitly confirm which tools are available in non-interactive `run` mode. The statement "all permissions are auto-approved" suggests tools work, but this is undocumented for our specific use case.

### Cursor (`agent --print`)

| Capability | Status | Evidence |
|-----------|--------|----------|
| Read files from disk | **YES** | "Full write access in non-interactive mode." Has tools for file operations. ([source](https://cursor.com/docs/cli/using)) |
| Write files to disk | **YES** | "Cursor has full write access in non-interactive mode." |
| Execute shell commands | **YES** | Shell command tools available. |
| Structured JSON output | **YES** | `--output-format json` for structured output. ([source](https://cursor.com/docs/cli/using)) |
| Tool access in print mode | **YES** | Full tool access confirmed for non-interactive mode. |
| Non-interactive flag | **`-p` or `--print`** | Same flag name as Claude Code. |

**Note:** Cursor CLI is still in beta. Capabilities may change. The documentation warns to "use at your own risk only in trusted environments."

### Capability Summary

| Agent | File Read | File Write | Bash | JSON Output | Tool Auto-Approve |
|-------|-----------|------------|------|-------------|-------------------|
| Claude Code | Yes (needs `--allowedTools`) | Yes (needs `--allowedTools`) | Yes (needs `--allowedTools`) | Yes | **Must be explicit** |
| OpenCode | Likely | Likely | Likely | Yes (NDJSON) | Auto per docs (uncertain) |
| Cursor | Yes | Yes | Yes | Yes | Yes in non-interactive |

**Bottom line:** Tool access is feasible for all three agents, but the implementation gap is significant. The current Claude config (`['-p', '--output-format', 'json']`) does NOT enable file access. The proposed architecture requires changing the agent args to include `--allowedTools "Read"` (or broader). This is a config change, not an architectural barrier — but it has security implications (giving the agent broader permissions).

---

## 2. AI Call Cost/Latency Comparison

### Scenario: Test file with 4 assertions, 4 runs each

#### Current Architecture: Two-Phase Extraction

```
Phase 1: 1 extraction call (parse test file → structured JSON)
Phase 2: 4 assertions × 4 runs × 1 evaluation call = 16 calls
─────────────────────────────────────────────────────────
Total:   17 AI calls
```

**Latency profile:**
- Phase 1 (serial): ~5-15s (extraction call)
- Phase 2 (parallel, concurrency=4): ~4 batches × ~10-30s = ~40-120s
- **Total wall clock: ~45-135s**

#### Proposed 3-Actor Pipeline

```
Step 1: 1 orchestrator call (understand test file, identify assertions)
Step 2: 1 result generator call (execute prompt)
Step 3: Dispatch (orchestrator, no additional call — deterministic)
Step 4: 4 assertions × 4 runs × 1 judge call = 16 calls
Step 5: Aggregation (deterministic, no call)
─────────────────────────────────────────────────────────
Total:   18 AI calls
```

**Wait — but who dispatches in Step 3?** The remediation plan says the orchestrator dispatches judges. If the orchestrator is an AI agent running as a subprocess, it cannot spawn further subprocesses from within the pipe session (Claude's `-p` mode doesn't support tool callbacks for spawning CLI subprocesses). The CLI harness must do the dispatching.

**Revised 3-actor pipeline (CLI-driven):**
```
Step 1: CLI → Orchestrator AI → returns { promptUnderTest, userPrompt, assertions[] }
Step 2: CLI → Result Generator AI → returns actual result
Step 3: CLI dispatches (deterministic)
Step 4: CLI → 4 assertions × 4 runs × Judge AI = 16 calls
Step 5: CLI aggregates (deterministic)
─────────────────────────────────────────────────────────
Total:   18 AI calls
Serial steps: 1 (orchestrator) + 2 (result gen) = 2 serial before parallelism begins
```

**Latency profile:**
- Step 1 (serial): ~5-15s (orchestrator)
- Step 2 (serial): ~10-30s (result generation — executing the prompt)
- Steps 1+2 must complete before Step 4 can begin
- Step 4 (parallel, concurrency=4): ~4 batches × ~10-30s = ~40-120s
- **Total wall clock: ~55-165s**

#### Comparison

| Metric | Current | 3-Actor Pipeline | Delta |
|--------|---------|-----------------|-------|
| Total AI calls | 17 | 18 | +1 (5.9%) |
| Serial steps before parallelism | 1 | 2 | +1 added serial step |
| Min latency (optimistic) | ~45s | ~55s | +10s |
| Max latency (pessimistic) | ~135s | ~165s | +30s |
| Cost per test run | ~17 calls | ~18 calls | Negligible |

**Assessment:** The cost difference is negligible (1 extra call). The latency difference is modest — one additional serial step (result generator). The dominant cost in both architectures is the 16 parallel judge/evaluation calls.

**However**, the 3-actor pipeline adds a critical constraint: the result generator must complete before ANY judge calls can begin. In the current architecture, evaluation prompts are self-contained (they include the instruction to both execute and evaluate), so all 16 calls can begin as soon as extraction completes. The 3-actor pipeline adds ~10-30s of serial latency before judge parallelism starts.

---

## 3. Output Format Reliability

### TAP Format

```
ok 1 - Given color scheme, should include high contrast colors
not ok 2 - Given color scheme, should use semantic colors
# reasoning: The response used custom hex codes without semantic meaning
```

**LLM reliability for TAP generation:**
- TAP is a very simple line-oriented format
- `ok N - description` or `not ok N - description` is easy for LLMs to produce
- The format is well-documented and widely known in training data
- Single-assertion TAP is trivially parseable: look for line starting with `ok` or `not ok`
- Risk of format deviation: **LOW** — TAP's simplicity works in its favor

**Edge cases:**
- LLM may add preamble text before TAP lines (mitigation: scan for first `ok`/`not ok` line)
- LLM may include markdown formatting (```, etc.) around TAP output
- LLM may renumber assertions or use descriptions that don't match the input
- LLM may produce multi-line diagnostics that are valid TAP but complicate parsing

### JSON Format

```json
{"passed": true, "output": "The color scheme uses green for pass...", "reasoning": "..."}
```

**LLM reliability for JSON generation:**
- JSON is well-understood by LLMs but prone to common errors:
  - Trailing commas
  - Unescaped special characters in strings
  - Markdown code fences wrapping (`\`\`\`json ... \`\`\``)
  - Extra explanatory text before/after JSON
- These are exactly why the current implementation has `parseStringResult` with multi-strategy fallback

**Current implementation handles these with:**
1. Direct JSON parse (if starts with `{` or `[`)
2. Markdown code fence extraction + parse
3. Fallback to plain text

This is the "multi-strategy parsing" that the reviewer calls "probably wrong."

### Comparison

| Aspect | TAP (proposed) | JSON (current) |
|--------|---------------|----------------|
| Format simplicity | Very simple, line-oriented | Structured, more syntax rules |
| LLM generation reliability | HIGH (simple format, well-known) | MEDIUM (many syntax edge cases) |
| Parsing complexity | Low (regex for ok/not ok) | Medium (multi-strategy fallback) |
| Error recovery | Easy (scan for assertion line) | Hard (invalid JSON = total failure without fallback) |
| Rich metadata | Limited (TAP diagnostics with `#`) | Flexible (arbitrary JSON fields) |
| Edge case prevalence | Low | Medium-High (code fences, trailing commas, preamble) |

**Assessment:** TAP is a defensible choice for single-assertion output. Its simplicity genuinely reduces parsing complexity and LLM error rates. The reviewer's point about `parseStringResult` being "probably wrong" is technically fair — its multi-strategy approach exists because JSON format reliability from LLMs is genuinely problematic. TAP sidesteps this issue through format simplicity.

**However**, switching from JSON to TAP means losing structured metadata in the response. The current JSON format returns `{passed, output, reasoning}` — three distinct fields. TAP can encode the pass/fail and description, but `output` (the actual generated content) and `reasoning` (why it failed) require TAP diagnostic comments (`#`), which are less structured.

---

## 4. Migration Scope Assessment

### Functions to Delete (10)

| Function | File | LOC | Test Coverage (assertions) |
|----------|------|-----|---------------------------|
| `parseStringResult` | ai-runner.js | 31 | 8 tests |
| `buildExtractionPrompt` | test-extractor.js | 19 | 4 tests |
| `parseExtractionResult` | test-extractor.js | 24 | 10 tests |
| `extractJSONFromMarkdown` | test-extractor.js | 5 | (tested via parseExtractionResult) |
| `tryParseJSON` | test-extractor.js | 8 | (tested via parseExtractionResult) |
| `extractTests` | test-extractor.js | 87 | 5 tests |
| `buildEvaluationPrompt` | test-extractor.js | 24 | (tested via extractTests) |
| `parseImports` | test-extractor.js | 4 | 3 tests |
| `readTestFile` | ai-runner.js | 1 | 2 tests |
| `validateFilePath` | ai-runner.js | ~14 | 4 tests |
| **Total** | | **~217 LOC** | **~36 test assertions lost** |

**Note on `validateFilePath`:** The architecture review (Concern 2) correctly identifies that `bin/riteway.js:123` actively uses this function. Removing it creates a **path traversal vulnerability**. It should be kept regardless of architecture choice.

### Functions to Add (7+)

| Function | File | Est. LOC | New Tests Needed |
|----------|------|----------|-----------------|
| `parseSingleAssertionTAP` | tap-parser.js | ~20 | ~6 assertions |
| `aggregateTAPResults` | ai-runner.js (replaces existing) | ~20 | ~6 assertions |
| `buildOrchestratorPrompt` | prompts/orchestrator.js | ~30 | ~4 assertions |
| `buildResultGeneratorPrompt` | prompts/orchestrator.js | ~20 | ~3 assertions |
| `buildJudgePrompt` | prompts/orchestrator.js | ~25 | ~4 assertions |
| `createResultDirectory` | result-manager.js | ~10 | ~3 assertions |
| `generateResultFilePath` | result-manager.js | ~10 | ~2 assertions |
| **Total** | | **~135 LOC** | **~28 new assertions** |

### Functions to Modify (3)

| Function | File | Change | Est. LOC Changed |
|----------|------|--------|-----------------|
| `executeAgent` | ai-runner.js | Add `expectTAP` param, simplify JSON parsing | ~30 LOC |
| `runAITests` | ai-runner.js | Complete rewrite for 5-step pipeline | ~80 LOC |
| `aggregatePerAssertionResults` | ai-runner.js | Rename + restructure for TAP | ~20 LOC |

### Files Created vs Deleted

| Action | Files |
|--------|-------|
| **Delete** | `source/test-extractor.js`, `source/test-extractor.test.js` |
| **Create** | `source/tap-parser.js`, `source/tap-parser.test.js`, `source/prompts/orchestrator.js`, `source/prompts/orchestrator.test.js`, `source/result-manager.js`, `source/result-manager.test.js`, `source/fixtures/wrong-prompt-test.sudo` |
| **Net** | **-2 files, +7 files = +5 files** |

### Total Estimated Change

| Metric | Count |
|--------|-------|
| Functions deleted | 10 (keep `validateFilePath` = 9) |
| Functions added | 7 |
| Functions modified | 3 |
| Files deleted | 2 |
| Files created | 7 |
| LOC deleted | ~217 |
| LOC added | ~135 + ~130 modified = ~265 |
| Test assertions deleted | ~36 |
| Test assertions added | ~28 |
| **Net LOC change** | +48 LOC (roughly neutral) |

### Can It Be Done Incrementally?

**Partially.** The architecture has a natural decomposition:

1. TAP parser (independent — add alongside existing code)
2. Prompt builders (independent — add alongside existing code)
3. Pipeline restructure (**breaking** — this is the big bang moment where `runAITests` switches from extraction-based to orchestrator-based)
4. Cleanup (dependent on #3 — delete old code)

The **critical path** is step 3. The current `runAITests` calls `extractTests` which returns evaluation prompts. The new pipeline calls an orchestrator agent then a result generator then judges. These are fundamentally different flows — you can't gradually morph one into the other without an intermediate adapter layer that would add complexity.

**Verdict:** Steps 1-2 can be incremental. Step 3 is a controlled replacement. Step 4 is cleanup. The migration is **semi-incremental** — new infrastructure can be built alongside old, but the switchover is a single commit.

---

## 5. Risk Matrix

| Risk | Current Approach (Two-Phase) | 3-Actor Pipeline | Notes |
|------|------------------------------|-----------------|-------|
| **Format reliability** | MEDIUM — multi-strategy JSON parsing handles LLM inconsistency | LOW — TAP is simpler for LLMs to produce | TAP advantage is real but modest |
| **Agent compatibility** | HIGH — works with any agent that can output text | MEDIUM — requires agents with file read tools (if orchestrator reads files) OR LOW (if CLI reads files, Option A) | File access is the key differentiator |
| **Test coverage** | HIGH — 108 Vitest + 78 TAP assertions, 36 assertions cover extraction | MEDIUM during migration — 36 assertions deleted, ~28 added; gap period during transition | Risk mitigated if TAP parser tests are written first (TDD) |
| **Maintenance burden** | MEDIUM — multi-strategy parsing is complex but stable | MEDIUM — prompt engineering for 3 actors requires ongoing tuning | Different maintenance profiles, neither clearly better |
| **Debugging difficulty** | MEDIUM — extraction pipeline has clear phase boundaries | HIGHER — 3-actor pipeline has more moving parts (orchestrator → result gen → judge) | More actors = more failure points to diagnose |
| **User-facing behavior** | Stable — existing behavior works | RISK — TAP output format change visible to users | Breaking change for anyone parsing current output |
| **Security** | GOOD — `validateFilePath` prevents path traversal | RISK if `validateFilePath` removed — path traversal vulnerability | Must keep `validateFilePath` regardless |
| **Prompt stability** | MEDIUM — extraction prompt needs periodic tuning | HIGHER — 3 different prompts (orchestrator, result gen, judge) need coordinated tuning | 3x the prompt surface area to maintain |

---

## 6. Three File Access Options Analysis

### Option A: CLI Reads Files, Passes Content

```
CLI reads test file → content in orchestrator prompt
Orchestrator returns { importPaths[], userPrompt, assertions[] }
CLI reads imports → content in result generator prompt
CLI captures result generator stdout → content in judge prompt
```

| Criterion | Assessment |
|-----------|-----------|
| Claude Code compatibility | **FULL** — no `--allowedTools` needed, text-in/text-out |
| OpenCode compatibility | **FULL** — same reason |
| Cursor compatibility | **FULL** — same reason |
| Implementation complexity | **MEDIUM** — CLI needs some logic to identify import paths from orchestrator response, and manage prompt assembly |
| Epic alignment | **PARTIAL** — epic says "pass complete file to AI agent" but this approach passes file content in the prompt (semantically similar, not file path delegation). The orchestrator still "understands" the file content. |
| Prompt size concern | **MEDIUM** — embedding file content inline increases prompt size. For typical SudoLang test files (<1KB) and prompt-under-test files (<10KB), this is manageable. |
| `validateFilePath` implication | **Still needed** for CLI-level path validation of user input. Import path validation shifts to CLI (safe, deterministic). |

### Option B: Hybrid — CLI Reads Test File, Orchestrator Identifies Imports

```
CLI reads test file → content in orchestrator prompt
Orchestrator returns { importPaths[], userPrompt, assertions[] }
CLI reads imported files → all content in result generator prompt
CLI captures stdout → content in judge prompt
```

| Criterion | Assessment |
|-----------|-----------|
| Claude Code compatibility | **FULL** — no tool access needed |
| OpenCode compatibility | **FULL** |
| Cursor compatibility | **FULL** |
| Implementation complexity | **MEDIUM** — same as Option A, essentially. The orchestrator identifies imports (AI-driven), CLI reads them (reliable). |
| Epic alignment | **GOOD** — AI understands the file structure (no deterministic parsing), CLI handles I/O (reliable) |
| Security | **REQUIRES IMPORT VALIDATION** — CLI must validate import paths returned by the orchestrator before reading them. An adversarial or confused orchestrator could return `../../.env`. |

**Note:** Options A and B are functionally identical in this architecture. The distinction is semantic — in both cases, the CLI reads the test file, passes content to the orchestrator, and the orchestrator returns structured metadata including import paths.

### Option C: Agent Reads Files (Current Plan)

```
CLI passes file PATH to orchestrator
Orchestrator uses Read tool to read test file and imports
Orchestrator dispatches result generator and judge
```

| Criterion | Assessment |
|-----------|-----------|
| Claude Code compatibility | **CONDITIONAL** — requires `--allowedTools "Read"` in agent config. Currently NOT configured. |
| OpenCode compatibility | **UNCERTAIN** — tool access in `run` mode is undocumented |
| Cursor compatibility | **LIKELY** — "full write access in non-interactive mode" suggests read access too, but beta |
| Implementation complexity | **LOW** — cleanest architecture, agent handles everything |
| Epic alignment | **BEST** — most closely matches "agent should pull in the prompt file" (comment #17) |
| Agent-agnostic design | **POOR** — violates epic requirement of agent-agnostic design. Each agent has different tool access configurations. |
| Reliability | **LOWEST** — agent tool use is non-deterministic. Agent might not use Read tool, might fail silently, might read wrong file. |

### Recommendation

**Option A/B (effectively the same)** is the pragmatically correct choice for the following reasons:

1. **Agent-agnostic** — works with any agent that can process text (per epic requirement)
2. **Deterministic I/O** — file reading is reliable, not dependent on agent tool use
3. **No config changes needed** — doesn't require `--allowedTools` modifications per agent
4. **Testable** — file reading can be tested deterministically; prompt assembly is verifiable
5. **Per javascript.mdc** — "separate mapping from IO" — CLI handles IO, agent handles understanding

The trade-off is slightly larger prompts (file content embedded), but this is negligible for typical test files.

---

## 7. Incremental Migration Path

### Step 1: Add TAP Parser (Low Risk)

**Change:** Create `source/tap-parser.js` with `parseSingleAssertionTAP`.

**Risk:** NONE — purely additive, no existing code modified.

**Test impact:** +6 new assertions, 0 existing tests affected.

**Per tdd.mdc:** Write tests first, implement to make them pass.

### Step 2: Add Prompt Builders (Low Risk)

**Change:** Create `source/prompts/orchestrator.js` with `buildOrchestratorPrompt`, `buildResultGeneratorPrompt`, `buildJudgePrompt`.

**Risk:** NONE — purely additive.

**Test impact:** +11 new assertions, 0 existing tests affected.

**Per javascript.mdc:** "One job per function" — each prompt builder has a single responsibility.

### Step 3: Add Result Manager (Low Risk)

**Change:** Create `source/result-manager.js` with temp directory and file path utilities.

**Risk:** LOW — purely additive, depends on existing `test-output.js` for slug generation.

**Test impact:** +5 new assertions.

### Step 4: Create New `runAITests3Actor` (Medium Risk)

**Change:** Implement the 5-step pipeline as a NEW function alongside the existing `runAITests`. Do not replace it yet.

**Risk:** MEDIUM — new code with complex orchestration, but isolated from existing functionality.

**Test impact:** +10 new integration-style assertions using mock agents.

**Per please.mdc:** "Do ONE THING at a time" — this step only adds the new function.

### Step 5: Wire Up and Switch Over (HIGH Risk)

**Change:** Update `bin/riteway.js` to call `runAITests3Actor` instead of `runAITests`. Update agent configs to include any needed flags.

**Risk:** HIGH — this is the moment where user-facing behavior changes. All existing extraction-based tests become irrelevant. The new pipeline must be fully functional.

**Mitigation:**
- Feature flag: `--pipeline=3actor` vs `--pipeline=legacy` (temporary)
- Or: just switch and rely on test coverage of the new pipeline
- Per error-causes.mdc: all error paths should use structured error causes

**Test impact:** Existing `runAITests` integration tests may need updating.

### Step 6: Delete Dead Code (Low Risk)

**Change:** Remove `test-extractor.js`, `test-extractor.test.js`, and dead functions from `ai-runner.js`.

**Risk:** LOW — all code being deleted is unreachable after Step 5.

**Test impact:** -36 assertions (code they test is gone).

### Step 7: Add Failure Fixture (Low Risk)

**Change:** Create `source/fixtures/wrong-prompt-test.sudo` and corresponding test.

**Risk:** LOW — purely additive.

**Per tdd.mdc:** Write the test that expects failure first, then create the fixture.

**Important per architecture review Concern 3:** The failure fixture test should use a MOCK agent for unit tests. A separate E2E test (excluded from `npm test`) can use a real agent.

---

## 8. Recommendation Matrix

Weights reflect the project's priorities as expressed in vision.md ("standard testing framework for AI Driven Development"), AGENTS.md (progressive discovery, vision-first), and the epic requirements (agent-agnostic, subprocess-based, no parsing).

| Criterion | Weight | Current (Two-Phase) | 3-Actor (Full Replacement) | 3-Actor (Incremental, Option A/B) |
|-----------|--------|---------------------|---------------------------|-----------------------------------|
| **Requirements compliance** | 30% | 6/10 — works but uses extraction parsing that epic says to avoid | 9/10 — closely matches reviewer vision and epic's "don't parse" mandate | 8/10 — same as full but with pragmatic compromises |
| **Implementation risk** | 25% | 9/10 — already built and tested | 4/10 — big-bang replacement, file access uncertainty, prompt coordination | 7/10 — phased rollout, each step testable, fallback possible |
| **Maintenance cost** | 15% | 6/10 — multi-strategy parsing is fragile, 1 prompt to maintain | 5/10 — 3 prompts to maintain, but each is simpler | 6/10 — same as full, prompt count is inherent to design |
| **Agent compatibility** | 15% | 8/10 — works with text-in/JSON-out | 5/10 — Option C needs tool access per agent | 8/10 — Option A/B works with any agent |
| **Code simplicity** | 15% | 5/10 — multi-strategy parsing, extraction pipeline, template assembly | 7/10 — simpler per-component but more components | 7/10 — same |
| **Weighted Score** | | **6.85** | **6.10** | **7.35** |

### Scoring Breakdown

**Current (Two-Phase):**
- Strong on risk (it works) and compatibility (text-in/text-out)
- Weak on requirements compliance (extraction parsing contradicts epic)
- Weak on code simplicity (multi-strategy parsing, template assembly)

**3-Actor (Full Replacement):**
- Strong on requirements compliance (matches reviewer's architecture)
- Weak on implementation risk (big-bang replacement, tool access concerns, 3 prompts need coordination)
- Weak on agent compatibility IF using Option C (agent file access)

**3-Actor (Incremental, Option A/B):**
- Good on requirements (moves toward reviewer's vision)
- Good on risk (phased, testable, reversible)
- Good on compatibility (CLI handles I/O, agents handle reasoning)
- Compromises: slightly less pure than reviewer's full vision, but pragmatically safer

### Overall Assessment

The **incremental 3-actor migration using Option A/B for file access** is the recommended path. It:

1. Addresses the reviewer's primary concern (eliminating extraction parsing per comment #17, #19)
2. Maintains agent-agnostic design (per epic requirement)
3. Follows TDD discipline (per tdd.mdc — each step starts with tests)
4. Keeps one responsibility per function (per javascript.mdc)
5. Does ONE THING at a time (per please.mdc)
6. Uses error-causes throughout (per error-causes.mdc)
7. Preserves `validateFilePath` for CLI input security (per architecture review Concern 2)
8. Uses mock agents for unit tests, real agents for E2E (per architecture review Concern 3)

The current architecture is not broken — it works and has good test coverage. But it does contradict the epic's "don't parse" directive and the reviewer's vision. The incremental path resolves this contradiction without the risk of a big-bang replacement.

---

## Appendix A: PR Review Comments (janhesters, review #3764740159)

| # | File | Line | Summary |
|---|------|------|---------|
| 12 | bin/riteway.js | 90 | Centralize defaults in `default` parameter |
| 13 | bin/riteway.js | 97 | Replace magic `4` with `defaults.concurrency` |
| 14 | bin/riteway.js | 100 | Bring in Zod for schema validation + error causes |
| 15 | source/ai-runner.js | 187 | Use error-causes switch pattern |
| 16 | bin/riteway.js | 167 | Avoid mutations (let, forEach) per JS style guide |
| 17 | bin/riteway.test.js | 304 | `parseAIArgs([])` should error |
| 18 | bin/riteway.test.js | 377 | Simplify `--color`/`--no-color` |
| 19 | bin/riteway.test.js | 410 | Align color test with other patterns |
| 20-24 | bin/riteway.test.js | 429+ | Remove IIFEs from getAgentConfig tests; change return value or use block scope |
| 25 | bin/riteway.test.js | 516 | Use `Try` for sync error test |
| 26 | bin/riteway.test.js | 548 | Use `Try` for async error test |
| 27 | bin/riteway.test.js | 586 | Same (async Try) |
| 28 | fixtures/media-embed-test.sudo | 1 | Import syntax + orchestrator agent + architecture diagram 1 |
| 29 | source/ai-runner.js | 15 | `validateFilePath` may not be needed if AI handles imports |
| 30 | source/ai-runner.js | 40 | "Any parsing step is probably wrong" + architecture diagram 2 |

---

## Appendix B: Rules Files Cross-Reference

| Rule | Relevant Application |
|------|---------------------|
| **please.mdc** — "Do ONE THING at a time" | Incremental migration (one step per phase). Each actor in 3-actor pipeline has one job. |
| **javascript.mdc** — "One job per function; separate mapping from IO" | CLI handles IO (file reading), agents handle reasoning. `parseSingleAssertionTAP` has one job. |
| **javascript.mdc** — "Avoid IIFEs" | Test pattern fixes (Task 3 in remediation plan) — remove IIFEs from getAgentConfig tests |
| **javascript.mdc** — "Prefer immutability; use const, spread" | Code style fixes (Task 6) — eliminate `let` and `forEach` mutations |
| **javascript.mdc** — "SDA - Self Describing APIs" | `getAgentConfig` return value should be directly assertable (Q7 resolution) |
| **tdd.mdc** — "Write a test. Run the test runner and watch the test fail." | Each migration step starts with tests. TAP parser tests written before implementation. |
| **tdd.mdc** — "Tests must demonstrate locality" | Each actor's tests are self-contained with mock agents |
| **error-causes.mdc** — "Always use createError instead of new Error()" | All new error paths must use `createError` with structured metadata |
| **error-causes.mdc** — "Define error types using errorCauses()" | Module-level error definitions for ai-runner.js (Task 5) |

---

## Appendix C: Agent CLI Documentation Sources

- [Claude Code — Run Programmatically (Headless)](https://code.claude.com/docs/en/headless) — `-p` flag, `--allowedTools`, `--output-format json`
- [OpenCode CLI Docs](https://opencode.ai/docs/cli/) — `opencode run`, `--format json`
- [OpenCode Commands](https://opencode.ai/docs/commands/) — Custom commands, file references
- [OpenCode File Editing Tools](https://deepwiki.com/sst/opencode/6.1-file-editing-tools) — ReadTool, WriteTool, EditTool, BashTool
- [Cursor CLI — Using Agent](https://cursor.com/docs/cli/using) — `-p`/`--print`, `--output-format json`, full write access
- [Cursor CLI Agent Modes](https://cursor.com/changelog/cli-jan-16-2026) — Plan mode, Ask mode, Cloud handoff
