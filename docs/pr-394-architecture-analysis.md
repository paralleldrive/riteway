# PR #394 Architecture Analysis: Review Comments #17, #18, #19, and General

## 1. Understanding the Reviewer's Architecture Vision

### The Orchestrator Pattern (Comment #17 / Diagram 1)

The reviewer proposes an **orchestrator-subagent pattern** where the orchestrator itself is an **AI agent**:

1. **The orchestrator agent** (an AI agent spawned by the riteway CLI) reads the test file and dynamically resolves imports — using its own AI capabilities and file-reading tools, NOT imperative regex parsing. Comment #17 explicitly criticizes deterministic parsing: *"The deterministic parsing reduces the flexibility of the testing surface."*
2. **Import resolution** uses `import @ai/rules/ui.mdc` syntax. The orchestrator agent understands this syntax and reads the referenced file — no `parseImports()` regex or `validateFilePath()` needed. Comment #18 confirms: *"We likely won't need [`validateFilePath`], if we let the AI extract the prompt under test."*
3. **The orchestrator agent dispatches subagents** with specific, assembled prompts. The subagents receive:
   - The full test file contents (treated as a prompt, not parsed)
   - The resolved import content (the "prompt under test")
   - Any necessary context
4. **The subagents do focused AI work** — the Result Generator executes the prompt, the Judge evaluates results. The orchestrator agent coordinates everything declaratively.

**Key insight**: The reviewer sees the orchestrator as an AI agent that dynamically and declaratively handles its responsibilities (file reading, import resolution, assertion identification, subagent dispatch). The test file is a prompt — the AI agent understands it natively. No imperative parsing code is needed for the orchestrator's work. The only imperative code is the CLI harness that spawns the orchestrator agent and aggregates final TAP output.

### The AI Judge Pattern (Comment #19 / Diagram 2)

The reviewer proposes that:

1. **The AI judge** (subagent) is the *only* thing returning structured output.
2. **The AI judge returns structured output AND TAP** — the format of both the structured output and the TAP can be **deterministically parsed** by the CLI harness.
3. **Results are pushed to the orchestrator agent** which coordinates aggregation (or directly to the CLI harness).
4. **"Any parsing step is probably wrong"** — the reviewer is saying that the current `parseStringResult` function (which tries multiple JSON parsing strategies on raw agent output) should not exist. If the AI judge is properly instructed to return structured output, parsing should be trivial (not speculative/multi-strategy).

**Key insight**: The reviewer wants a single AI interaction per test assertion, where the AI judge returns a well-defined TAP format. The parsing of that output should be simple/deterministic in the CLI harness, not a multi-strategy guessing game. The orchestrator agent coordinates the pipeline; the CLI harness aggregates final results.

### Synthesized Vision

The reviewer's full architecture is:

```
Test File (.sudo)
  → CLI Harness spawns Orchestrator Agent (AI)
  → Orchestrator Agent reads test file (dynamically, via AI capabilities)
  → Orchestrator Agent resolves imports (dynamically — no regex parsing)
  → Orchestrator Agent identifies assertions (dynamically — AI understands the format)
  → Orchestrator Agent dispatches Result Generator subagent (execution)
  → Orchestrator Agent dispatches Judge subagent per assertion (evaluation)
  → Judge returns TAP for each assertion
  → CLI Harness aggregates TAP across runs (deterministic)
  → Output final TAP
```

**Note:** The orchestrator is an AI agent, NOT deterministic code. Comment #17: *"The main orchestrator **agent** should pull in the prompt file and then dispatch a subagent."* The only deterministic/imperative code is the CLI harness.

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
| Subagent execution via CLI subprocess | **Aligned** — `executeAgent()` spawns CLI subprocesses |
| Per-assertion isolation | **Aligned** — Each assertion runs in its own subprocess |
| Concurrency-limited parallel execution | **Aligned** — `limitConcurrency()` manages parallel runs |
| Aggregation in CLI harness | **Aligned** — `aggregatePerAssertionResults()` is deterministic |

### Where Current Implementation Diverges

