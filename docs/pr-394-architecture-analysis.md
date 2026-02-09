# PR #394 Architecture Analysis: Review Comments #17, #18, #19, and General

## 1. Understanding the Reviewer's Architecture Vision

### The Orchestrator Pattern (Comment #17 / Diagram 1)

The reviewer proposes an **orchestrator-subagent pattern** where:

1. **The orchestrator** (riteway CLI) reads the test file and resolves imports — this is infrastructure work that should be deterministic, not AI-driven.
2. **Import resolution** uses `import @ai/rules/ui.mdc;` syntax (note the semicolon and `@ai/` prefix, suggesting a convention similar to how cursor rules or other AI rule files are referenced).
3. **The orchestrator dispatches a subagent** with a specific, assembled prompt. The subagent receives:
   - The full test file contents (treated as a prompt, not parsed)
   - The resolved import content (the "prompt under test")
   - Any necessary context
4. **The subagent does all the AI work** — it reads the test file as a prompt, understands the assertions, executes them, and evaluates results. There is no separate "extraction phase" where an AI parses the test file into structured metadata.

**Key insight**: The reviewer sees the test file as a prompt that should be passed *whole* to an AI agent. The AI agent should understand the SudoLang test format natively and produce structured evaluation results. The orchestrator should not use an AI to parse the test file — that's deterministic work the orchestrator handles (imports, file reading).

### The AI Judge Pattern (Comment #19 / Diagram 2)

The reviewer proposes that:

1. **The AI judge** (subagent) is the *only* thing returning structured output.
2. **The AI judge returns structured output AND TAP** — the format of both the structured output and the TAP can be **deterministically parsed**.
3. **Results are pushed to the orchestrator** which aggregates them.
4. **"Any parsing step is probably wrong"** — the reviewer is saying that the current `parseStringResult` function (which tries multiple JSON parsing strategies on raw agent output) should not exist. If the AI judge is properly instructed to return structured output, parsing should be trivial (not speculative/multi-strategy).

**Key insight**: The reviewer wants a single AI interaction per test assertion (or per test file), where the AI returns a well-defined format. The parsing of that output should be simple/deterministic, not a multi-strategy guessing game. The orchestrator aggregates results across runs.

### Synthesized Vision

The reviewer's full architecture is:

```
Test File (.sudo)
  → Orchestrator reads file
  → Orchestrator resolves imports (deterministic)
  → Orchestrator assembles prompt (file contents + imported prompt-under-test)
  → Dispatch to AI subagent (one per assertion or per test file)
  → AI subagent acts as judge: executes + evaluates
  → AI judge returns structured output (JSON with pass/fail) + TAP
  → Orchestrator deterministically parses structured output
  → Orchestrator aggregates across runs
  → Output final TAP
```

---

## 2. Gap Analysis: Current Implementation vs. Reviewer's Vision

### What the Current Two-Phase Extraction Architecture Does

The current implementation (`test-extractor.js` + `ai-runner.js`) uses a **two-phase architecture**:

**Phase 1: AI-Driven Extraction** (`buildExtractionPrompt` → `executeAgent` → `parseExtractionResult`)
- An AI agent is called with the test file content
- The AI agent is asked to parse the test file and extract structured metadata: `{id, description, userPrompt, requirement}`
- This returns metadata objects, NOT executable prompts
- Import paths are parsed deterministically via `parseImports()` regex

**Phase 2: Template-Based Evaluation** (`buildEvaluationPrompt` → `executeAgent` per assertion)
- The extracted metadata is transformed into evaluation prompts via a code template
- Each assertion gets its own prompt with explicit JSON response format instructions
- The AI subagent executes each prompt and returns `{passed, output, reasoning}`

**Additionally:**
- `parseStringResult` in `ai-runner.js` applies 3 strategies to parse agent output (direct JSON, markdown-wrapped JSON, plain text fallback)
- `validateFilePath` provides path traversal protection for imports
- `parseOpenCodeNDJSON` handles OpenCode's specific output format

### Where Current Implementation Aligns

