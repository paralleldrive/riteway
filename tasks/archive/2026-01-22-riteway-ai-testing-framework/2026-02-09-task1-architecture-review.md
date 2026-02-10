# Task 1: Architecture Refactor — Plan Review

> **Date:** 2026-02-09
> **Status:** PENDING USER APPROVAL
> **Architect plan:** `~/.claude/plans/smooth-brewing-wilkinson.md`
> **Remediation plan reference:** `tasks/2026-02-09-pr394-remediation.md` (Task 1)
> **PR review:** [janhesters review #3764740159](https://github.com/paralleldrive/riteway/pull/394#pullrequestreview-3764740159)

---

## Part 1: Architect's Proposed Implementation

### Overview

Replace the two-phase extraction pipeline with a 3-actor orchestrator-subagent pipeline:

1. **Orchestrator Agent (AI)** — Reads test file, understands structure, resolves imports, identifies assertions
2. **Result Generator (AI)** — Executes the prompt (no evaluation)
3. **Judge Agent (AI, per-assertion)** — Evaluates if result satisfies assertion, returns TAP

### 5 TDD Phases

| Phase | What | New Files | Estimated Scope |
|-------|------|-----------|-----------------|
| 1: TAP Infrastructure | TAP single-assertion parser + aggregator | `source/tap-parser.js` + `.test.js` | ~100 LOC |
| 2: Agent Prompts | Orchestrator, Result Generator, Judge prompt builders | `source/prompts/orchestrator.js` + `.test.js` | ~150 LOC |
| 3: Pipeline | Restructure `executeAgent` + `runAITests` for 5-step flow | `source/result-manager.js` | ~200 LOC |
| 4: Cleanup | Delete extraction pipeline, remove dead code | Delete `test-extractor.js` + `.test.js` | Net negative LOC |
| 5: Failure Fixture | Wrong prompt fixture + failure test | `source/fixtures/wrong-prompt-test.sudo` | ~50 LOC |

### Functions Removed (10)

| Function | File | Reason |
|----------|------|--------|
| `parseStringResult` | ai-runner.js | Multi-strategy AI content parsing — replaced by trivial TAP parsing |
| `buildExtractionPrompt` | test-extractor.js | Phase 1 eliminated — no AI extraction phase |
| `parseExtractionResult` | test-extractor.js | Phase 1 eliminated |
| `extractJSONFromMarkdown` | test-extractor.js | No markdown JSON extraction needed |
| `tryParseJSON` | test-extractor.js | No speculative JSON parsing needed |
| `extractTests` | test-extractor.js | Entire two-phase pipeline replaced by orchestrator agent |
| `buildEvaluationPrompt` | test-extractor.js | Orchestrator agent assembles prompts dynamically |
| `parseImports` | test-extractor.js | Orchestrator agent reads imports dynamically |
| `readTestFile` | ai-runner.js | Orchestrator agent reads files via its own capabilities |
| `validateFilePath` | ai-runner.js | **CONTESTED — see Concern #2 below** |

### Functions Kept (7)

| Function | File | Changes |
|----------|------|---------|
| `executeAgent` | ai-runner.js | Simplified: remove `parseStringResult`, add `expectTAP` param |
| `calculateRequiredPasses` | ai-runner.js | Unchanged |
| `parseOpenCodeNDJSON` | ai-runner.js | **MUST KEEP** — OpenCode wire protocol parsing |
| `verifyAgentAuthentication` | ai-runner.js | Unchanged |
| `createDebugLogger` | debug-logger.js | Unchanged |
| `aggregatePerAssertionResults` | ai-runner.js | Renamed to `aggregateTAPResults`, restructured for TAP |
| `runAITests` | ai-runner.js | Completely restructured for 5-step pipeline |

### Functions Added (7)

| Function | File | Purpose |
|----------|------|---------|
| `parseSingleAssertionTAP` | tap-parser.js | Parse `ok N` / `not ok N` TAP from Judge |
| `aggregateTAPResults` | ai-runner.js | Combine individual TAP results with threshold |
| `buildOrchestratorPrompt` | prompts/orchestrator.js | Instruct AI to read test file, identify components |
| `buildResultGeneratorPrompt` | prompts/orchestrator.js | Instruct AI to execute prompt (no evaluation) |
| `buildJudgePrompt` | prompts/orchestrator.js | Instruct AI to evaluate one assertion, return TAP |
| `createResultDirectory` | result-manager.js | Create temp directory for result files |
| `generateResultFilePath` | result-manager.js | Generate unique result file path |

### Files Deleted (2)

- `source/test-extractor.js` — Entire module replaced by orchestrator agent
- `source/test-extractor.test.js` — Tests for deleted module

### Key Architectural Decisions in the Plan

1. **Orchestrator receives a file PATH** (not content) — relies on AI agent's tool capabilities to read files
2. **Result Generator writes to disk** — writes actual result to a file, Judge reads that file
3. **Judge returns TAP** — `ok N - description` or `not ok N - description\n# reasoning: ...`
4. **`executeAgent` gains `expectTAP` param** — returns raw string for Judge, parses JSON for Orchestrator/Generator
5. **`limitConcurrency` reused** — existing concurrency limiter from ai-runner.js for parallel Judge execution

---

## Part 2: Team Lead Analysis — Concerns

### Concern 1: AI Agent File Access (CRITICAL)

**The problem:** The plan assumes AI agents can read and write files when spawned as CLI subprocesses.

**Current code pattern:**
```javascript
const proc = spawn(command, allArgs);  // e.g., spawn('claude', ['-p', '--output-format', 'json', prompt])
```

**Orchestrator prompt says:**
> "READ THE TEST FILE at the path above using your file-reading capabilities."

**Result Generator prompt says:**
> "Write your response to file: ${resultFilePath}"

**Analysis:**

| Agent | CLI Mode | File Read? | File Write? | Notes |
|-------|----------|-----------|-------------|-------|
| Claude Code | `claude -p` | Likely yes (has tools) | Unreliable | `-p` is pipe mode; tool access may work but is undocumented for this use case |
| OpenCode | `opencode run` | Unknown | Unknown | Agent-specific behavior |
| Cursor | `agent --print` | Unknown | Unknown | Agent-specific behavior |

**Risks:**
- If the orchestrator can't read the test file, the entire pipeline fails silently or returns garbage
- If the Result Generator can't write to disk, the Judge has nothing to evaluate
- This makes the architecture **agent-specific** rather than agent-agnostic (violates epic: "agent-agnostic design")
- No fallback if file operations fail

**Recommendation:** Two alternative approaches to consider:

**Option A: CLI reads files, passes content in prompts (safer, agent-agnostic)**
```
CLI reads test file → passes content to Orchestrator in prompt
Orchestrator returns { promptUnderTest: "...", userPrompt: "...", assertions: [...] }
CLI captures Result Generator stdout as the actual result
CLI passes actual result content inline to Judge prompts
```
- Pro: Works with any agent that can process text prompts
- Pro: Maintains agent-agnostic design from the epic
- Con: Larger prompts (file content embedded)
- Con: For imports, CLI needs to identify import paths (some deterministic parsing)

**Option B: Hybrid — CLI reads test file, orchestrator identifies imports (middle ground)**
```
CLI reads test file → passes content to Orchestrator
Orchestrator returns { importPaths: [...], userPrompt: "...", assertions: [...] }
CLI reads imported files → passes all content to Result Generator
CLI captures Result Generator stdout → passes inline to Judge
```
- Pro: Orchestrator understands the file structure (AI-driven)
- Pro: CLI handles file I/O (reliable, agent-agnostic)
- Con: Two-step for imports (orchestrator identifies, CLI reads)

**Option C: Trust agent file access (current plan)**
- Pro: Cleanest architecture, fully AI-driven
- Pro: Aligns with comment #17's vision ("agent should pull in the prompt file")
- Con: Agent-specific, may not work with all CLI agents
- Con: Unreliable file writes

### Concern 2: `validateFilePath` Still Needed by CLI

**The problem:** The plan lists `validateFilePath` for potential removal, but `bin/riteway.js:123` actively uses it:

```javascript
// bin/riteway.js line 123
const fullPath = validateFilePath(filePath, cwd);
```

This is the CLI's **security check** for user-supplied file paths — it prevents path traversal attacks like `riteway ai ../../../etc/passwd`. This is a completely separate concern from whether the orchestrator agent validates import paths.

**Current import chain:**
```javascript
// bin/riteway.js line 10
import { runAITests, verifyAgentAuthentication, validateFilePath, parseOpenCodeNDJSON } from '../source/ai-runner.js';
```

**Recommendation:** `validateFilePath` **MUST be kept** in `ai-runner.js`. The remediation plan's comment #18 says "We likely won't need `validateFilePath`, if we let the AI extract the prompt under test" — this refers to import path validation inside test files, NOT the CLI's input validation. These are different concerns.

### Concern 3: Failure Fixture Test is an Integration Test

**The problem:** Phase 5's test calls `runAITests` with a real Claude agent config:

```javascript
test('wrong prompt fixture fails correctly', async () => {
  const results = await runAITests({
    filePath: 'source/fixtures/wrong-prompt-test.sudo',
    agentConfig: { command: 'claude', args: ['-p', '--output-format', 'json'] },
    // ...
  });
```

This requires:
- Claude CLI to be installed and authenticated
- Network access to Anthropic's API
- ~30-60 seconds per run

**Impact:** This test would fail in CI, fail for contributors without Claude CLI, and slow down `npm test`.

**Recommendation:**
- The failure fixture itself is good — keep `wrong-prompt-test.sudo` and `wrong-ui-guide.mdc`
- The unit test should use a **mock agent** that returns TAP failures for the wrong prompt scenario
- Add a separate **E2E test** (excluded from `npm test`, like the existing `e2e.test.js`) that runs the fixture with a real agent

### Concern 4: `aggregatePerAssertionResults` Rename May Break Consumers

**The problem:** The plan renames `aggregatePerAssertionResults` to `aggregateTAPResults`. But `bin/riteway.js` doesn't import this directly — it goes through `runAITests`. However, the test file `ai-runner.test.js` imports it directly:

```javascript
// source/ai-runner.test.js line 8
import { aggregatePerAssertionResults } from './ai-runner.js';
```

**Recommendation:** Either keep the name or update both the export and the test import. Not a blocker, just needs attention.

### Concern 5: `generateSlug` Import in result-manager.js

**The problem:** The plan's `result-manager.js` imports from `test-output.js`:

```javascript
import { generateSlug } from './test-output.js';
```

But looking at the current `test-output.js`, `generateSlug` uses `@paralleldrive/cuid2`:

```javascript
// source/test-output.js
import { init } from '@paralleldrive/cuid2';
const createSlug = init({ length: 5 });
export const generateSlug = () => createSlug();
```

This is fine, but `generateSlug` is not currently exported from `test-output.js`. Need to verify.

### Concern 6: Test File Import Syntax Change

**The problem:** The remediation plan (D9) specifies a new import syntax: `import @ai/rules/ui.mdc` (no `from` clause, no variable binding). But the existing fixtures use the old syntax:

```sudolang
// source/fixtures/media-embed-test.sudo (current)
import @promptUnderTest from 'ai/rules/ui.mdc'
```

The architect's wrong-prompt fixture also uses the old syntax:
```sudolang
import @promptUnderTest from 'source/fixtures/prompts/wrong-ui-guide.mdc'
```

**Question:** Should we update the import syntax now (per D9), or keep the old syntax for compatibility? The orchestrator agent can handle either format since it understands the file dynamically. This is a separate decision from the architecture refactor.

---

## Part 3: Impact Assessment

### What breaks if we proceed as-is?

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Agent can't read files | Medium | Pipeline fails | Option A or B (CLI reads files) |
| Agent can't write files | High | Judge has no result | Capture stdout, pass inline |
| `validateFilePath` removed | Certain | Path traversal vulnerability | Keep it in ai-runner.js |
| Failure test needs real agent | Certain | Test fails without Claude | Use mock agent for unit test |
| Import syntax mismatch | Low | Orchestrator handles both | Defer to separate task |

### What currently works that we must not break?

- 78 TAP tests (core riteway)
- 108 Vitest tests (ai-runner, test-extractor, test-output, debug-logger, vitest adapter)
- `bin/riteway.js` CLI routing (standard test runner + AI test runner)
- `riteway ai <file>` command with `--runs`, `--threshold`, `--agent` flags
- `source/test-output.js` — TAP formatting, file output, browser opening
- `source/debug-logger.js` — debug logging infrastructure

### Files the architect will NOT touch

- `bin/riteway.test.js` — Tasks 2-4 will handle these test patterns
- `source/debug-logger.js` — No changes needed
- `source/test-output.js` — Reused as-is
- `source/vitest.js` / `source/vitest.test.jsx` — Vitest adapter, unrelated
- `source/riteway.js` / `source/test.js` — Core riteway, unrelated

---

## Part 4: Decision Points for User

### Decision 1: File Access Strategy

How should the orchestrator get test file content?

- **A) CLI reads files, passes content** — Safer, agent-agnostic, slight import detection needed
- **B) Hybrid** — CLI reads test file, orchestrator identifies imports, CLI reads imports
- **C) Agent reads files** (current plan) — Cleanest but agent-specific, file writes unreliable