| Aspect | Current | Reviewer's Vision | Severity |
|--------|---------|-------------------|----------|
| **Orchestrator nature** | Imperative Node.js code (functions, regex) | Orchestrator is an **AI agent** that operates declaratively | **CRITICAL** — comment #17: "The main orchestrator **agent**"; "deterministic parsing reduces flexibility" |
| **Test file parsing** | AI agent extracts structured metadata (Phase 1) | Orchestrator agent passes whole file to subagents — no extraction phase | **HIGH** — fundamental architectural difference |
| **Import resolution** | Imperative `parseImports()` regex + `validateFilePath()` | Orchestrator agent reads imports dynamically via AI capabilities | **HIGH** — comment #17 criticizes deterministic parsing; comment #18 says `validateFilePath` unnecessary |
| **Number of AI calls** | N+1 per test file (1 extraction + N evaluations) | Orchestrator agent + N judge calls (no extraction call) | **MEDIUM** — cost and latency impact |
| **Output parsing** | Multi-strategy `parseStringResult` guesses format | AI judge returns well-defined TAP; parsing is trivial in CLI harness | **HIGH** — reviewer says "any parsing step is probably wrong" |
| **Import syntax** | `import @promptUnderTest from 'ai/rules/ui.mdc'` | `import @ai/rules/ui.mdc` (Comment #17 suggests different syntax) | **NEEDS CLARIFICATION** — may be reviewer preference or spec change |
| **Prompt construction** | Two templates (`buildExtractionPrompt` + `buildEvaluationPrompt`) | Orchestrator agent assembles prompts dynamically — no code templates | **HIGH** — eliminates template code entirely |
| **Role of test file** | Parsed by AI for metadata extraction | Treated as prompt for the orchestrator agent | **HIGH** — aligns with epic: "don't parse" |

---

## 3. Impact Assessment Per Comment

### Comment #17: Import Syntax and Orchestrator Dispatch

**What**: The reviewer questions whether the import syntax should be `import @ai/rules/ui.mdc` and notes that the orchestrator should pull in the prompt file and dispatch a subagent. "The deterministic parsing reduces the flexibility of the testing surface."

**Interpretation**: The reviewer is saying three things:
1. The orchestrator is an **AI agent** ("The main orchestrator **agent**")
2. This AI agent handles imports dynamically ("should pull in the prompt file")
3. Imperative regex-based parsing is explicitly wrong ("The deterministic parsing reduces the flexibility of the testing surface")

The AI orchestrator agent understands import syntax natively and reads referenced files using its own capabilities — no `parseImports()` regex, no `validateFilePath()` needed.

**What needs to change**:
- The entire imperative import resolution logic (`parseImports()` regex + `validateFilePath()` + file reading) **gets removed** — the orchestrator agent handles this dynamically
- The `buildExtractionPrompt()` function and the entire Phase 1 extraction concept **gets removed**
- The import syntax in fixtures may need updating (unclear if `import @ai/rules/ui.mdc` vs `import @promptUnderTest from 'ai/rules/ui.mdc'` is a required change)

**Code impact**:
- `parseImports()` — **removed** (orchestrator agent handles imports dynamically)
- `validateFilePath()` — **removed** (comment #18 confirms: unnecessary when AI handles imports)
- `buildExtractionPrompt()` — **removed**
- `parseExtractionResult()` — **removed** (no extraction result to parse)
- `extractTests()` — **removed** (no two-phase pipeline; orchestrator agent does this)

### Comment #18: `validateFilePath` May Not Be Needed

**What**: "We likely won't need this, if we let the AI extract the prompt under test."

**Interpretation**: This is now clear in light of comment #17. The orchestrator is an AI agent that handles import resolution dynamically. Since the AI agent reads files using its own capabilities (not imperative code opening arbitrary paths), `validateFilePath` is unnecessary. There is no conflict with comment #17 — both comments agree: the orchestrator **agent** (AI) handles imports, so imperative path validation is not needed.

**What needs to change**:
- `validateFilePath` **gets removed** — the AI orchestrator agent handles file access
- The AI agent's own sandboxing/capabilities handle security (it can only read files it has access to)

**Code impact**:
- `validateFilePath()` in `ai-runner.js:15` — **removed**
- Path traversal test in `test-extractor.test.js:559` — **removed**

### Comment #19: Eliminate Multi-Strategy Parsing

**What**: "Any parsing step is probably wrong because the AI judge is the only thing returning structured output and the format of that structured output and TAP can be deterministically parsed and it should probably just be pushed to the orchestrator (which aggregates)."

**Interpretation**: This is the clearest architectural directive:
1. The AI judge should return **structured output** (e.g., JSON with pass/fail) and **TAP**
2. Both formats are **deterministically parseable** — no multi-strategy guessing
3. The parsed result should be **pushed to the orchestrator agent / CLI harness** for aggregation
4. The CLI harness aggregates across runs (deterministic code)

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

### Q1: Who resolves imports — orchestrator or AI agent? — RESOLVED

Comment #17 says "the main orchestrator **agent** should pull in the prompt file." Comment #18 says `validateFilePath` may not be needed "if we let the AI extract the prompt under test." These are NOT contradictory — the orchestrator IS an AI agent:
- The orchestrator **agent** (AI) pulls in the prompt file using its own file-reading capabilities
- `validateFilePath` is unnecessary because the AI agent handles file access
- `parseImports()` regex is unnecessary because the AI agent understands import syntax dynamically
- Comment #17 explicitly criticizes deterministic parsing: "The deterministic parsing reduces the flexibility of the testing surface"

**Resolution**: The orchestrator is an AI agent. It handles imports dynamically. No imperative parsing code needed.

### Q2: Should the AI judge return TAP directly, or structured JSON that gets converted to TAP?

Comment #19 mentions "structured output and TAP can be deterministically parsed." This is ambiguous:
- **Option A**: AI returns JSON (e.g., `{passed: true, output: "..."}`) and the orchestrator formats TAP
- **Option B**: AI returns TAP directly, and the orchestrator just aggregates TAP streams
- **Option C**: AI returns both structured JSON and TAP (as Comment #19 literally says "structured output and TAP")

**Recommendation**: Option A is most practical — structured JSON is easier to aggregate across multiple runs. TAP formatting belongs in the orchestrator.

### Q3: What is the role of `buildEvaluationPrompt` in the new architecture? — RESOLVED

`buildEvaluationPrompt` is **removed**. The orchestrator is an AI agent that dynamically assembles prompts for both the Result Generator and the Judge subagents. There is no imperative template code — the orchestrator agent's instructions define how it constructs these prompts.

Per-assertion isolation is maintained: the orchestrator agent dispatches a separate Judge subagent per assertion (diagram Step 3/4). The orchestrator agent handles this as part of its own behavior.

### Q4: What happens to the two-phase architecture rationale? — RESOLVED

The two-phase architecture was created to solve a real problem: "extraction agents would create prompts that returned markdown strings instead of `{passed: boolean}` objects." The 3-actor pipeline solves this differently:

1. The Judge subagent returns **TAP** (trivially parseable), not JSON — eliminating the multi-strategy parsing problem entirely
2. The orchestrator agent assembles prompts declaratively — no imperative template code
3. The separation of Result Generator (execution) from Judge (evaluation) prevents the conflation that caused the original format reliability issues

### Q5: Does the failure fixture need specific design guidance?

- Should the fixture test a wrong prompt (prompt doesn't match requirements)?
- Should it test a broken prompt (syntax errors)?
- Should it test a misaligned prompt (prompt works but fails the requirements)?
- What import should it use (if any)?

### Q6: What is the import syntax convention?

Comment #17 suggests `import @ai/rules/ui.mdc` while the current fixture uses `import @promptUnderTest from 'ai/rules/ui.mdc'`. Is this a required syntax change, or just the reviewer referencing the path?

---

## 5. Alignment Check Against Guiding Documents

### Epic Requirement: "Given test file contents, should pass entire file to AI agent (don't parse)"

| Document | Current | Reviewer's Vision |
|----------|---------|-------------------|
| Epic Task 2 | **Violates** — Phase 1 asks an AI to parse the test file into structured metadata. The test file is NOT passed whole to the evaluating agent. Imperative `parseImports()` regex further parses the file. | **Fully Aligned** — The test file is passed to the orchestrator AI agent. The AI agent understands it natively — no parsing. |

**Verdict**: The reviewer's architecture is more faithful to the epic requirement. The current two-phase approach was a pragmatic workaround for output format reliability, but it introduced the very parsing the epic said to avoid. Comment #17 explicitly criticizes this: "The deterministic parsing reduces the flexibility of the testing surface."

### Vision: "The standard testing framework for AI Driven Development and software agents"

| Aspect | Current | Reviewer's Vision |
|--------|---------|-------------------|
| Simplicity | Two-phase pipeline + imperative parsing adds complexity | Orchestrator agent + subagents — AI handles complexity declaratively |
| Agent-first | Imperative code does most orchestration work | Orchestrator is itself an AI agent — agent-first design |
| Agent-agnostic | Works with any CLI agent | Same — CLI harness is agent-agnostic |
| Treating prompts as first-class | Parses prompts before testing | Tests prompts as-is; AI agent understands them natively |

**Verdict**: The reviewer's architecture is simpler and more aligned with the vision. Making the orchestrator an AI agent is the natural expression of "The standard testing framework for AI Driven Development and software agents."

### javascript.mdc: One Job Per Function, Composition, Separation of Concerns

| Principle | Current | Reviewer's Vision |
|-----------|---------|-------------------|
| One job per function | `extractTests()` does extraction + import resolution + prompt building (3 jobs) | Orchestrator agent understands/dispatches, Result Generator executes, Judge evaluates, CLI harness aggregates (clearer separation) |
| Composition | Acknowledges need for asyncPipe (TODO comment at line 390) | Naturally composable: CLI harness → orchestrator agent → subagents → TAP aggregation |
| Separation of concerns | AI extraction + template evaluation + imperative parsing conflated | Clean separation: AI orchestration vs. AI execution vs. AI evaluation vs. deterministic aggregation |

**Verdict**: The reviewer's architecture better adheres to one-job-per-function and separation of concerns. The current `extractTests()` function does too many things, and imperative parsing code belongs in neither the orchestrator (which should be an AI agent) nor the test file (which should be a prompt).

---

## 6. Summary of What Survives vs. Gets Removed

### Survives (CLI Harness Layer)
- `executeAgent()` — subprocess spawning (used to spawn orchestrator agent, and by orchestrator to spawn subagents)
- `calculateRequiredPasses()` — math doesn't change (CLI harness)
- `aggregatePerAssertionResults()` — aggregation logic stays (CLI harness, restructured for TAP)
- `runAITests()` — restructured: spawns orchestrator agent, collects TAP results
- `createDebugLogger()` — utility, unchanged
- `parseOpenCodeNDJSON()` — agent-specific wire format parsing (NOT AI content parsing)

### Gets Removed
- `parseStringResult()` — multi-strategy parsing is "probably wrong" (#19)
- `buildExtractionPrompt()` — no extraction phase
- `parseExtractionResult()` — no extraction result to validate
- `extractJSONFromMarkdown()` — subsumed by simpler parsing
- `tryParseJSON()` — subsumed by simpler parsing
- `extractTests()` — the entire two-phase pipeline is replaced; orchestrator agent handles this
- `buildEvaluationPrompt()` — orchestrator agent assembles prompts dynamically
- `parseImports()` — orchestrator agent handles imports dynamically; "deterministic parsing reduces flexibility" (#17)
- `validateFilePath()` — unnecessary when AI agent handles file access (#18)
- `readTestFile()` — orchestrator agent reads files via its own capabilities

### Gets Added
- **Orchestrator agent prompt/instructions** — system prompt defining how the AI agent handles test files, imports, assertions, and subagent dispatch
- New failure fixture (`wrong-prompt-test.sudo` or similar)
- Tests for failure fixture
- Trivial TAP parsing in CLI harness (deterministic, not multi-strategy)