| Aspect | Alignment |
|--------|-----------|
| Orchestrator reads test file | **Aligned** — `readTestFile()` is deterministic |
| Import resolution is deterministic | **Aligned** — `parseImports()` uses regex, no AI |
| Path security validation | **Aligned** — `validateFilePath()` prevents traversal |
| Subagent execution via CLI subprocess | **Aligned** — `executeAgent()` spawns CLI subprocesses |
| Per-assertion isolation | **Aligned** — Each assertion runs in its own subprocess |
| Concurrency-limited parallel execution | **Aligned** — `limitConcurrency()` manages parallel runs |
| Aggregation in orchestrator | **Aligned** — `aggregatePerAssertionResults()` is deterministic |

### Where Current Implementation Diverges

| Aspect | Current | Reviewer's Vision | Severity |
|--------|---------|-------------------|----------|
| **Test file parsing** | AI agent extracts structured metadata (Phase 1) | Orchestrator passes whole file to AI — no extraction phase | **HIGH** — fundamental architectural difference |
| **Number of AI calls** | N+1 per test file (1 extraction + N evaluations) | N or 1 per test file (no extraction call) | **MEDIUM** — cost and latency impact |
| **Output parsing** | Multi-strategy `parseStringResult` guesses format | AI judge returns well-defined format; parsing is trivial | **HIGH** — reviewer says "any parsing step is probably wrong" |
| **Import syntax** | `import @promptUnderTest from 'ai/rules/ui.mdc'` | `import @ai/rules/ui.mdc;` (Comment #17 suggests different syntax) | **NEEDS CLARIFICATION** — may be reviewer preference or spec change |
| **Prompt construction** | Two templates (`buildExtractionPrompt` + `buildEvaluationPrompt`) | Single prompt: whole test file + imported context | **HIGH** — eliminates extraction template entirely |
| **Role of test file** | Parsed by AI for metadata extraction | Treated as opaque prompt for the AI judge | **HIGH** — aligns with epic: "don't parse" |

---

## 3. Impact Assessment Per Comment

### Comment #17: Import Syntax and Orchestrator Dispatch

**What**: The reviewer questions whether the import syntax should be `import @ai/rules/ui.mdc;` and notes that the orchestrator should pull in the prompt file and dispatch a subagent. "The deterministic parsing reduces the flexibility of the testing surface."

**Interpretation**: The reviewer is concerned that `parseImports()` and the regex-based import parsing is doing too much deterministic parsing of the test file. The orchestrator should handle imports, but the test file itself should be treated as a prompt.

**What needs to change**:
- The import resolution logic (`parseImports()` + file reading) **survives** — the orchestrator should handle this
- But the import handling may need to move from `test-extractor.js` to the orchestrator level (`ai-runner.js` or a new module)
- The `buildExtractionPrompt()` function and the entire Phase 1 extraction concept **gets removed**
- The import syntax in fixtures may need updating (unclear if `import @ai/rules/ui.mdc;` vs `import @promptUnderTest from 'ai/rules/ui.mdc'` is a required change)

**Code impact**:
- `parseImports()` — **survives** but may move location
- `buildExtractionPrompt()` — **removed**
- `parseExtractionResult()` — **removed** (no extraction result to parse)
- `extractTests()` — **removed or fundamentally rewritten** (no two-phase pipeline)

### Comment #18: `validateFilePath` May Not Be Needed

**What**: "We likely won't need this, if we let the AI extract the prompt under test."

**Interpretation**: If the AI agent handles import resolution (reading the prompt-under-test file), then the orchestrator doesn't need `validateFilePath` because it isn't reading arbitrary file paths. However, this conflicts slightly with Comment #17 where the orchestrator resolves imports.

**Possible reconciliation**: The reviewer may be saying that if the entire test file (including import statements) is passed to the AI, the AI agent would handle importing via its own file access capabilities. In that case, `validateFilePath` is unnecessary because the orchestrator never opens imported files.

**What needs to change**:
- If imports are handled by the orchestrator: `validateFilePath` **survives** (still needed for security)
- If imports are handled by the AI agent: `validateFilePath` **can be removed** from the import flow, but may still serve a purpose for the test file path itself

**Code impact**:
- `validateFilePath()` in `ai-runner.js:15` — **potentially removed** or reduced in scope
- Path traversal test in `test-extractor.test.js:559` — **removed** if validateFilePath goes

### Comment #19: Eliminate Multi-Strategy Parsing

**What**: "Any parsing step is probably wrong because the AI judge is the only thing returning structured output and the format of that structured output and TAP can be deterministically parsed and it should probably just be pushed to the orchestrator (which aggregates)."

**Interpretation**: This is the clearest architectural directive:
1. The AI judge should return **structured output** (e.g., JSON with pass/fail) and **TAP**
2. Both formats are **deterministically parseable** — no multi-strategy guessing
3. The parsed result should be **pushed to the orchestrator** for aggregation
4. The orchestrator aggregates across runs

**What needs to change**:
- `parseStringResult()` — **removed**. The multi-strategy parsing (try JSON, try markdown-wrapped JSON, keep as string) is exactly what the reviewer says is wrong.
- `executeAgent()` needs simplification — instead of `parseStringResult`, it should do a single `JSON.parse()` or TAP parse
- The AI judge prompt should explicitly instruct the format so parsing is trivial
- `parseOpenCodeNDJSON()` — **may survive** as agent-specific preprocessing (it's parsing the agent's wire format, not the AI's response content)

**Code impact**:
- `parseStringResult()` in `ai-runner.js:40` — **removed**
- `executeAgent()` in `ai-runner.js:213` — **simplified** (lines 270-293 rewritten to simple deterministic parse)
- `extractJSONFromMarkdown()` in `test-extractor.js:175` — **removed** (same concern)
- `tryParseJSON()` in `test-extractor.js:187` — **removed**

### General Review Body: Failure Test Fixture

**What**: "We should also have a test suite fixture with a WRONG prompt, so we can verify that tests also (correctly) fail."

**What needs to change**:
- Add a new fixture file, e.g., `source/fixtures/wrong-prompt-test.sudo`
- This fixture should contain a prompt that is intentionally incorrect/mismatched with its requirements
- The test suite should verify that running this fixture produces failing test results
- This serves as a "negative test" — proving the framework can detect bad prompts

**Code impact**:
- New file: `source/fixtures/wrong-prompt-test.sudo` (or similar)
- New test assertions (in E2E or unit tests) verifying the framework correctly reports failures
- No changes to existing code, purely additive

---

## 4. Key Architectural Questions Requiring Clarification

### Q1: Who resolves imports — orchestrator or AI agent?

Comment #17 says "the orchestrator should pull in the prompt file and dispatch a subagent." But Comment #18 says `validateFilePath` may not be needed "if we let the AI extract the prompt under test." These seem contradictory:
- **Option A**: Orchestrator resolves imports (deterministic), passes assembled prompt to AI. `validateFilePath` survives.
- **Option B**: AI agent resolves imports via its own file access. `validateFilePath` is unnecessary.

**Recommendation**: Seek explicit clarification. Option A aligns better with the epic's "treat test files as prompts" philosophy, but Option B reduces orchestrator complexity.

### Q2: Should the AI judge return TAP directly, or structured JSON that gets converted to TAP?

Comment #19 mentions "structured output and TAP can be deterministically parsed." This is ambiguous:
- **Option A**: AI returns JSON (e.g., `{passed: true, output: "..."}`) and the orchestrator formats TAP
- **Option B**: AI returns TAP directly, and the orchestrator just aggregates TAP streams
- **Option C**: AI returns both structured JSON and TAP (as Comment #19 literally says "structured output and TAP")

**Recommendation**: Option A is most practical — structured JSON is easier to aggregate across multiple runs. TAP formatting belongs in the orchestrator.

### Q3: What is the role of `buildEvaluationPrompt` in the new architecture?

If the test file is passed whole to the AI (no extraction phase), does `buildEvaluationPrompt` still exist?
- **If per-assertion isolation is kept**: Each assertion still needs its own prompt. But instead of extracting metadata first, the orchestrator might pass the whole test file with a marker for which assertion to evaluate.
- **If the AI handles all assertions at once**: `buildEvaluationPrompt` is removed entirely. The AI receives the whole file and returns results for all assertions.

**Recommendation**: Per-assertion isolation is important for test reliability (the original rationale for the two-phase approach). Clarify whether the reviewer wants to keep per-assertion isolation or trusts the AI to evaluate all assertions in a single call.

### Q4: What happens to the two-phase architecture rationale?

The two-phase architecture was created to solve a real problem: "extraction agents would create prompts that returned markdown strings instead of `{passed: boolean}` objects." If we remove Phase 1 (extraction) and Phase 2 (template-based evaluation), how do we ensure the AI judge returns structured output reliably?

**Possible answer**: The reviewer's architecture relies on the AI judge being well-prompted to return structured output. The prompt template for the judge should include explicit format instructions. This is similar to the current `buildEvaluationPrompt` but without the extraction step.

### Q5: Does the failure fixture need specific design guidance?

- Should the fixture test a wrong prompt (prompt doesn't match requirements)?
- Should it test a broken prompt (syntax errors)?
- Should it test a misaligned prompt (prompt works but fails the requirements)?
- What import should it use (if any)?

### Q6: What is the import syntax convention?

Comment #17 suggests `import @ai/rules/ui.mdc;` while the current fixture uses `import @promptUnderTest from 'ai/rules/ui.mdc'`. Is this a required syntax change, or just the reviewer referencing the path?

---

## 5. Alignment Check Against Guiding Documents

### Epic Requirement: "Given test file contents, should pass entire file to AI agent (don't parse)"

| Document | Current | Reviewer's Vision |
|----------|---------|-------------------|
| Epic Task 2 | **Violates** — Phase 1 asks an AI to parse the test file into structured metadata. The test file is NOT passed whole to the evaluating agent. | **Fully Aligned** — The test file is passed whole to the AI judge. No parsing. |

**Verdict**: The reviewer's architecture is more faithful to the epic requirement. The current two-phase approach was a pragmatic workaround for output format reliability, but it introduced the very parsing the epic said to avoid.

### Vision: "The standard testing framework for AI Driven Development and software agents"

| Aspect | Current | Reviewer's Vision |
|--------|---------|-------------------|
| Simplicity | Two-phase pipeline adds complexity | Single dispatch to AI judge is simpler |
| Agent-agnostic | Works with any CLI agent | Same — orchestrator is agent-agnostic |
| Treating prompts as first-class | Parses prompts before testing | Tests prompts as-is |

**Verdict**: The reviewer's architecture is simpler and more aligned with the vision of treating prompts as first-class testable units.

### javascript.mdc: One Job Per Function, Composition, Separation of Concerns

| Principle | Current | Reviewer's Vision |
|-----------|---------|-------------------|
| One job per function | `extractTests()` does extraction + import resolution + prompt building (3 jobs) | Orchestrator dispatches, AI judges, orchestrator aggregates (clearer separation) |
| Composition | Acknowledges need for asyncPipe (TODO comment at line 390) | Naturally composable: `readFile → resolveImports → dispatch → aggregate` |
| Separation of concerns | AI extraction + template evaluation conflated in one module | Clean separation: deterministic orchestration vs. AI judgment |

**Verdict**: The reviewer's architecture better adheres to one-job-per-function and separation of concerns. The current `extractTests()` function does too many things.

---

## 6. Summary of What Survives vs. Gets Removed

### Survives (Fully or Mostly)
- `readTestFile()` — deterministic file reading
- `executeAgent()` — subprocess spawning (but simplified parsing)
- `calculateRequiredPasses()` — math doesn't change
- `aggregatePerAssertionResults()` — aggregation logic stays
- `runAITests()` — orchestration pipeline (but restructured)
- `createDebugLogger()` — utility, unchanged
- `parseOpenCodeNDJSON()` — agent-specific wire format parsing
- `parseImports()` — deterministic import parsing (may move)
- `validateFilePath()` — depends on Q1 resolution

### Gets Removed or Fundamentally Rewritten
- `parseStringResult()` — multi-strategy parsing is "probably wrong"
- `buildExtractionPrompt()` — no extraction phase
- `parseExtractionResult()` — no extraction result to validate
- `extractJSONFromMarkdown()` — subsumed by simpler parsing
- `tryParseJSON()` — subsumed by simpler parsing
- `extractTests()` — the entire two-phase pipeline is replaced
- `buildEvaluationPrompt()` — may be replaced by simpler judge prompt or merged into orchestrator

### Gets Added
- New failure fixture (`wrong-prompt-test.sudo` or similar)
- Tests for failure fixture
- Simplified judge prompt construction
- Simpler, deterministic output parsing
