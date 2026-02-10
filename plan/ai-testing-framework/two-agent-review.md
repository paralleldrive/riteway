# 🔍 CODE REVIEW REPORT — Two-Agent Architecture Proposal

**Date:** 2026-02-10
**Reviewer:** code-reviewer (senior code reviewer agent)
**Proposal:** `/Users/ianwhite/code/ParallelDrive/riteway/plan/ai-testing-framework/two-agent-architecture.md`

---

## 📊 Executive Summary

**Verdict:** ⚠️ **BLOCKING ISSUES — Changes Needed** (both blockers now RESOLVED — see annotations below)

**Blockers:** 2 (both RESOLVED)
**High Priority Issues:** 5
**Medium Priority Issues:** 3

### Critical Finding

The two-agent architecture proposal is in **DIRECT CONFLICT** with the approved PR #394 remediation plan (tasks/archive/2026-01-22-riteway-ai-testing-framework/2026-02-09-pr394-remediation.md). The remediation plan's **Task 1** (MUST BE RESOLVED FIRST) specifies a **3-actor architecture** with an orchestrator AI agent that dynamically understands test files, while this proposal refines the existing two-phase extraction pipeline that the remediation plan explicitly says to **REMOVE**.

> **RESOLVED:** User explicitly chose the two-agent approach over the 3-actor orchestrator. Remediation Task 1 is considered outdated/too heavy-handed. This proposal proceeds.

**This is not a "which approach is better" debate — the remediation plan has already made the architectural decision and is waiting for user approval.**

---

## 🚨 Blockers (Must Fix)

### BLOCKER #1: Architectural Conflict with Approved Remediation Plan

**File References:**
- `tasks/archive/2026-01-22-riteway-ai-testing-framework/2026-02-09-pr394-remediation.md:52-189` (Task 1: Architecture Refactor, archived)
- `plan/ai-testing-framework/requirements-conflict-analysis.md:1-403` (Requirements conflict analysis)

**Issue:**

The two-agent proposal refines the existing architecture that PR #394's remediation plan explicitly requires removing. The remediation plan addresses janhesters' review comments (#17, #18, #19) which state:

- Comment #17: "The deterministic parsing reduces the flexibility of the testing surface"
- Comment #18: "We likely won't need `validateFilePath`, if we let the AI extract the prompt under test"
- Comment #19: "Any parsing step is probably wrong because the AI judge is the only thing returning structured output"

**What the Two-Agent Proposal Keeps:**
- `buildResultPrompt` / `buildJudgePrompt` — template-based prompt generation
- `extractTests` — modified extraction pipeline (still uses extraction agent)
- `parseImports` — imperative regex-based import parsing
- `validateFilePath` — path traversal validation

