# Two-Agent Architecture: Result Agent + Judge Agent

> **Date:** 2026-02-10
> **Status:** APPROVED — updated post-remediation 2026-02-11
> **Scope:** Minimal refactor of existing extraction pipeline
> **Constraint:** NOT the heavy 3-actor orchestrator rewrite from remediation Task 1
> **Decision:** User explicitly chose this two-agent approach over the 3-actor orchestrator (BLOCKER #1 from review — RESOLVED)

---

## 1. Architecture Overview

Convert from the current **single-agent self-evaluating pattern** (one agent generates output AND evaluates itself) to a **two-agent pattern** (result agent generates, judge agent evaluates).

### Current Pattern (Single Agent)

```
For each assertion × each run:
  Agent receives: userPrompt + requirement + promptUnderTest
  Agent does: Generate output AND evaluate itself
  Agent returns: { passed, output, reasoning? }
```

### New Pattern (Two Agents)

```
For each run:
  1. Result Agent receives: userPrompt + promptUnderTest
     Result Agent does: Generate output ONLY
     Result Agent returns: plain text (raw response — NOT wrapped in JSON)

  2. For each assertion (all judges in a run execute in parallel via Promise.all):
     Judge Agent receives: userPrompt + promptUnderTest + result + ONE requirement
     Judge Agent does: Evaluate result against requirement
     Judge Agent returns: TAP YAML block: { passed, actual, expected, score }
```

### Why Two Agents?

1. **Result consistency** — Same result evaluated by ALL judges in a run (no regeneration variance)
2. **Separation of concerns** — Generation is separate from evaluation
3. **Matches Eric's requirements** — PR comment specifies `getResult()` + `judge()` pattern
4. **Score granularity** — Judge returns `score: 0..100` for nuanced quality assessment

---

## 2. Function Changes by File

### `source/test-extractor.js`

| Function | File | Status | Change |
|----------|------|--------|--------|
| `buildExtractionPrompt()` | source/test-extractor.js | **MODIFIED** | Updated to instruct agent to also extract import file paths |
| `buildEvaluationPrompt()` | | **REMOVED** | Replaced by `buildResultPrompt` + `buildJudgePrompt` |
| `extractTests()` | source/test-extractor.js | **MODIFIED** | Uses agent-returned import paths; returns new shape |
| `buildResultPrompt()` | source/test-extractor.js | **NEW** | Prompt for the result agent (plain text response, NO JSON) |
| `buildJudgePrompt()` | source/test-extractor.js | **NEW** | Prompt for the judge agent (TAP YAML response) |
| `parseExtractionResult()` | source/extraction-parser.js | **MODIFIED** | Validates new shape (includes `importPaths`) |
| `resolveImportPaths()` | source/extraction-parser.js | **MODIFIED** | Import path resolution relaxed (no `validateFilePath` on imports) |
| `extractJSONFromMarkdown()` | source/extraction-parser.js | **Survives unchanged** | Used by `parseExtractionResult` |
| `tryParseJSON()` | source/extraction-parser.js | **Survives unchanged** | Used by `parseExtractionResult` |
| `parseTAPYAML()` | source/tap-yaml.js | **NEW** | Parses judge's TAP YAML output (--- delimited) |
| `parseImports()` | | **REMOVED** | Agent-directed imports: extraction agent identifies import paths declaratively |

### `source/ai-runner.js`

| Function | File | Status | Change |
|----------|------|--------|--------|
| `executeAgent()` | source/ai-runner.js | **MODIFIED** | Must handle non-JSON output for result agent (returns raw string) |
| `runAITests()` | source/ai-runner.js | **MODIFIED** | New two-agent flow: result once per run, judge per assertion; `Promise.all` within runs, `limitConcurrency` across runs |
| `readTestFile()` | source/ai-runner.js | **Survives unchanged** | File reading |
| `parseStringResult()` | source/agent-parser.js | **Survives (extraction agent only)** | Only used by extraction agent call (Phase 1); result and judge agents use `rawOutput: true` bypassing JSON parsing |
| `parseOpenCodeNDJSON()` | source/agent-parser.js | **Survives unchanged** | OpenCode wire protocol |
| `unwrapAgentResult()` | source/agent-parser.js | **Survives unchanged** | Unwraps agent response envelope |
| `normalizeJudgment()` | source/aggregation.js | **NEW** | Normalize judge response; logs warnings, throws on non-object |
| `aggregatePerAssertionResults()` | source/aggregation.js | **MODIFIED** | Keeps `r.passed` field, adds `averageScore` |
| `calculateRequiredPasses()` | source/aggregation.js | **Survives unchanged** | Threshold math |
| `limitConcurrency()` | source/limit-concurrency.js | **Survives unchanged** | Limits parallel execution across runs |
| `validateFilePath()` | source/validation.js | **Survives unchanged** | Security validation for CLI paths |
| `verifyAgentAuthentication()` | source/validation.js | **MODIFIED** | Always includes auth guidance on any failure (no more string matching) |
| All error types | source/ai-errors.js | **Centralized** | Single source of truth for all error definitions (ParseError, ValidationError, SecurityError, etc.) |

### `bin/riteway.js`

| Function | File | Status | Change |
|----------|------|--------|--------|
| CLI entry point | bin/riteway.js | **Survives unchanged** | CLI wiring layer |
| `parseAIArgs()` | source/ai-command.js | **Survives unchanged** | CLI argument parsing |
| `runAICommand()` | source/ai-command.js | **Survives unchanged** | CLI command handler |
| `formatAssertionReport()` | source/ai-command.js | **Survives unchanged** | Assertion result formatting |
| `getAgentConfig()` | source/agent-config.js | **Survives unchanged** | Agent config factory |
| `loadAgentConfig()` | source/agent-config.js | **Survives unchanged** | Load and validate agent config files |
| `formatZodError()` | source/agent-config.js | **Survives unchanged** | User-friendly Zod error formatting |

### `source/test-output.js`

| Function | File | Status | Change |
|----------|------|--------|--------|
| `formatTAP()` | source/test-output.js | **MODIFIED** | Refactored from string concatenation to array-join pattern; displays `averageScore` and `actual`/`expected` in TAP diagnostics |
| `recordTestOutput()` | source/test-output.js | **Survives unchanged** | File output |
| `generateLogFilePath()` | source/test-output.js | **Survives unchanged** | Generate timestamped log file paths |

---

## 3. New Functions

### `buildResultPrompt({ userPrompt, promptUnderTest })`

**Location:** `source/test-extractor.js`

**Purpose:** Build a prompt that instructs an agent to execute the user prompt and return only the raw output — no evaluation, no judgment. The agent responds naturally in plain text.

**Signature:**
```js
export const buildResultPrompt = ({ userPrompt, promptUnderTest }) => string
```

**Behavior:**
- Injects `promptUnderTest` as context/instructions (**required** — `extractTests` validates this before reaching here)
- Includes the `userPrompt` to execute (**required** — `extractTests` validates this before reaching here)
- Instructs the agent to respond naturally — NO JSON wrapping
- The entire stdout IS the result (plain text)
- Does NOT ask the agent to evaluate or judge anything

**Template:**
```
You are an AI assistant. Execute the following prompt and return your response.

CONTEXT (Prompt Under Test):
{promptUnderTest}

USER PROMPT:
{userPrompt}

INSTRUCTIONS:
1. Execute the user prompt above, following the guidance in the prompt under test
2. Return your complete response as plain text

Respond naturally. Do NOT wrap your response in JSON, markdown fences, or any other structure.
Your entire output IS the result.
```

**Rationale:** The result agent is a pure executor. It follows the prompt under test and user prompt, then returns whatever it generates. Returning plain text (not JSON) means the agent can respond naturally without JSON escaping constraints. The entire stdout is captured as the result — no parsing needed.

---

### `buildJudgePrompt({ userPrompt, promptUnderTest, result, requirement })`

**Location:** `source/test-extractor.js`

**Purpose:** Build a prompt that instructs a judge agent to evaluate a specific result against a single requirement. Returns TAP YAML diagnostic format.

**Signature:**
```js
export const buildJudgePrompt = ({ userPrompt, promptUnderTest, result, requirement }) => string
```

**Parameters:**
- `userPrompt` — The original user prompt that produced the result
- `promptUnderTest` — The imported prompt content (context/guide)
- `result` — The raw output from the result agent (plain text)
- `requirement` — The "Given X, should Y" assertion text (merged description + requirement into single field post-remediation)

**Behavior:**
- Presents the result agent's output for evaluation
- States ONE requirement to evaluate against
- Requests structured judgment as TAP YAML: `{ passed, actual, expected, score }`
- Judge sees the full context (promptUnderTest, userPrompt) to understand intent

**Template:**
```
You are an AI judge. Evaluate whether a given result satisfies a specific requirement.

CONTEXT (Prompt Under Test):
{promptUnderTest}

ORIGINAL USER PROMPT:
{userPrompt}

ACTUAL RESULT TO EVALUATE:
{result}

REQUIREMENT:
{requirement}

INSTRUCTIONS:
1. Read the actual result above
2. Determine whether it satisfies the requirement
3. Summarize what was actually produced (actual) vs what was expected (expected)
4. Assign a quality score from 0 (completely fails) to 100 (perfectly satisfies)

Return your judgment as a TAP YAML diagnostic block:
---
passed: true
actual: "summary of what was produced"
expected: "what was expected"
score: 85
---

CRITICAL: Return ONLY the TAP YAML block. Start with --- on its own line,
end with --- on its own line. No markdown fences, no explanation outside the block.
```

**Constraint:** Each judge call sees exactly ONE requirement. This prevents shared context/attention muddying between assertions (per Eric's constraint).

---

### `parseTAPYAML(output)`

**Location:** `source/tap-yaml.js`

**Purpose:** Parse the judge agent's TAP YAML diagnostic output into a structured object.

**Signature:**
```js
export const parseTAPYAML = (output) => { passed, actual, expected, score }
```

**Behavior:**
- Splits on `---` markers to extract the YAML block
- Parses simple key-value YAML (no nested structures needed)
- Returns `{ passed: boolean, actual: string, expected: string, score: number }`
- Throws `ParseError` if no valid TAP YAML block found

**Implementation:**
```js
export const parseTAPYAML = (output) => {
  const match = output.match(/^---\s*\n([\s\S]*?)\n---\s*$/m);
  if (!match) {
    throw createError({
      name: 'ParseError',
      message: 'Judge output does not contain a valid TAP YAML block (--- delimited)',
      code: 'JUDGE_INVALID_TAP_YAML',
      rawOutput: output
    });
  }

  const yaml = match[1];
  const lines = yaml.split('\n');
  const result = {};

  for (const line of lines) {
    const kvMatch = line.match(/^(\w+):\s*(.+)$/);
    if (kvMatch) {
      const [, key, rawValue] = kvMatch;
      // Strip surrounding quotes if present
      const value = rawValue.replace(/^["']|["']$/g, '').trim();
      if (key === 'passed') result.passed = value === 'true';
      else if (key === 'score') result.score = Number(value);
      else result[key] = value;
    }
  }

  return result;
};
```

**Benefits over JSON parsing:**
- No multi-strategy parsing needed (`parseStringResult` complexity eliminated for judge)
- TAP YAML is a stable, well-defined format (TAP v13 spec)
- Trivially parseable: split on `---` markers, parse simple key-value pairs
- Aligns with the TAP diagnostic output format the framework already produces

---

## 4. Modified Functions

### `extractTests()` — New Return Shape (with Agent-Directed Imports)

**Current return shape:**
```js
// Array of per-assertion objects with evaluation prompts
[
  { id: 1, description, userPrompt, requirement, prompt: "<evaluation prompt>" },
  { id: 2, description, userPrompt, requirement, prompt: "<evaluation prompt>" },
]
```

**New extraction result shape (from Phase 1 agent):**
```js
{
  userPrompt: string,
  importPaths: string[],  // Agent-identified file paths (replaces parseImports regex)
  assertions: [
    { id: 1, description, requirement },
    { id: 2, description, requirement },
  ]
}
```

**New `extractTests()` return shape:**
```js
{
  userPrompt: string,         // Required — shared user prompt (inline or imported; validated non-empty)
  promptUnderTest: string,    // Required — content read from agent-identified import paths (validated non-empty)
  assertions: [               // Required — at least one assertion (validated non-empty)
    { id: 1, description, requirement },
    { id: 2, description, requirement },
  ]
}
```

**What changes in the function:**
- Phase 1 (extraction agent call) — **MODIFIED**: Agent now also identifies import paths declaratively
- Phase 1.5 (import resolution) — **MODIFIED**: Uses agent-returned `importPaths` instead of `parseImports()` regex
- Phase 2 — Instead of mapping through `buildEvaluationPrompt`, return structured data

**Agent-directed imports flow:**

```
Current flow (imperative):
  1. CLI reads test file
  2. parseImports() regex extracts import paths  ← REMOVED
  3. CLI reads imported files
  4. Content becomes promptUnderTest

New flow (agent-directed):
  1. CLI reads test file
  2. Extraction agent (Phase 1) analyzes test file and returns:
     - assertions (as before)
     - importPaths: ["ai/rules/ui.mdc", ...] ← AGENT identifies these
     - userPrompt (may also be imported)
  3. CLI reads the identified files (wrapping readFile with createError({cause}))
  4. Content becomes promptUnderTest / userPrompt as appropriate
```

```js
// Phase 1: Extraction agent identifies assertions AND import paths
const extracted = await executeExtractionAgent(testContent, agentConfig, timeout, debug);
// extracted = { userPrompt, importPaths, assertions }

// Phase 1.5: Read agent-identified import files
let promptUnderTest = '';
for (const importPath of extracted.importPaths) {
  const resolvedPath = resolve(projectRoot, importPath);
  try {
    const content = await readFile(resolvedPath, 'utf-8');
    promptUnderTest += content;
  } catch (originalError) {
    throw createError({
      name: 'ValidationError',
      message: `Failed to read imported prompt file: ${importPath}`,
      code: 'PROMPT_READ_FAILED',
      path: importPath,
      resolvedPath,
      cause: originalError  // Preserves original ENOENT or EACCES
    });
  }
}

// Validate required fields (fail fast on authoring errors)
const userPrompt = extracted.userPrompt;
if (!userPrompt || userPrompt.trim() === '') {
  throw createError({
    name: 'ValidationError',
    message: 'Test file does not define a userPrompt. Every test file must include a user prompt (inline or imported).',
    code: 'MISSING_USER_PROMPT',
    testFile
  });
}
if (!promptUnderTest || promptUnderTest.trim() === '') {
  throw createError({
    name: 'ValidationError',
    message: 'Test file does not declare a promptUnderTest import. Every test file must import the prompt under test.',
    code: 'MISSING_PROMPT_UNDER_TEST',
    testFile
  });
}
if (!extracted.assertions || extracted.assertions.length === 0) {
  throw createError({
    name: 'ValidationError',
    message: 'Test file does not contain any assertions. Every test file must include at least one assertion (e.g., "Given X, should Y").',
    code: 'NO_ASSERTIONS_FOUND',
    testFile
  });
}

// Phase 2: Return validated structured data for two-agent execution
return {
  userPrompt,
  promptUnderTest,
  assertions: extracted.assertions.map(({ id, description, requirement }) => ({
    id,
    description,
    requirement
  }))
};
```

**Note:** `userPrompt` comes from the extraction agent. All assertions in a single test file share the same user prompt. The agent figures out what needs importing — the CLI just reads the files.

**Import error handling:** Wraps `readFile` with `createError({cause})` instead of pre-checking with `access()`. This avoids the `access()` race condition, preserves the original error (ENOENT vs EACCES), and follows error-causes.md.

---

### `runAITests()` — Two-Agent Flow

**Current flow:**
```
readFile → extractTests → [assertion × runs] → executeAgent(evaluationPrompt) → aggregate
```

**New flow:**
```
readFile → extractTests → { userPrompt, promptUnderTest, assertions }
  for each run (limitConcurrency across runs):
    1. result = executeAgent(buildResultPrompt)           // ONE call, returns plain text
    2. judgments = Promise.all(                            // N calls, ALL PARALLEL within run
         assertions.map(a => executeAgent(buildJudgePrompt))
       )
    3. parseTAPYAML each judgment
  aggregate with score averaging
```

**Concurrency model:**
- **Within a run:** All judge calls execute in parallel via `Promise.all` (they share the same result and are completely independent)
- **Across runs:** `limitConcurrency` controls how many runs execute simultaneously (prevents overwhelming the agent API)

**Key implementation details:**

```js
export const runAITests = async ({
  filePath, runs = 4, threshold = 75, timeout = 300000,
  concurrency = 4, debug = false, logFile,
  agentConfig = { command: 'claude', args: [...] }
}) => {
  const logger = createDebugLogger({ debug, logFile });
  const testContent = await readTestFile(filePath);

  // Phase 1+2: Extract structured test data (agent-directed imports)
  const { userPrompt, promptUnderTest, assertions } =
    await extractTests({ testContent, testFilePath: filePath, agentConfig, timeout, debug });

  logger.log(`Extracted ${assertions.length} assertions`);

  // Build result prompt (same for all runs — userPrompt + promptUnderTest don't change)
  const resultPrompt = buildResultPrompt({ userPrompt, promptUnderTest });

  // Build run tasks — limitConcurrency ACROSS runs only
  const runTasks = Array.from({ length: runs }, (_, runIndex) => async () => {
    logger.log(`\nRun ${runIndex + 1}/${runs}: Calling result agent...`);

    // Step 1: Call result agent ONCE per run — returns plain text (no JSON parsing needed)
    const result = await executeAgent({
      agentConfig, prompt: resultPrompt, timeout, debug, logFile,
      rawOutput: true  // Signal to executeAgent: don't try to parse as JSON
    });

    logger.log(`Result obtained (${result.length} chars). Judging ${assertions.length} assertions...`);

    // Step 2: Call judge agent for EACH assertion — ALL PARALLEL within a run
    // Judge calls within a run share the same result and are completely independent.
    const judgments = await Promise.all(
      assertions.map(async (assertion, assertionIndex) => {
        const judgePrompt = buildJudgePrompt({
          userPrompt, promptUnderTest, result,
          requirement: assertion.requirement,
          description: assertion.description
        });

        logger.log(`  Assertion ${assertionIndex + 1}/${assertions.length}: ${assertion.description}`);
        const judgeOutput = await executeAgent({
          agentConfig, prompt: judgePrompt, timeout, debug, logFile,
          rawOutput: true  // Judge returns TAP YAML, not JSON
        });

        // Parse TAP YAML and normalize
        const parsed = parseTAPYAML(judgeOutput);
        return normalizeJudgment(parsed, { description: assertion.description, runIndex, logger });
      })
    );

    return judgments;
  });

  // Limit concurrency ACROSS runs, not within runs
  const allRunJudgments = await limitConcurrency(runTasks, concurrency);

  // Group by assertion across all runs
  const perAssertionResults = assertions.map(({ description }, assertionIndex) => ({
    description,
    runResults: allRunJudgments.map(runJudgments => runJudgments[assertionIndex])
  }));

  logger.flush();
  return aggregatePerAssertionResults({ perAssertionResults, threshold, runs });
};
```

**Result agent output:** The result agent returns plain text — its entire stdout IS the result. No `extractResultOutput` helper needed because the agent is instructed to respond naturally (not wrap in JSON). The `rawOutput: true` flag tells `executeAgent` to return the raw string without attempting JSON parsing.

**Judge agent output:** The judge returns a TAP YAML block (`---` delimited). `parseTAPYAML()` extracts the structured data, then `normalizeJudgment()` applies safe defaults and logging.

**Note:** The `limitConcurrency` helper (already exists in current `runAITests`) is extracted to module scope so it can be reused.

---

### `aggregatePerAssertionResults()` — Score Averaging

**Current:**
```js
const passCount = runResults.filter(r => r.passed).length;
return { description, passed, passCount, totalRuns, runResults };
```

**New:**
```js
const passCount = runResults.filter(r => r.passed).length;
const averageScore = runResults.length > 0
  ? runResults.reduce((sum, r) => sum + (r.score ?? 0), 0) / runResults.length
  : 0;

return {
  description,
  passed: passCount >= requiredPasses,
  passCount,
  totalRuns: runs,
  averageScore: Math.round(averageScore * 100) / 100,
  runResults
};
```

**No breaking change:** Field name stays `r.passed` (not changed to `r.pass`). The judge response schema uses `passed: true|false` to match the existing field name, avoiding a needless breaking change.

---

## 5. Response Schema

### Result Agent Response

The result agent returns **plain text** — its entire stdout IS the result. No JSON wrapping.

```
<the agent's actual response text>
```

Example:
```
The color scheme uses green (#00FF00) for pass indicators, red (#FF0000) for fail indicators,
and yellow (#FFD700) for pending/in-progress states. The background uses a dark slate (#1E293B)
for reduced eye strain during extended terminal sessions.
```

The output is the raw text the agent generated when following the prompt under test and user prompt. This could be a color scheme design, code, prose, etc. No parsing is needed — the string is passed directly to the judge.

### Judge Agent Response (TAP YAML)

The judge agent returns a **TAP YAML diagnostic block** (--- delimited), not JSON:

```yaml
---
passed: true
actual: "The color scheme uses green (#00FF00) for pass and red (#FF0000) for fail indicators"
expected: "Semantic colors where green indicates pass and red indicates fail"
score: 85
---
```

| Field | Type | Description |
|-------|------|-------------|
| `passed` | `boolean` | Whether the result satisfies the requirement |
| `actual` | `string` | Summary of what the result actually produced (judge's interpretation) |
| `expected` | `string` | Summary of what was expected based on the requirement |
| `score` | `number` (0-100) | Quality score: 0 = complete failure, 100 = perfect satisfaction |

**Why TAP YAML instead of JSON:**
- No multi-strategy JSON parsing needed (`parseStringResult` complexity eliminated for judge output)
- TAP YAML is a stable, well-defined format (TAP v13 diagnostic spec)
- Trivially parseable: split on `---` markers, parse simple key-value YAML
- Result agent can respond naturally without JSON escaping constraints
- Aligns with the TAP diagnostic format the framework already produces

### Mapping to TAP Output

The judge's TAP YAML fields map directly to the framework's TAP diagnostic output:

```
ok 1 - Given the color scheme, should use semantic colors
  # pass rate: 3/4
  # avg score: 82.50
  # actual: Uses green for pass, red for fail, yellow for pending
  # expected: Semantic colors mapping status to intuitive colors
```

```
not ok 2 - Given the design, should be accessible to colorblind users
  # pass rate: 1/4
  # avg score: 35.00
  # actual: Uses only red/green distinction without alternative indicators
  # expected: Colorblind-safe design with patterns, shapes, or high-contrast alternatives
```

The `actual` and `expected` in TAP come from the **last run** (or could use the highest-scoring run). This is a display choice — all run data is preserved in `runResults`.

---

## 6. Flow Diagram

### Two-Agent Pipeline (Post-Remediation)

```
CLI (bin/riteway.js → ai-command.js)
 │
 ├─ validateFilePath (validation.js) ──────────── security check
 ├─ verifyAgentAuthentication (validation.js) ─── agent smoke test
 │
 ├─ readTestFile (ai-runner.js) ───────────────── file content
 │
 ├─ extractTests (test-extractor.js)
 │    ├─ buildExtractionPrompt ──────── agent ──► { userPrompt, importPaths, assertions }
 │    ├─ parseExtractionResult (extraction-parser.js)
 │    ├─ resolveImportPaths (extraction-parser.js) ► promptUnderTest
 │    └─ validate required fields ─────────────── fail fast on authoring errors
 │
 ├─ buildResultPrompt (test-extractor.js)
 │
 ├─ For each run — limitConcurrency (limit-concurrency.js):
 │    │
 │    ├─ STEP 1: executeAgent(resultPrompt) ───► plain text result      (1 call)
 │    │           (ai-runner.js)
 │    │
 │    └─ STEP 2: Promise.all per assertion:
 │         ├─ buildJudgePrompt (test-extractor.js)
 │         ├─ executeAgent(judgePrompt) ───────► TAP YAML               (N calls)
 │         │   (ai-runner.js)
 │         ├─ parseTAPYAML (tap-yaml.js)
 │         └─ normalizeJudgment (aggregation.js)
 │
 ├─ aggregatePerAssertionResults (aggregation.js) ► { passed, assertions, averageScore }
 │
 └─ formatTAP + recordTestOutput (test-output.js) ► .tap.md file
```

**Call count**: 1 extraction + runs × (1 result + N judge) = 1 + runs × (1 + N)
**Default (4 assertions, 4 runs)**: 1 + 4 × 5 = 21 calls

---

## 7. Media Embed Support

Media references in test files are handled through the existing import pipeline:

```sudolang
import 'ai/rules/ui.mdc'

userPrompt = """
Design a user-friendly color scheme for a terminal test output interface.
"""

- Given the color scheme, should include high contrast colors
```

**Import syntax:** Per reviewer feedback, the import syntax is `import 'path'` (not `import @promptUnderTest from 'path'`). The extraction agent identifies the import path declaratively — the `@promptUnderTest` binding name is unnecessary since the CLI resolves the file and injects the content as `promptUnderTest` automatically.

> **Future enhancement:** Consider `import 'ai/rules/ui.mdc' as promptUnderTest` syntax to allow named imports, enabling multiple distinct imports (e.g., separate `promptUnderTest` and `userPrompt` imports) with explicit binding.

### How agents handle media references

1. **Import resolution** (agent-directed): The extraction agent identifies import paths declaratively in its response. The CLI reads the files and content becomes `promptUnderTest`.

2. **Result agent**: Receives `promptUnderTest` (which may reference images, videos, game sessions, etc.) as context. The agent follows these instructions when generating output. The result agent doesn't need to "see" media files — it follows the imported prompt's instructions about how to handle media-related requirements.

3. **Judge agent**: Receives the same `promptUnderTest` context plus the result. Can evaluate whether the result appropriately addressed media-related concerns described in the prompt under test.

### Media in TAP output

The existing `formatTAP` function already supports media embeds in TAP output:

```js
if (assertion.media && assertion.media.length > 0) {
  assertion.media.forEach(({ path, caption }) => {
    tap += `  # ![${escapedCaption}](${escapedPath})\n`;
  });
}
```

The judge could return media references if the result includes visual artifacts. This is a future enhancement — the current architecture supports it via the `runResults` data structure.

---

## 8. Error Handling

### Missing promptUnderTest Declaration

**Current:** When a test file does not declare a `promptUnderTest` import, the framework silently proceeds "without context" — the prompt is sent to the agent without any guiding rules/instructions. This is almost always a test authoring error.

**New:** After extraction, validate that `promptUnderTest` is non-empty. If the extraction agent did not identify any `promptUnderTest` import, throw immediately:

```js
// In extractTests, after Phase 1.5 (import resolution):
if (!promptUnderTest || promptUnderTest.trim() === '') {
  throw createError({
    name: 'ValidationError',
    message: 'Test file does not declare a promptUnderTest import. Every test file must import the prompt under test.',
    code: 'MISSING_PROMPT_UNDER_TEST',
    testFile
  });
}
```

**Rationale:** Per reviewer feedback — silently running without context produces meaningless results and masks authoring errors. Failing fast with a clear error message is the correct behavior.

### Missing userPrompt

**Current:** `userPrompt` is listed in `requiredFields` for `parseExtractionResult`, so the extraction agent must return it. But the error is generic and not a structured `ValidationError`.

**New:** After extraction, validate that `userPrompt` is non-empty. Per Eric's spec, `userPrompt` is always present (it may be inline rather than imported, but must exist):

```js
// In extractTests, after extraction:
if (!userPrompt || userPrompt.trim() === '') {
  throw createError({
    name: 'ValidationError',
    message: 'Test file does not define a userPrompt. Every test file must include a user prompt (inline or imported).',
    code: 'MISSING_USER_PROMPT',
    testFile
  });
}
```

**Rationale:** Both `getResult({ promptUnderTest, userPrompt })` and `judge({ userPrompt, ... })` require `userPrompt`. Eric's spec says "user prompt may be defined inline" — the import is optional, but the prompt itself is required.

### No Assertions Found

**Current:** If the extraction agent returns an empty assertions array, `runAITests` would silently produce no test output — no pass, no fail, no indication anything was wrong.

**New:** After extraction, validate that at least one assertion was found:

```js
// In extractTests, after extraction:
if (!assertions || assertions.length === 0) {
  throw createError({
    name: 'ValidationError',
    message: 'Test file does not contain any assertions. Every test file must include at least one assertion (e.g., "Given X, should Y").',
    code: 'NO_ASSERTIONS_FOUND',
    testFile
  });
}
```

**Rationale:** A test file with no assertions is a test authoring error. Silently producing zero TAP output is worse than failing fast — the user would see no feedback and might think the test passed.

### Missing promptUnderTest File

**Current:** `readFile` throws `ENOENT` which propagates as an unhandled error.

**New:** Wrap `readFile` with `createError({cause})` instead of pre-checking with `access()`:

```js
// In extractTests, after resolving agent-identified import paths:
const resolvedPath = resolve(projectRoot, importPath);
try {
  const content = await readFile(resolvedPath, 'utf-8');
  return content;
} catch (originalError) {
  throw createError({
    name: 'ValidationError',
    message: `Failed to read imported prompt file: ${importPath}`,
    code: 'PROMPT_READ_FAILED',
    path: importPath,
    resolvedPath,
    cause: originalError  // Preserves original ENOENT or EACCES
  });
}
```

**Why not `access()` pre-check:**
- Node.js docs recommend against `access()` before `open()` (introduces race condition)
- Swallows the original error instead of preserving it as `cause` (violates error-causes.md)
- Cannot distinguish "not found" from "permission denied"
- The `readFile` + `catch` pattern is simpler and provides better diagnostics

### Invalid Result Agent Response

The result agent returns plain text (its entire stdout). Since there is no JSON or structured format to parse, there is no "invalid" response shape — any string is valid. If the result is empty or garbage, the judge will (correctly) fail the assertions.

The `rawOutput: true` flag on the `executeAgent` call ensures the raw string is returned without attempting JSON parsing.

### Invalid Judge Response

If the judge returns TAP YAML with missing or malformed fields, `normalizeJudgment` applies safe defaults and logs warnings. If the response is completely unusable (non-object), it throws:

```js
// Normalize judge response — logs warnings, throws on non-object
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

  // Warn if normalization is applying defaults
  if (raw?.actual === undefined || raw?.expected === undefined) {
    logger.log(`Warning: Judge response missing fields for "${description}" run ${runIndex + 1}`);
  }

  return {
    passed: raw?.passed === true,              // Default to false
    actual: raw?.actual ?? 'No actual provided',
    expected: raw?.expected ?? 'No expected provided',
    score: Number.isFinite(raw?.score) ? Math.max(0, Math.min(100, raw.score)) : 0
  };
};
```

This ensures:
- Non-object responses throw immediately (fail loud, per error-causes.md)
- Missing fields are logged as warnings (observable, per javascript.md "explicit over implicit")
- Aggregation still works with partially malformed output (safe defaults for fields)
- The raw response is preserved in error metadata for debugging

### Timeout Handling

Each agent call (result or judge) uses the same `timeout` parameter passed to `runAITests`. The existing `executeAgent` timeout mechanism handles this. If a result agent times out, that entire run fails. If a judge times out, that specific assertion's run fails.

### Extraction Agent Failure

Unchanged — `parseExtractionResult` validates the extraction output and throws descriptive errors. If the extraction agent fails, no result/judge calls are made.

---

## 9. What Survives vs What Changes

| Component | File | Status | Notes |
|-----------|------|--------|-------|
| `validateFilePath` | source/validation.js | **Survives** | Security validation for CLI paths |
| `parseStringResult` | source/agent-parser.js | **Survives** | Only used by extraction agent call (Phase 1); result agent and judge agent both use `rawOutput: true`. May become dead code if extraction also moves away from JSON in a future iteration. |
| `parseOpenCodeNDJSON` | source/agent-parser.js | **Survives** | OpenCode wire protocol (NOT AI content parsing) |
| `unwrapAgentResult` | source/agent-parser.js | **Survives** | Unwraps agent response envelope |
| `readTestFile` | source/ai-runner.js | **Survives** | File reading utility |
| `calculateRequiredPasses` | source/aggregation.js | **Survives** | Threshold math |
| `executeAgent` | source/ai-runner.js | **Modified** | Added `rawOutput` flag to return raw string (for result agent plain text + judge TAP YAML) |
| `verifyAgentAuthentication` | source/validation.js | **Modified** | Always includes auth guidance on any failure (no more string matching) |
| `createDebugLogger` | source/debug-logger.js | **Survives** | Debug infrastructure |
| `parseImports` | | **Removed** | Replaced by agent-directed imports (extraction agent identifies import paths declaratively) |
| `buildExtractionPrompt` | source/test-extractor.js | **Modified** | Updated to instruct agent to also extract import file paths |
| `parseExtractionResult` | source/extraction-parser.js | **Modified** | Validates new shape (includes `importPaths`) |
| `resolveImportPaths` | source/extraction-parser.js | **Modified** | Import path resolution relaxed (no `validateFilePath` on imports) |
| `extractJSONFromMarkdown` | source/extraction-parser.js | **Survives** | Used by `parseExtractionResult` |
| `tryParseJSON` | source/extraction-parser.js | **Survives** | Used by `parseExtractionResult` |
| `formatTAP` | source/test-output.js | **Modified** | Refactored from string concatenation to array-join pattern; displays score/actual/expected diagnostics |
| `recordTestOutput` | source/test-output.js | **Survives** | File output |
| `generateLogFilePath` | source/test-output.js | **Survives** | Generate timestamped log file paths |
| `getAgentConfig` | source/agent-config.js | **Survives** | Agent config factory |
| `loadAgentConfig` | source/agent-config.js | **Survives** | Load and validate agent config files |
| `formatZodError` | source/agent-config.js | **Survives** | User-friendly Zod error formatting |
| `parseAIArgs` | source/ai-command.js | **Survives** | CLI argument parsing |
| `runAICommand` | source/ai-command.js | **Survives** | CLI entry point |
| `formatAssertionReport` | source/ai-command.js | **Survives** | Assertion result formatting |
| `aggregatePerAssertionResults` | source/aggregation.js | **Modified** | Keeps `r.passed` field + adds `averageScore` |
| `normalizeJudgment` | source/aggregation.js | **New** | Normalize judge response; logs warnings, throws on non-object |
| `runAITests` | source/ai-runner.js | **Modified** | Two-agent flow; `Promise.all` within runs, `limitConcurrency` across runs |
| `extractTests` | source/test-extractor.js | **Modified** | Agent-directed imports + new return shape |
| `limitConcurrency` | source/limit-concurrency.js | **Survives** | Limits parallel execution across runs |
| `buildEvaluationPrompt` | | **Removed** | Replaced by `buildResultPrompt` + `buildJudgePrompt` |
| `buildResultPrompt` | source/test-extractor.js | **New** | Result agent prompt (plain text response) |
| `buildJudgePrompt` | source/test-extractor.js | **New** | Judge agent prompt (TAP YAML response) |
| `parseTAPYAML` | source/tap-yaml.js | **New** | Parses judge's TAP YAML output (--- delimited) |
| All error types | source/ai-errors.js | **Centralized** | Single source of truth for all error definitions (ParseError, ValidationError, SecurityError, etc.) |

**Summary:** 11 functions survive unchanged, 7 modified, 2 removed, 4 added.

---

## 10. Post-Remediation Module Map

After PR #394 remediation, the codebase is organized into focused modules:

### Core Pipeline
| Module | Lines | Responsibility |
|--------|-------|---------------|
| source/ai-runner.js | 292 | executeAgent, runAITests, readTestFile |
| source/test-extractor.js | 286 | extractTests, build*Prompt, extraction pipeline |
| source/test-output.js | 190 | formatTAP, recordTestOutput, generateLogFilePath |

### Extracted Modules
| Module | Lines | Responsibility |
|--------|-------|---------------|
| source/aggregation.js | 107 | normalizeJudgment, calculateRequiredPasses, aggregatePerAssertionResults |
| source/agent-parser.js | 122 | parseStringResult, parseOpenCodeNDJSON, unwrapAgentResult |
| source/extraction-parser.js | 149 | resolveImportPaths, extractJSONFromMarkdown, tryParseJSON, parseExtractionResult |
| source/validation.js | 71 | validateFilePath, verifyAgentAuthentication |
| source/tap-yaml.js | 40 | parseTAPYAML |
| source/limit-concurrency.js | 27 | limitConcurrency |
| source/ai-errors.js | 17 | All error type definitions (single source of truth) |

### CLI Layer
| Module | Lines | Responsibility |
|--------|-------|---------------|
| bin/riteway.js | 186 | CLI entry point wiring |
| source/ai-command.js | 244 | parseAIArgs, runAICommand, formatAssertionReport |
| source/agent-config.js | 105 | getAgentConfig, loadAgentConfig, formatZodError |

**Key changes from remediation:**
- Assertion model simplified: `description` field merged into `requirement` (single field instead of two)
- Import path validation relaxed: `validateFilePath` no longer called on import paths
- Error definitions centralized: All in `source/ai-errors.js` (single source of truth)
- `verifyAgentAuthentication`: Always includes auth guidance on any failure
- `formatTAP`: Refactored from string concatenation to array-join pattern

---

## 11. Agent Call Count

### Formula

```
Total calls per test file = extraction_call + (runs × (1 result_call + N judge_calls))