### Decision 2: Result Passing Strategy

How should the actual result get from the Result Generator to the Judge?

- **A) Inline in prompt** — CLI captures stdout, passes content directly to Judge prompt
- **B) File-based** (current plan) — Result Generator writes to file, Judge reads file

### Decision 3: `validateFilePath` Disposition

- **Keep** (recommended) — CLI still needs it for user-supplied paths
- **Remove** — If we add Zod validation in Task 2 that handles path validation

### Decision 4: Failure Fixture Testing

- **Mock agent** for unit tests + **separate E2E test** (recommended)
- **Real agent** in unit tests (current plan)

---

## Part 5: Architect's Full Plan

The complete implementation plan with code examples is preserved below for reference. See `~/.claude/plans/smooth-brewing-wilkinson.md` for the original.

### Phase 1: TAP Infrastructure

**1.1 `parseSingleAssertionTAP`** — Parse TAP from Judge output

```javascript
// source/tap-parser.js
export const parseSingleAssertionTAP = (tapOutput) => {
  const lines = tapOutput.trim().split('\n');
  const assertionLine = lines.find(line =>
    line.startsWith('ok ') || line.startsWith('not ok ')
  );

  if (!assertionLine) {
    throw createError({
      name: 'ParseError',
      message: 'No TAP assertion line found',
      code: 'INVALID_TAP_FORMAT',
      tapOutput
    });
  }

  const passed = assertionLine.startsWith('ok ');
  const description = assertionLine.replace(/^(not )?ok \d+ - /, '');
  const reasoningLine = lines.find(line => line.startsWith('# reasoning:'));
  const reasoning = reasoningLine?.replace('# reasoning: ', '');

  return { passed, description, reasoning };
};
```