**What the Remediation Plan Removes:**
- **ALL template-based prompts** (orchestrator agent handles dispatch dynamically)
- **ALL extraction pipeline code** (orchestrator agent understands test files natively)
- **ALL imperative parsing** (orchestrator agent uses AI file access)
- **validateFilePath** (unnecessary per comment #18)

**The Remediation Plan's 5-Step, 3-Actor Pipeline:**

```
Step 1: Orchestrator Agent (AI) — reads test file, resolves imports, identifies assertions
Step 2: Result Generator (AI subagent) — executes prompt, writes result files
Step 3: Orchestrator Agent (dispatch) — dispatches judge for each assertion
Step 4: Judge Agent (AI subagent) — reads result file, evaluates, returns TAP
Step 5: CLI Harness (deterministic) — aggregates TAP output
```

**Specific Conflicts:**

| Component | Two-Agent Proposal | Remediation Plan Task 1 | Conflict? |
|-----------|-------------------|------------------------|-----------|
| Test file handling | `readTestFile` reads, extraction agent parses | Orchestrator **agent** receives file as prompt | ⚠️ **YES** |
| Import resolution | `parseImports()` regex + `validateFilePath()` | Orchestrator agent reads imports dynamically | ⚠️ **YES** |
| Assertion parsing | Extraction agent returns structured metadata | Orchestrator agent identifies assertions dynamically | ⚠️ **YES** |
| Prompt generation | Template-based `buildResultPrompt` / `buildJudgePrompt` | Orchestrator agent assembles prompts dynamically | ⚠️ **YES** |
| Architecture | 2 agents (result + judge) | 3 actors (orchestrator + result + judge) | ⚠️ **YES** |

**Recommendation:**

❌ **BLOCK THIS PROPOSAL** until the user makes an explicit architectural decision:

**Option A:** Proceed with the remediation plan's 3-actor orchestrator architecture (removing extraction pipeline)
**Option B:** Override the remediation plan and implement this two-agent proposal instead (keeping extraction pipeline)

These are mutually exclusive approaches. Implementing this proposal would waste work if the user later approves the remediation plan.

---

### BLOCKER #2: Missing Decision on field name: `pass` vs `passed` (RESOLVED: keep `passed`)

**File References:**
- `source/ai-runner.js:343` (current: `r.passed`)
- `plan/ai-testing-framework/two-agent-architecture.md:342-355` (proposed: `r.pass`)

**Issue:**

The proposal changes the field name from `passed` (current) to `pass` (proposed) in the judge response schema. This is a **breaking change** that affects:

1. `aggregatePerAssertionResults()` — line 343 filters on `r.passed`, proposal changes to `r.pass`
2. All existing tests — currently assert `result.passed`, would need to change to `result.pass`
3. External integrations — if any code depends on the response schema

**Current Implementation:**
```js
// ai-runner.js:343
const passCount = runResults.filter(r => r.passed).length;
```

**Proposed:**
```js
// two-agent-architecture.md:342
const passCount = runResults.filter(r => r.pass).length;
```

The proposal acknowledges this as a **breaking change** (line 358: "Field name changes from `r.passed` to `r.pass`") but doesn't justify why. The current field name (`passed`) is:
- **Grammatically correct** ("the test passed" — past tense verb)
- **Already implemented and tested** (78 TAP + 108 Vitest tests use it)
- **Consistent with JavaScript conventions** (boolean properties often use past tense: `loaded`, `initialized`, `completed`)

The proposed field name (`pass`) is:
- **Grammatically awkward** ("the test pass" — infinitive verb, wrong tense)
- **Requires breaking change** to all tests and aggregation logic
- **No clear benefit** — saves 2 characters but reduces clarity

**Recommendation:**

**Keep `passed` (current field name).** Change the proposal to use `passed` instead of `pass`. The judge response schema should be:

```json
{
  "passed": true,
  "actual": "...",
  "expected": "...",
  "score": 85
}
```

This avoids a needless breaking change and maintains grammatical correctness.

---

## ⚠️ High Priority Issues (Strongly Recommend Fixing Before Merge)

### HIGH #1: extractTests() Return Shape Breaks Existing runAITests()

**File References:**
- `source/test-extractor.js:283-369` (current `extractTests`)
- `source/ai-runner.js:399-401` (current `runAITests` consumes `extractTests`)
- `plan/ai-testing-framework/two-agent-architecture.md:192-234` (proposed new shape)

**Issue:**

The proposal changes `extractTests()` return value from:

```js
// Current (array of objects with prompt field)
[
  { id: 1, description, userPrompt, requirement, prompt: "<evaluation prompt>" },
  { id: 2, description, userPrompt, requirement, prompt: "<evaluation prompt>" }
]
```

to:

```js
// Proposed (object with assertions array, no prompt field)
{
  userPrompt: string,
  promptUnderTest: string,
  assertions: [
    { id: 1, description, requirement },
    { id: 2, description, requirement }
  ]
}
```

**The Problem:**

Current `runAITests` (ai-runner.js:426) destructures `{ prompt, description }` from the array:

```js
const testTasks = tests.flatMap(({ prompt, description }, index) =>
  // prompt field is REQUIRED here
```

The proposed shape **removes the `prompt` field** from assertions. This will cause `runAITests` to fail with `undefined` for `prompt`.

**Why This Happened:**

The proposal moved prompt generation from `extractTests` (Phase 2) to `runAITests` (new `buildResultPrompt` / `buildJudgePrompt` calls). But the proposal's `runAITests` pseudocode (lines 257-314) shows the new flow WITHOUT updating the actual implementation structure.

**Recommendation:**

Update Section 4 (`extractTests()` return shape) to include a migration plan for `runAITests`:

1. Show the **current** `runAITests` code that expects `{ prompt }` from each test
2. Show the **new** `runAITests` code that calls `buildResultPrompt` / `buildJudgePrompt`
3. Add a **transition section** explaining how the new shape eliminates the need for the `prompt` field

Better yet: provide a complete refactored `runAITests` implementation in the proposal, not just pseudocode.

---

### HIGH #2: Agent Call Count Math Doesn't Account for Extraction Phase

**File References:**
- `plan/ai-testing-framework/two-agent-architecture.md:645-697` (Section 10: Agent Call Count)

**Issue:**

The proposal's agent call count comparison is **incorrect**. It states:

> **Current implementation:**
> ```
> Extraction:    1 call
> Eval agent:    4 assertions × 4 runs = 16 calls
> Total:         1 + 16 = 17 calls
> ```
>
> **Two-agent proposal:**
> ```
> Extraction:    1 call
> Result agent:  4 runs × 1 = 4 calls
> Judge agent:   4 runs × 4 assertions = 16 calls
> Total:         1 + 4 + 16 = 21 calls
> ```
>
> **Delta: +4 calls**

This math is **missing the fact that the extraction call happens PER TEST FILE, not per run.** Let me recalculate:

**Current Implementation (Correct):**
```
Extraction:    1 call per test file
Eval agent:    N assertions × M runs = N×M calls
────────────────────────────────────────────
Total:         1 + (N×M) calls
Example:       1 + (4×4) = 17 calls
```

**Two-Agent Proposal (Correct):**
```
Extraction:    1 call per test file
Result agent:  M runs × 1 = M calls
Judge agent:   M runs × N assertions = M×N calls
────────────────────────────────────────────
Total:         1 + M + (M×N) = 1 + M(1+N) calls
Example:       1 + 4 + (4×4) = 21 calls
```

**The delta calculation is correct (+4 calls), but the explanation misleads by not clearly stating the extraction call is fixed overhead.**

More importantly, the proposal **doesn't address a critical optimization opportunity**: the extraction call could return N assertions, which means the two-agent pattern could batch ALL result generation for a run into a SINGLE agent call that returns N results, instead of calling the result agent once per run.

**Optimized Two-Agent Pattern:**
```
Extraction:          1 call → { userPrompt, promptUnderTest, assertions: [1,2,3,4] }
Result agent (once): 1 call → { results: [r1, r2, r3, r4] } for ALL assertions
Judge agents:        N judges × M runs = 16 calls
────────────────────────────────────────────────────────────
Total:               1 + 1 + (N×M) = 18 calls (only +1 vs current!)
```

This would require the result agent to be aware of ALL assertions and generate N results in one call, but it's architecturally feasible and would make the cost delta negligible.

**Recommendation:**

1. Clarify that extraction is **fixed overhead** (1 call per test file)
2. Add a section on **optimization opportunities** — batched result generation
3. Acknowledge that the proposal's sequential result-per-run approach is **not optimized**

---

### HIGH #3: Missing Error Handling for Judge Agent Invalid Responses

**File References:**
- `plan/ai-testing-framework/two-agent-architecture.md:589-599` (Section 8: Error Handling - Invalid Judge Response)

**Issue:**

The proposal includes a `normalizeJudgment` helper for handling invalid judge responses:

```js
const normalizeJudgment = (raw) => ({
  passed: raw?.passed === true,
  actual: raw?.actual ?? 'No actual provided',
  expected: raw?.expected ?? 'No expected provided',
  score: Number.isFinite(raw?.score) ? Math.max(0, Math.min(100, raw.score)) : 0
});
```

**Problems:**

1. **Silent failure** — If the judge returns garbage, `normalizeJudgment` masks the problem by returning defaults. This makes debugging harder because the test runner continues with bogus data instead of failing loudly.

2. **No logging** — The function doesn't log warnings when it encounters malformed responses. Developers won't know their prompts are failing to produce valid output.

3. **Violates error-causes.md** — The error-causes rule (lines 55-68) states: "When catching and re-throwing errors, preserve the original error as `cause`". Silent normalization violates this principle.

4. **Violates javascript.md principle** — "Favor explicit over implicit." Silently defaulting to `pass: false` and `score: 0` is implicit failure handling.

**What Should Happen:**

Per error-causes.md and javascript.md, the function should:
- **Log a warning** when normalization happens
- **Preserve the raw response** in metadata for debugging
- **Throw an error with cause** if the response is completely unusable (e.g., not even an object)

**Recommended Approach:**

```js
const normalizeJudgment = (raw, { description, runIndex, logger }) => {
  if (typeof raw !== 'object' || raw === null) {
    throw createError({
      name: 'ParseError',
      message: 'Judge returned non-object response',
      code: 'JUDGE_INVALID_RESPONSE',
      description,
      runIndex,
      rawResponse: raw
    });
  }

  const normalized = {
    passed: raw?.passed === true,
    actual: raw?.actual ?? 'No actual provided',
    expected: raw?.expected ?? 'No expected provided',
    score: Number.isFinite(raw?.score) ? Math.max(0, Math.min(100, raw.score)) : 0
  };

  // Warn if normalization applied defaults
  if (raw?.actual === undefined || raw?.expected === undefined) {
    logger.log(`Warning: Judge response missing fields for "${description}" run ${runIndex + 1}`);
  }

  return normalized;
};
```

---

### HIGH #4: Test Impact Analysis Incomplete — Missing Integration Test Changes

**File References:**
- `plan/ai-testing-framework/two-agent-architecture.md:715-742` (Section 11: Test Impact)

**Issue:**

The test impact section lists **unit test** changes but **completely omits integration test** impact. The proposal will break:

1. **`runAITests()` integration tests** (ai-runner.test.js:826-970):
   - Line 830-838: `createDualMockArgs` creates a mock that returns `{ passed: true }`, but the proposal changes to `{ pass: true }` ❌
   - Line 849-851: Extraction returns array of objects, but proposal changes to object with `assertions` array ❌
   - All 4 integration tests will fail

2. **`extractTests()` integration tests** (test-extractor.test.js:401-602):
   - Line 428: Expects `result.length` (array), but proposal returns object ❌
   - Line 441: Expects `result[0].prompt` field, but proposal removes it ❌
   - All tests that assert on return shape will fail

3. **End-to-end fixture tests** (if they exist):
   - Tests that run actual `.sudo` files through the pipeline will fail if they assert on intermediate data shapes

**What's Missing:**

The proposal should include:
- **Full test migration plan** — which tests break, how to fix them
- **Mock agent updates** — update `createDualMockArgs` to return new schema
- **Test file examples** — show before/after for key test cases
- **Regression test plan** — ensure existing `.sudo` fixtures still work

**Recommendation:**

Add a new section: **Section 11.5: Integration Test Migration Plan** with:
1. List of integration tests that break (file:line)
2. For each test: before/after comparison
3. Mock agent updates (especially `createDualMockArgs` schema change)
4. Verification checklist (all existing `.sudo` fixtures still pass)

---

### HIGH #5: Concurrency Model Incorrect — Judge Calls Should Be Parallel Within a Run

**File References:**
- `plan/ai-testing-framework/two-agent-architecture.md:289-302` (runAITests implementation)

**Issue:**

The proposal's `runAITests` pseudocode shows judge calls within a run being executed with `limitConcurrency`:

```js
// Step 2: Call judge agent for EACH assertion (with concurrency limit)
const judgeTasks = assertions.map((assertion, assertionIndex) => async () => {
  const judgePrompt = buildJudgePrompt({ userPrompt, promptUnderTest, result, requirement: assertion.requirement, description: assertion.description });
  logger.log(`  Assertion ${assertionIndex + 1}/${assertions.length}: ${assertion.description}`);
  return executeAgent({ agentConfig, prompt: judgePrompt, timeout, debug, logFile });
});

const judgments = await limitConcurrency(judgeTasks, concurrency);
```

**The Problem:**

All judge calls within a **single run** receive the **same result** and are **completely independent**. There's **no reason to serialize them** with a concurrency limit. They should **all execute in parallel** using `Promise.all`:

```js
const judgments = await Promise.all(
  assertions.map(async (assertion) => {
    const judgePrompt = buildJudgePrompt({ userPrompt, promptUnderTest, result, requirement: assertion.requirement, description: assertion.description });
    return executeAgent({ agentConfig, prompt: judgePrompt, timeout, debug, logFile });
  })
);
```

**Why This Matters:**

- **Performance:** With 4 assertions and concurrency=4, `limitConcurrency` will execute them in parallel anyway, but with overhead. With 10 assertions and concurrency=4, it would serialize into 3 batches unnecessarily.
- **Simplicity:** `Promise.all` is simpler and more idiomatic than `limitConcurrency` when all tasks are truly independent.
- **Cost efficiency:** Maximizing parallelism within a run reduces total wall-clock time.

**When to Use `limitConcurrency`:**

Use `limitConcurrency` for **across-run** parallelism, not **within-run** parallelism:

```js
// Correct concurrency model:
const runTasks = Array.from({ length: runs }, (_, runIndex) => async () => {
  // Step 1: Get result (1 call)
  const result = await executeAgent({ prompt: buildResultPrompt(...) });

  // Step 2: Judge all assertions in parallel (N calls, all parallel)
  const judgments = await Promise.all(
    assertions.map(assertion => executeAgent({ prompt: buildJudgePrompt({ result, ... }) }))
  );

  return judgments;
});

// Limit concurrency ACROSS RUNS, not within runs
const allJudgments = await limitConcurrency(runTasks, concurrency);
```

**Recommendation:**

Update Section 4 (`runAITests()` implementation) to:
1. Use `Promise.all` for judge calls **within a run** (no concurrency limit)
2. Use `limitConcurrency` for **across runs** (if `runs > concurrency`)
3. Add a comment explaining the concurrency strategy

---

## 💡 Medium Priority Issues (Consider for Follow-up)

### MEDIUM #1: buildJudgePrompt Parameter Redundancy

**File References:**
- `plan/ai-testing-framework/two-agent-architecture.md:132-187` (buildJudgePrompt signature)

**Issue:**

The `buildJudgePrompt` function takes both `requirement` and `description` parameters:

```js
export const buildJudgePrompt = ({
  userPrompt,
  promptUnderTest,
  result,
  requirement,  // ← "should Y" part
  description   // ← Full "Given X, should Y" text
}) => string
```

But in the template (lines 169-170), only `description` is used:

```
REQUIREMENT:
{description}
```

**Why is `requirement` passed if it's not used?**

Looking at the current implementation (test-extractor.js:143), `buildEvaluationPrompt` uses `description` (full text) and ignores `requirement`. The proposal inherits this pattern but still includes the unused `requirement` parameter.

**Recommendation:**

1. **Either remove `requirement` parameter** if it's not needed, OR
2. **Use `requirement` in the template** to be more specific:

```
REQUIREMENT:
{description}

Specifically, evaluate whether: {requirement}
```

This would make the judge prompt more focused on the "should Y" part while still providing full context.

---

### MEDIUM #2: Missing TAP Diagnostic Fields in formatTAP

**File References:**
- `plan/ai-testing-framework/two-agent-architecture.md:391-410` (Mapping to TAP Output)
- `source/test-output.js:77-113` (current formatTAP)

**Issue:**

The proposal states (lines 395-398):

```
ok 1 - Given the color scheme, should use semantic colors
  # pass rate: 3/4
  # avg score: 82.50
  # actual: Uses green for pass, red for fail, yellow for pending
  # expected: Semantic colors mapping status to intuitive colors
```

But the current `formatTAP` implementation (test-output.js:77-113) only includes:
- `# pass rate: X/Y` (line 88)
- Media embeds (lines 91-97)

**Missing from current implementation:**
- `# avg score:` — not computed or displayed
- `# actual:` — not part of current response schema
- `# expected:` — not part of current response schema

**The Proposal's Section 3.3 (lines 342-355) Updates `aggregatePerAssertionResults` to Include `averageScore`:**

```js
const averageScore = runResults.length > 0
  ? runResults.reduce((sum, r) => sum + (r.score ?? 0), 0) / runResults.length
  : 0;

return {
  description,
  passed: passCount >= requiredPasses,
  passCount,
  totalRuns: runs,
  averageScore: Math.round(averageScore * 100) / 100,  // ← NEW
  runResults
};
```

But **Section 3.3 doesn't update `formatTAP` to display these new fields.** The proposal's Section 2.3 lists `formatTAP` as "MODIFIED (minor)" but doesn't show the actual modifications.

**Recommendation:**

Add a section showing the **complete `formatTAP` modification**:

```js
assertions.forEach((assertion, index) => {
  const testNumber = index + 1;
  const prefix = assertion.passed ? 'ok' : 'not ok';
  const colorCode = color ? (assertion.passed ? COLORS.green : COLORS.red) : '';
  const resetCode = color ? COLORS.reset : '';

  tap += `${colorCode}${prefix} ${testNumber}${resetCode} - ${assertion.description}\n`;
  tap += `  # pass rate: ${assertion.passCount}/${assertion.totalRuns}\n`;

  // NEW: Add average score
  if (assertion.averageScore !== undefined) {
    tap += `  # avg score: ${assertion.averageScore.toFixed(2)}\n`;
  }

  // NEW: Add actual/expected from last run (or highest-scoring run)
  const displayRun = assertion.runResults[assertion.runResults.length - 1];
  if (displayRun?.actual) {
    tap += `  # actual: ${displayRun.actual}\n`;
  }
  if (displayRun?.expected) {
    tap += `  # expected: ${displayRun.expected}\n`;
  }

  // Existing: Media embeds
  if (assertion.media && assertion.media.length > 0) {
    assertion.media.forEach(({ path, caption }) => {
      const escapedCaption = escapeMarkdown(caption);
      const escapedPath = escapeMarkdown(path);
      tap += `  # ![${escapedCaption}](${escapedPath})\n`;
    });
  }
});
```

---

### MEDIUM #3: Import Error Handling Incomplete

**File References:**
- `plan/ai-testing-framework/two-agent-architecture.md:547-566` (Section 8: Error Handling - Missing promptUnderTest File)

**Issue:**

The proposal adds error handling for missing import files:

```js
const resolvedPath = resolve(projectRoot, path);
try {
  await access(resolvedPath); // Check file exists before reading
} catch {
  throw createError({
    name: 'ValidationError',
    message: `Imported prompt file not found: ${path}`,
    code: 'PROMPT_NOT_FOUND',
    path,
    resolvedPath
  });
}
```

**Problems:**

1. **Uses deprecated `fs.access()`** — The Node.js docs recommend against using `access()` before file operations: "Using `fs.access()` to check for the accessibility of a file before calling `fs.open()` is not recommended. Doing so introduces a race condition."

2. **Swallows actual error** — The `catch` block doesn't preserve the original error as `cause`, violating error-causes.md (lines 55-68).

3. **Not implemented in current code** — The current `extractTests` (test-extractor.js:339) just calls `readFile()` which throws `ENOENT` on missing files. The proposal adds redundant validation.

**Recommendation:**

**Remove the pre-check** and instead wrap `readFile` with better error handling:

```js
try {
  const content = await readFile(resolvedPath, 'utf-8');
  return content;
} catch (originalError) {
  throw createError({
    name: 'ValidationError',
    message: `Failed to read imported prompt file: ${path}`,
    code: 'PROMPT_READ_FAILED',
    path,
    resolvedPath,
    cause: originalError  // ← Preserves original ENOENT or EACCES
  });
}
```

This:
- **Avoids race condition** (no separate `access()` call)
- **Preserves original error** (per error-causes.md)
- **Provides better diagnostics** (distinguishes "not found" from "permission denied")

---

## ✅ Good Practices Observed

### Strengths of the Proposal

1. **Comprehensive documentation** — The proposal is extremely well-documented with clear sections, flow diagrams, and examples.

2. **Backwards compatibility** — CLI interface doesn't change; existing `.sudo` test files continue to work unchanged.

3. **Clear separation of concerns** — Result generation and evaluation are cleanly separated into two agents.

4. **Cost transparency** — Agent call count analysis clearly shows the cost delta (+4 calls per test file).

5. **Edge case coverage** — Section 8 (Error Handling) addresses missing files, invalid responses, timeouts, and extraction failures.

6. **TDD approach** — Section 13 (Implementation Order) follows TDD principles: pure functions first, then integration.

7. **Media support** — Section 7 clearly explains how media embeds work through the import pipeline.

8. **Schema evolution** — The new response schema (`pass`, `actual`, `expected`, `score`) provides richer evaluation data than the current `{ passed, output }`.

---

## 🎯 Specific Recommendations

### 1. Resolve Architectural Conflict (BLOCKER #1)

**Before proceeding with this proposal, get explicit user decision:**

- [ ] Does the user want to proceed with the **remediation plan's 3-actor orchestrator architecture**?
- [ ] OR does the user want to **override the remediation plan** and implement this two-agent proposal?

These are **mutually exclusive**. Do not proceed without resolution.

---

### 2. Fix Field Name (BLOCKER #2)

**Change:**
```js
// In all judge response schemas and aggregation code
{ pass: true, ... }      // ❌ Proposed (grammatically awkward)
```

**To:**
```js
{ passed: true, ... }    // ✅ Current (grammatically correct)
```

**Files to update:**
- `plan/ai-testing-framework/two-agent-architecture.md:342` (aggregation example)
- `plan/ai-testing-framework/two-agent-architecture.md:376-390` (judge response schema)

---

### 3. Add Complete runAITests Implementation (HIGH #1)

**Currently:** Section 4 shows pseudocode (lines 257-314)

**Needed:** Complete refactored implementation with:
- Actual destructuring from new `extractTests` shape
- Actual `buildResultPrompt` / `buildJudgePrompt` calls
- Actual error handling

**Add to:** Section 4 (runAITests — Two-Agent Flow)

---

### 4. Clarify Agent Call Count Math (HIGH #2)

**Add section:** "10.1 Optimization Opportunities"

**Content:**
- Explain extraction is fixed overhead (1 call per test file)
- Show batched result generation optimization (1 result call for ALL assertions)
- Compare: sequential (current proposal) vs batched (optimized)

**Files to update:**
- `plan/ai-testing-framework/two-agent-architecture.md:645-697`

---

### 5. Improve normalizeJudgment Error Handling (HIGH #3)

**Add:**
- Throw error for completely invalid responses (non-object)
- Log warnings when normalization applies defaults
- Preserve raw response in error metadata

**Files to update:**
- `plan/ai-testing-framework/two-agent-architecture.md:589-599`

---

### 6. Add Integration Test Migration Plan (HIGH #4)

**Add new section:** "11.5 Integration Test Migration Plan"

**Content:**
- List integration tests that break (file:line references)
- Show before/after for key test cases
- Update mock agent schemas (especially `createDualMockArgs`)

**Add after:** Section 11 (Test Impact)

---

### 7. Fix Concurrency Model (HIGH #5)

**Change:**
```js
// Within a run: serialize with limitConcurrency
const judgments = await limitConcurrency(judgeTasks, concurrency);  // ❌
```

**To:**
```js
// Within a run: all parallel with Promise.all
const judgments = await Promise.all(                               // ✅
  assertions.map(assertion => executeAgent({ prompt: buildJudgePrompt({ result, ... }) }))
);
```

**And:**
```js
// Across runs: serialize with limitConcurrency
const allJudgments = await limitConcurrency(runTasks, concurrency);  // ✅
```

**Files to update:**
- `plan/ai-testing-framework/two-agent-architecture.md:289-302`

---

### 8. Remove Redundant Parameter (MEDIUM #1)

**Either:**
- Remove `requirement` parameter from `buildJudgePrompt` signature (if not used)
- **OR** use it in the template for more focused evaluation

**Files to update:**
- `plan/ai-testing-framework/two-agent-architecture.md:132-187`

---

### 9. Add Complete formatTAP Implementation (MEDIUM #2)

**Show actual code** for displaying:
- `# avg score: X.XX`
- `# actual: ...`
- `# expected: ...`