Where:
  extraction_call = 1 (Phase 1 — unchanged)
  runs = number of sample runs (default: 4)
  N = number of assertions in the test file
```

### Examples

**4 assertions, 4 runs (default):**
```
Extraction:    1 call
Result agent:  4 runs × 1 = 4 calls
Judge agent:   4 runs × 4 assertions = 16 calls
─────────────────────────────────────────────
Total:         1 + 4 + 16 = 21 calls
```

**4 assertions, 4 runs — CURRENT implementation for comparison:**
```
Extraction:    1 call
Eval agent:    4 assertions × 4 runs = 16 calls  (generates + evaluates)
─────────────────────────────────────────────
Total:         1 + 16 = 17 calls
```

**Delta: +4 calls (one extra result agent call per run)**

**3 assertions, 10 runs:**
```
Extraction:    1 call
Result agent:  10 runs × 1 = 10 calls
Judge agent:   10 runs × 3 assertions = 30 calls
─────────────────────────────────────────────
Total:         1 + 10 + 30 = 41 calls
```

**1 assertion, 4 runs:**
```
Extraction:    1 call
Result agent:  4 runs × 1 = 4 calls
Judge agent:   4 runs × 1 assertion = 4 calls
─────────────────────────────────────────────
Total:         1 + 4 + 4 = 9 calls
```

vs current: 1 + 4 = 5 calls. Delta: +4 calls.

### Cost Analysis

The two-agent pattern adds exactly `runs` additional calls (one result agent call per run). The trade-off:

| Metric | Current (single agent) | New (two agents) |
|--------|----------------------|-------------------|
| Calls per run | N (assertions) | 1 + N |
| Total calls | 1 + (N × runs) | 1 + runs + (N × runs) |
| Additional calls | — | +runs |
| Result consistency | Different result per assertion | Same result for all judges |
| Evaluation quality | Self-evaluation bias | Independent judgment |

For the default case (4 assertions, 4 runs): 17 → 21 calls (+24%).

---

## 12. Test Impact

### Tests That Break

**`ai-runner.test.js`:**
- `runAITests()` tests — mock structure changes (need dual mock: result agent returns plain text, judge returns TAP YAML)
- `aggregatePerAssertionResults()` tests — new `averageScore` field (field name `r.passed` stays the same)

**`test-extractor.test.js`:**
- `extractTests()` tests — return shape changes from array to object; agent-directed imports replace `parseImports()`
- Tests referencing `buildEvaluationPrompt` — function removed
- Tests referencing `parseImports` — function removed (agent handles import identification)
- `buildExtractionPrompt` tests — prompt now instructs agent to extract import paths
- `parseExtractionResult` tests — validates new shape (includes `importPaths`)

### Tests That Survive Unchanged

**`ai-runner.test.js`:** `readTestFile`, `parseStringResult`, `parseOpenCodeNDJSON`, `calculateRequiredPasses`, `validateFilePath`, `verifyAgentAuthentication`

**`test-extractor.test.js`:** `extractJSONFromMarkdown`, `tryParseJSON`

### New Tests Needed

1. `buildResultPrompt()` — includes userPrompt, includes promptUnderTest, instructs plain text response (NOT JSON)
2. `buildJudgePrompt()` — includes result, includes ONE requirement, includes context, instructs TAP YAML response
3. `parseTAPYAML()` — parses valid TAP YAML block, throws on missing `---` markers, handles quoted/unquoted values
4. `extractTests()` — returns new shape with `userPrompt`, `promptUnderTest`, `assertions`; uses agent-returned import paths
5. `runAITests()` — result agent called once per run (plain text), judge called per assertion per run (TAP YAML), `Promise.all` within runs, `limitConcurrency` across runs
6. `aggregatePerAssertionResults()` — `r.passed` field (unchanged), `averageScore` calculation
7. `normalizeJudgment()` — defaults missing fields, clamps score, logs warnings, throws on non-object input

---

## 13. Flexible Assertion Format

The extraction prompt (Phase 1, `buildExtractionPrompt`) currently assumes `"Given X, should Y"` format:

```
For each "- Given X, should Y" assertion line in the test file:
```

This should be updated to handle ANY assertion format:

```
For each assertion or requirement in the test file (these may be formatted as
"Given X, should Y", bullet points, YAML entries, natural language sentences,
SudoLang expressions, or any other format):
```

The extraction agent is an LLM — it can infer test structure from any format. The `buildExtractionPrompt` template just needs to avoid over-constraining the expected format.

---

## 14. Implementation Order (TDD)

1. **Add `buildResultPrompt`** — write tests, implement (pure function, no deps; instructs plain text response)
2. **Add `buildJudgePrompt`** — write tests, implement (pure function, no deps; instructs TAP YAML response)
3. **Add `parseTAPYAML`** — write tests, implement (pure function; parses `---` delimited TAP YAML)
4. **Add `normalizeJudgment`** — write tests, implement (logs warnings, throws on non-object)
5. **Modify `aggregatePerAssertionResults`** — update tests for `averageScore` (`r.passed` field name unchanged), implement
6. **Modify `buildExtractionPrompt`** — update to instruct agent to also extract import file paths
7. **Modify `parseExtractionResult`** — update to validate new shape (includes `importPaths`)
8. **Modify `extractTests`** — agent-directed imports (remove `parseImports`), update tests for new return shape, implement
9. **Remove `parseImports`** — delete function + tests (agent handles import identification)
10. **Modify `runAITests`** — update tests with dual mock (plain text result + TAP YAML judge), implement two-agent flow with `Promise.all` within runs, `limitConcurrency` across runs
11. **Remove `buildEvaluationPrompt`** — delete function + tests
12. **Modify `formatTAP`** — add score/actual/expected diagnostics

Steps 1-4 are pure additions with no breaking changes. Steps 5-11 are the breaking refactor. Step 12 is a cosmetic enhancement.

---

## References

- [Eric's PR comment requirements](https://github.com/paralleldrive/riteway/pull/394#pullrequestreview-3764740159) — Two-agent pattern specification
- [Requirements conflict analysis](./requirements-conflict-analysis.md) — Detailed comparison of epic, prompt, and implementation
- [PR #394 remediation plan](../../tasks/archive/2026-01-22-riteway-ai-testing-framework/2026-02-09-pr394-remediation.md) — Full remediation plan (archived — Task 1 superseded by this two-agent approach)
- [vision.md](../../vision.md) — "The standard testing framework for AI Driven Development and software agents"