**1.2 `aggregateTAPResults`** — Aggregate per-assertion TAP with threshold

```javascript
// source/ai-runner.js (replaces aggregatePerAssertionResults)
export const aggregateTAPResults = ({ perAssertionTAPResults, threshold, runs }) => {
  const requiredPasses = calculateRequiredPasses({ runs, threshold });

  const assertions = perAssertionTAPResults.map(({ description, tapResults }) => {
    const parsedResults = tapResults.map(parseSingleAssertionTAP);
    const passCount = parsedResults.filter(r => r.passed).length;

    return {
      description,
      passed: passCount >= requiredPasses,
      passCount,
      totalRuns: runs,
      failures: parsedResults.filter(r => !r.passed)
    };
  });

  return {
    passed: assertions.every(a => a.passed),
    assertions
  };
};
```

### Phase 2: Agent Prompts

**2.1 Orchestrator** — Reads test file, identifies components

```javascript
// source/prompts/orchestrator.js
export const buildOrchestratorPrompt = (testFilePath) => {
  return `You are the Orchestrator Agent for the Riteway AI Testing Framework.
...
TEST FILE PATH: ${testFilePath}
...
RETURN JSON: { promptUnderTest, userPrompt, assertions: [{ description, requirement }] }`;
};
```

**2.2 Result Generator** — Executes prompt, returns actual result