**Files to update:**
- `plan/ai-testing-framework/two-agent-architecture.md` (add to Section 3.3 or create new section)

---

### 10. Improve Import Error Handling (MEDIUM #3)

**Remove:**
```js
await access(resolvedPath);  // ❌ Race condition, doesn't preserve error
```

**Use:**
```js
try {
  const content = await readFile(resolvedPath, 'utf-8');
  return content;
} catch (originalError) {
  throw createError({ ..., cause: originalError });  // ✅ Preserves ENOENT
}
```

**Files to update:**
- `plan/ai-testing-framework/two-agent-architecture.md:547-566`

---

## 🔍 Risk Assessment

### Overall Risk: **HIGH**

**Primary Risks:**

1. **Architectural conflict risk** — Implementing this proposal may waste work if user later approves remediation plan (which removes the extraction pipeline entirely). **Mitigation:** Get explicit user decision before proceeding.

2. **Breaking change risk** — Field name change (`passed` → `pass`) breaks all tests. **Mitigation:** Keep current field name (`passed`).

3. **Performance risk** — Concurrency model is suboptimal (serializes within-run judge calls). **Mitigation:** Use `Promise.all` for within-run parallelism.

4. **Integration test risk** — Many integration tests will break but proposal doesn't show how to fix them. **Mitigation:** Add complete integration test migration plan.