```javascript
export const buildResultGeneratorPrompt = ({ promptUnderTest, userPrompt, resultFilePath }) => {
  return `You are the Result Generator...
Execute the user prompt. Write response to file: ${resultFilePath}
Return JSON: {"resultFilePath": "...", "status": "completed"}`;
};
```

**2.3 Judge** — Evaluates one assertion, returns TAP

```javascript
export const buildJudgePrompt = ({ promptUnderTest, userPrompt, resultFilePath, assertion, assertionNumber }) => {
  return `You are a Judge Agent...
Read actual result file. Evaluate assertion.
Return: ok ${assertionNumber} - ${assertion} OR not ok ${assertionNumber} - ${assertion}\n# reasoning: ...`;
};
```

### Phase 3: Pipeline (`runAITests` 5-step restructure)

```
Step 1: CLI → Orchestrator (AI) → { promptUnderTest, userPrompt, assertions }
Step 2: CLI → Result Generator (AI) → writes result to file
Step 3: CLI dispatches per-assertion Judge agents
Step 4: Each Judge reads result file, evaluates one assertion, returns TAP
Step 5: CLI aggregates TAP → final output
```

### Phase 4: Cleanup

Delete `test-extractor.js`, `test-extractor.test.js`. Remove dead functions from `ai-runner.js`.

### Phase 5: Failure Fixture

Create `source/fixtures/wrong-prompt-test.sudo` with deliberately wrong Prompt Under Test ("Make everything brown").

---

## References

- [Remediation plan](../tasks/2026-02-09-pr394-remediation.md) — Full task breakdown
- [Epic requirements](../tasks/archive/2026-01-22-riteway-ai-testing-framework/2026-01-22-riteway-ai-testing-framework.md) — Original spec
- [PR #394 review](https://github.com/paralleldrive/riteway/pull/394#pullrequestreview-3764740159) — janhesters' review
- [vision.md](../vision.md) — "The standard testing framework for AI Driven Development and software agents"
- [javascript.mdc](../ai/rules/javascript/javascript.mdc) — JS best practices
- [tdd.mdc](../ai/rules/tdd.mdc) — TDD process
- [error-causes.mdc](../ai/rules/javascript/error-causes.mdc) — Error handling