5. **Silent failure risk** — `normalizeJudgment` masks judge errors instead of failing loudly. **Mitigation:** Add logging and throw on unusable responses.

### Risk Matrix

| Risk | Probability | Impact | Severity |
|------|------------|--------|----------|
| Architectural conflict (BLOCKER #1) | **HIGH** | **CRITICAL** | 🔴 **CRITICAL** |
| Breaking changes (BLOCKER #2) | **MEDIUM** | **HIGH** | 🟠 **HIGH** |
| Test breakage (HIGH #1, #4) | **HIGH** | **HIGH** | 🟠 **HIGH** |
| Performance issues (HIGH #5) | **LOW** | **MEDIUM** | 🟡 **MEDIUM** |
| Silent failures (HIGH #3) | **MEDIUM** | **MEDIUM** | 🟡 **MEDIUM** |

---

## 📋 Checklist Review Results

| # | Checklist Item | Result | Notes |
|---|---------------|--------|-------|
| 1 | **Feasibility** | ⚠️ **BLOCKED** | Conflicts with remediation plan's 3-actor architecture |
| 2 | **Test Impact** | ⚠️ **INCOMPLETE** | Unit tests covered, integration tests missing |
| 3 | **Backwards Compatibility** | ✅ **PASS** | CLI interface unchanged, `.sudo` files work |
| 4 | **Edge Cases** | ✅ **GOOD** | Section 8 covers missing files, invalid responses, timeouts |
| 5 | **Code Style Compliance** | ✅ **PASS** | FP, composition, KISS principles followed |
| 6 | **Error Handling** | ⚠️ **NEEDS WORK** | Missing error preservation, silent failures |
| 7 | **TDD Compliance** | ✅ **PASS** | Section 13 follows TDD order correctly |
| 8 | **Concurrency** | ❌ **INCORRECT** | Within-run judge calls should be parallel, not serialized |
| 9 | **Performance** | ⚠️ **SUBOPTIMAL** | +4 calls per file, but batching could reduce to +1 |
| 10 | **Integration with Tasks 2-7** | ⚠️ **CONFLICT** | Conflicts with Task 1 (architecture refactor) |

---

## 📝 Conclusion

This two-agent architecture proposal is **well-researched, well-documented, and technically sound** in isolation. However, it has **two critical blocking issues**:

1. **Architectural conflict** with the PR #394 remediation plan, which requires removing the extraction pipeline that this proposal refines.
2. **Unnecessary breaking change** (field name `passed` → `pass`) with no clear benefit.

**Recommendation:**

❌ **DO NOT PROCEED** with this proposal until the user makes an explicit decision:

- **Option A:** Implement remediation plan's 3-actor orchestrator architecture (invalidates this proposal)
- **Option B:** Override remediation plan and implement this two-agent proposal (requires updating remediation plan)

If Option B is chosen, this proposal needs:
- Field name kept as `passed` (not changed to `pass`)
- Complete `runAITests` implementation (not pseudocode)
- Integration test migration plan
- Concurrency model fix (parallel within-run judge calls)
- Error handling improvements (`normalizeJudgment`, import errors)

**Estimated effort to address all issues:** 2-3 days

**Confidence in review:** High (based on thorough codebase analysis and requirements comparison)

---

**Reviewer:** code-reviewer agent
**Review completed:** 2026-02-10
**Files reviewed:** 15+ (implementation files, tests, rules, context docs)
