# Architecture Review: Advocate Position for the 3-Actor Pipeline

> **Date:** 2026-02-09
> **Role:** Architecture Advocate
> **Position:** FOR the proposed 3-actor pipeline, AGAINST the current two-phase extraction approach
> **PR:** [#394](https://github.com/paralleldrive/riteway/pull/394)
> **Reviewer:** janhesters (19 inline comments + 1 general)

---

## Executive Summary

The current two-phase extraction implementation contradicts the epic's foundational design principle: **"should pass entire file to AI agent (don't parse - it's a prompt)"**. The 3-actor pipeline proposed by janhesters restores fidelity to this requirement while better serving the vision of becoming *"The standard testing framework for AI Driven Development and software agents"* ([vision.md](../vision.md)). This document argues that the refactor is not merely an improvement but a **correction** — the current implementation drifted from the spec, and the reviewer caught it.

---

## 1. Requirements Violations in the Current Implementation

The epic ([tasks/archive/2026-01-22-riteway-ai-testing-framework](../tasks/archive/2026-01-22-riteway-ai-testing-framework/2026-01-22-riteway-ai-testing-framework.md)) is explicit about how test files should be treated. Let's walk through the key requirements and identify violations.

### 1.1 "Should pass entire file to AI agent (don't parse - it's a prompt)"

**Epic reference:** Task 2 requirement — *"Given test file contents, should pass entire file to AI agent (don't parse - it's a prompt)"*

**Current violation:** `test-extractor.js` does the opposite. It:
1. Uses `parseImports()` — a regex parser (`/import @\w+ from ['"](.+?)['"]/g`) that deterministically extracts import paths from the test file (line 57-59)
2. Uses `buildExtractionPrompt()` — wraps the file content in an extraction prompt that asks AI to return structured JSON metadata (lines 85-104)
3. Uses `parseExtractionResult()` — validates the AI's extraction against a schema of required fields (`id`, `description`, `userPrompt`, `requirement`) (lines 206-230)

The test file is NOT being passed as a prompt. It is being treated as **data to extract from**. The AI is asked to be a parser, not to understand and act on the prompt. This is the fundamental violation.

The epic also says in Implementation Notes: *"SudoLang test files are prompts - don't parse them, pass complete contents to agent"* and *"Treat test files as opaque prompts for maximum flexibility"*. The current implementation treats them as transparent, structured data.

### 1.2 "Should delegate to subagent via callSubAgent (no direct LLM API calls)"

**Epic reference:** Functional requirement — *"Given test file execution, should delegate to subagent via callSubAgent (no direct LLM API calls)"*

**Current approach:** The extraction phase IS a direct LLM API call in spirit. While technically it spawns a CLI subprocess, the extraction prompt is not delegating test execution — it's asking the LLM to parse a file. The `buildExtractionPrompt` says: *"You are a test extraction agent. Analyze the following test file and extract structured information"*. This is using the AI as a parser, not as an agent executing a test.

The 3-actor pipeline corrects this: the orchestrator agent receives the test file as a prompt and **understands** it as an agent would, rather than extracting metadata from it like a parser would.

### 1.3 "For each $requirement, Riteway test runner creates a Riteway assertion"

**Epic reference:** Test File Contract — *"Riteway test runner iterates each requirement and creates Riteway assertions inferring appropriate values for given, should, actual, expected"*

**Current approach:** The `buildEvaluationPrompt()` template asks the AI to return `{passed: boolean, output: string}` (line 159). This is a custom JSON format, not a Riteway assertion. The AI is told: *"Respond with JSON: {"passed": true, "output": "..."}"*. Where is the `given`? Where is the `should`? Where is `actual` vs `expected`?

The 3-actor pipeline's Judge returns TAP output (`ok N - description` / `not ok N - description`), which is the native output format of Riteway itself. This is alignment, not coincidence.

### 1.4 "Should treat as prompts and pass complete contents to agent"

**Epic reference:** Technical requirement — *"Given SudoLang/markdown test files, should treat as prompts and pass complete contents to agent"*

**Current violation:** `buildExtractionPrompt()` wraps the file content in XML-like tags (`<test-file-contents>`) and instructs the AI to extract structured data. This is not "treating as a prompt" — it's treating the content as input data for a parsing task. The distinction matters: a prompt is something an agent acts on; data is something an agent extracts from.

### 1.5 "Support extension-agnostic file reading"

**Epic reference:** Technical requirement — *"Given test file format, should support extension-agnostic file reading"*

**Current concern:** `parseImports()` relies on a specific regex pattern for import syntax. If a test file uses a different import convention (e.g., markdown link-style, frontmatter includes, or even plain English like "Please also read the file at..."), the regex fails silently. An AI orchestrator agent would handle ANY import convention because it understands natural language.

### 1.6 Summary of Violations

| Requirement | Epic Says | Current Impl Does | Violation? |
|---|---|---|---|
| Pass entire file to AI agent | Don't parse - it's a prompt | `parseImports()` regex + `buildExtractionPrompt` asks AI to extract structured data | **Yes** |
| Delegate to subagent | callSubAgent, not parser | Extraction phase uses AI as a JSON parser | **Yes** |
| Create Riteway assertions | Infer given, should, actual, expected | Returns `{passed: boolean, output: string}` JSON | **Yes** |
| Treat as prompts | Pass complete contents to agent | Wraps in extraction prompt with XML tags | **Yes** |
| Extension-agnostic | Any file format | Regex-based import parsing | **Partial** |
| Agent-agnostic design | Configurable agent CLI | Works, but deterministic parsing couples to format | **Partial** |

---

## 2. Architectural Alignment with the Vision

The vision is a single sentence: *"The standard testing framework for AI Driven Development and software agents."* ([vision.md](../vision.md))

This vision has two key phrases:

### 2.1 "AI Driven Development"

AI Driven Development means the AI is the primary actor, not the code. The current implementation makes the **code** the primary actor: deterministic regex parsing, template-based prompt construction, multi-strategy JSON parsing. The AI is relegated to being a tool called by imperative code.

The 3-actor pipeline inverts this relationship. The **AI orchestrator** is the primary actor: it reads files, understands structure, identifies assertions, and dispatches subagents. The imperative code (CLI harness) only handles what must be deterministic: argument parsing, TAP aggregation, file output.

This aligns with [please.mdc](../ai/rules/please.mdc)'s description: *"You are a SoTA AI agent system with access to advanced tools and computational resources."* The orchestrator IS such an agent. The current `test-extractor.js` treats the AI as a dumb JSON extractor.

### 2.2 "Software agents"

The vision says the framework is FOR software agents. The 3-actor pipeline is an agent architecture: orchestrator dispatches to specialized agents (Result Generator, Judge), each with a single responsibility. This is how modern agent systems work — through delegation and specialization.

The current two-phase approach is a traditional software pattern with AI bolted on. It doesn't model agent behavior; it uses AI as a utility function.

### 2.3 AGENTS.md Alignment

[AGENTS.md](../AGENTS.md) states: *"Progressive Discovery — Agents should only consume the root index until they need subfolder contents."* The orchestrator agent embodies this: it reads the test file first, then progressively discovers what it needs (imports, assertions). The current implementation front-loads all discovery into deterministic parsing.

[AGENTS.md](../AGENTS.md) also says: *"If any conflicts are detected between a requested task and the vision document, agents must: 1. Stop and identify the specific conflict."* The two-phase extraction IS a conflict with the vision — it's imperative code doing what agents should do.

---

## 3. Single Responsibility Analysis

[javascript.mdc](../ai/rules/javascript/javascript.mdc) mandates: *"One job per function; separate mapping from IO"* and *"Favor functional programming; keep functions short, pure, and composable."*

### 3.1 Current Implementation — Responsibility Confusion

`test-extractor.js` mixes concerns:

| Function | Responsibilities (plural) |
|---|---|
| `extractTests()` | Calls extraction agent, parses result, resolves imports, validates paths, reads files, builds evaluation prompts |
| `buildExtractionPrompt()` | Constructs prompt AND defines output schema AND specifies parsing behavior |
| `parseExtractionResult()` | Validates JSON structure AND validates field presence AND handles type coercion (string vs array input) |
| `buildEvaluationPrompt()` | Constructs prompt AND defines response format AND injects context |

`ai-runner.js` has similar confusion:

| Function | Responsibilities (plural) |
|---|---|
| `executeAgent()` | Spawns process AND collects stdout AND parses JSON AND unwraps envelope AND retries parsing |
| `parseStringResult()` | Tries direct JSON parse AND markdown extraction AND plain text fallback (3 strategies!) |

### 3.2 3-Actor Pipeline — Clean Separation

| Actor | Single Responsibility |
|---|---|
| **Orchestrator Agent** | Understands test files — reads, resolves imports, identifies assertions |
| **Result Generator** | Executes prompts — takes a prompt, produces a result |
| **Judge Agent** | Evaluates assertions — takes one assertion + actual result, returns TAP verdict |
| **CLI Harness** | Aggregates output — collects TAP, applies threshold, formats final output |

Each actor does ONE thing. This maps directly to [javascript.mdc](../ai/rules/javascript/javascript.mdc)'s principle and [please.mdc](../ai/rules/please.mdc)'s *"Do ONE THING at a time"*.

### 3.3 Mapping vs IO Separation

The current `extractTests()` function mixes mapping (transforming extracted data to evaluation prompts) with IO (reading import files, calling the extraction agent). The 3-actor pipeline separates these cleanly:
- IO: CLI harness reads files, spawns agents
- Mapping: TAP aggregation is pure data transformation
- Agent work: Orchestrator, Generator, Judge each handle their own domain

---

## 4. Specific Advantages of the 3-Actor Pipeline

### 4.1 AI-Driven Understanding vs Regex Parsing

**Current:** `parseImports()` uses regex `/import @\w+ from ['"](.+?)['"]/g`. This fails on:
- Import statements without `from` clause (e.g., `import @ai/rules/ui.mdc`)
- Multi-line import statements
- Comments containing import-like text
- Alternative import syntaxes that SudoLang might evolve to use
- Any import format the test author might reasonably use

janhesters' comment #28 on `media-embed-test.sudo:1` explicitly calls this out: *"Should this be `import @ai/rules/ui.mdc;`? The main orchestrator agent should pull in the prompt file and then dispatch a subagent with a specific prompt. The deterministic parsing reduces the flexibility of the testing surface."*

**Proposed:** The orchestrator agent understands natural language. It can handle ANY import syntax because it comprehends intent, not pattern matching. This is literally what AI is for — understanding flexible, human-authored content. Using regex to parse what an AI agent could understand is like using grep to answer a question.

### 4.2 Separation of Execution from Evaluation

**Current:** `buildEvaluationPrompt()` asks a SINGLE AI call to both:
1. Execute the user prompt (generate output)
2. Evaluate whether the output meets the requirement

This conflates execution and evaluation in one context window. The AI's evaluation is influenced by its own generation process. If it generated something wrong, its evaluation is biased toward justifying what it generated (confirmation bias in LLMs is well-documented).

**Proposed:** The Result Generator ONLY executes the prompt. The Judge ONLY evaluates the result against an assertion. Neither is influenced by the other's reasoning. This is analogous to blind peer review — the evaluator doesn't know (or care about) the process that produced the result.

Per [tdd.mdc](../ai/rules/tdd.mdc): *"Units under test should be isolated from each other."* In the current implementation, execution and evaluation are NOT isolated — they share context.

### 4.3 TAP Output vs JSON Format Wars

**Current:** The evaluation prompt demands: *"Respond with JSON: {"passed": true, "output": "..."}"* and includes the warning: *"CRITICAL: Return ONLY the JSON object with no markdown fences"*. Despite this, `parseStringResult()` has THREE fallback strategies because LLMs frequently fail to produce clean JSON:
1. Direct JSON parse
2. Markdown-wrapped JSON extraction
3. Plain text fallback

The very existence of multi-strategy parsing is evidence that the approach is fragile. The extensive documentation in `test-extractor.js` (lines 6-48, a 42-line comment block!) explains the "historical context" of why this was needed — because asking LLMs to return structured JSON is unreliable.

**Proposed:** The Judge returns TAP: `ok 1 - description` or `not ok 1 - description`. TAP is:
- A single line of text (trivially parseable)
- The native output format of test frameworks (Riteway included)
- Human-readable without parsing
- Impossible to format incorrectly (it's literally "ok" or "not ok")

No multi-strategy parsing. No JSON extraction from markdown fences. No 42-line comments explaining why parsing is hard. The format is so simple that parsing it is trivial.

### 4.4 Reduced Complexity

**Removed by the refactor:**

| Component | LOC (approx) | Complexity |
|---|---|---|
| `parseStringResult` (3-strategy parser) | 30 | High — multiple fallback strategies |
| `buildExtractionPrompt` | 20 | Medium — prompt engineering |
| `parseExtractionResult` | 25 | Medium — validation logic |
| `extractJSONFromMarkdown` | 5 | Low — regex |
| `tryParseJSON` | 8 | Low — try/catch |
| `buildEvaluationPrompt` | 25 | Medium — template construction |
| `parseImports` | 3 | Low — regex |
| 42-line architecture comment | 42 | N/A — documentation overhead |

**Total removed:** ~158 LOC + 42 lines of explanatory comments

**Added:**
- `buildOrchestratorPrompt` (~20 LOC)
- `buildResultGeneratorPrompt` (~15 LOC)
- `buildJudgePrompt` (~15 LOC)
- `parseSingleAssertionTAP` (~15 LOC)
- `aggregateTAPResults` (~20 LOC)

**Total added:** ~85 LOC

**Net reduction:** ~115 LOC including the 42-line explanatory comment that becomes unnecessary

The fact that the current implementation REQUIRES a 42-line comment to explain its own architecture is itself an argument against it. Per [javascript.mdc](../ai/rules/javascript/javascript.mdc): *"Ensure that any comments are necessary and add value. Never reiterate the style guides. Avoid obvious redundancy with the code."* If the architecture is so counterintuitive that it needs 42 lines to justify itself, the architecture is wrong.

---

## 5. Response to Concerns from Architecture Review

The architecture review ([tasks/2026-02-09-task1-architecture-review.md](../tasks/2026-02-09-task1-architecture-review.md)) raised 6 concerns. Here are the advocate responses:

### Concern 1: AI Agent File Access (CRITICAL)

**The concern:** The plan assumes AI agents can read and write files when spawned as CLI subprocesses. This may not work with all agents.

**Advocate response:** Agree this is the most important practical concern. The advocate position is for **Option B (Hybrid)**:

```
CLI reads test file → passes content to Orchestrator in prompt
Orchestrator returns { importPaths: [...], userPrompt: "...", assertions: [...] }
CLI reads imported files → passes all content to Result Generator
CLI captures Result Generator stdout → passes inline to Judge
```

**Why Option B:**
- The orchestrator still dynamically understands the test file (AI-driven, not regex)
- The CLI handles file I/O (reliable, agent-agnostic)
- Import resolution is a two-step process: orchestrator IDENTIFIES imports, CLI READS them
- This preserves the epic's agent-agnostic design requirement
- This is still fundamentally different from the current approach because the AI understands the file structure — no regex parsing, no template-based extraction

Option B satisfies janhesters' architectural vision (the AI understands the test file) while being pragmatically reliable. The key insight from comment #28 is not "the agent must read files" — it's "the deterministic parsing reduces the flexibility of the testing surface." Option B eliminates deterministic parsing while keeping file I/O in reliable imperative code.

Per [javascript.mdc](../ai/rules/javascript/javascript.mdc): *"One job per function; separate mapping from IO."* Option B perfectly separates: AI handles mapping (understanding structure), CLI handles IO (reading/writing files).

### Concern 2: `validateFilePath` Still Needed by CLI

**Advocate response:** Fully agree. `validateFilePath` MUST be kept for the CLI's security boundary. The remediation plan's comment #18 (*"We likely won't need this, if we let the AI extract the prompt under test"*) refers specifically to import path validation inside test files — not the CLI's input validation.

These are two completely different concerns:
1. **CLI input validation** (keep): `riteway ai ../../../etc/passwd` must be rejected
2. **Import path validation** (removed): The orchestrator agent handles imports dynamically

Per [error-causes.mdc](../ai/rules/javascript/error-causes.mdc), security errors should use `createError` with structured metadata. The current `validateFilePath` already does this correctly with `name: 'SecurityError', code: 'PATH_TRAVERSAL'`. This function survives the refactor.

### Concern 3: Failure Fixture Test is an Integration Test

**Advocate response:** Agree. The failure fixture itself is essential (janhesters' general review comment: *"We should also have a test suite fixture with a WRONG prompt, so we can verify that tests also (correctly) fail"*), but the unit test should use a mock agent.

Per [tdd.mdc](../ai/rules/tdd.mdc): *"Tests must be: Isolated/Integrated — Units under test should be isolated from each other."* A unit test that requires a live Claude CLI is not isolated — it depends on network, authentication, and API availability.

**Recommended approach:**
- **Unit test:** Mock agent that returns predetermined TAP failures for the wrong prompt
- **E2E test:** Separate test file (excluded from `npm test`, like existing `e2e.test.js`) that runs with real agent
- **Fixture itself:** `wrong-prompt-test.sudo` lives in `source/fixtures/` and is valid for both

This follows the existing pattern established in the codebase (see `source/e2e.test.js` excluded in `vitest.config.js`).

### Concern 4: `aggregatePerAssertionResults` Rename

**Advocate response:** This is a minor housekeeping concern, not a blocker. The rename to `aggregateTAPResults` is appropriate because the function's contract changes (it now aggregates TAP strings instead of `{passed: boolean}` objects). Per [javascript.mdc](../ai/rules/javascript/javascript.mdc)'s SDA principle, the name should describe what the function does. If it aggregates TAP results, call it `aggregateTAPResults`.

Update both the export and the test import. This is a one-line change in the test file.

### Concern 5: `generateSlug` Import

**Advocate response:** Minor implementation detail. Verify the export exists; if not, add it. Not architecturally significant.

### Concern 6: Test File Import Syntax Change

**Advocate response:** The import syntax change (`import @ai/rules/ui.mdc` vs `import @promptUnderTest from 'ai/rules/ui.mdc'`) is a separate concern from the architecture refactor. However, it's worth noting that with the orchestrator agent approach, the import syntax **doesn't matter**:

- The orchestrator agent can understand ANY import format because it reads natural language
- The current regex parser is bound to exactly one syntax: `import @\w+ from ['"](.+?)['"]`
- This is precisely janhesters' point in comment #28: *"The deterministic parsing reduces the flexibility of the testing surface"*

The new syntax is simpler (per KISS from [javascript.mdc](../ai/rules/javascript/javascript.mdc)), but the real win is that the orchestrator doesn't care which syntax is used. The architecture is format-agnostic.

---

## 6. Reviewer Intent — What janhesters Is Actually Asking For

### 6.1 Direct Quotes and Their Meaning

**Comment #28** (on `media-embed-test.sudo:1`):
> *"The main orchestrator **agent** should pull in the prompt file and then dispatch a subagent with a specific prompt."*

Key word: **agent**. Not "function." Not "module." An agent. janhesters is saying the orchestrator should be an AI agent that understands the test file, not a deterministic code module that parses it.

> *"The deterministic parsing reduces the flexibility of the testing surface."*

This is the thesis statement of the review. Deterministic parsing (regex, templates, structured extraction) limits what test files can contain. An AI agent can handle any format. The "testing surface" — the space of valid test file formats — should be as wide as possible.

**Comment #29** (on `ai-runner.js:15`, `validateFilePath`):
> *"We likely won't need this, if we let the AI extract the prompt under test."*

janhesters is saying: if the AI orchestrator handles import resolution, the deterministic `validateFilePath` for imports becomes unnecessary. (Note: CLI-level path validation is a separate concern that survives.)

**Comment #30** (on `ai-runner.js:40`, `parseStringResult`):
> *"Any parsing step is probably wrong because the AI judge is the only thing returning structured output and the format of that structured output and TAP can be deterministically parsed and it should probably just be pushed to the orchestrator (which aggregates)."*

This is the most architecturally significant comment. janhesters is saying:
1. The ONLY structured output should come from the Judge (TAP format)
2. TAP is trivially, deterministically parseable (no multi-strategy fallback needed)
3. The orchestrator aggregates the TAP results
4. Everything else (multi-strategy JSON parsing, markdown extraction, envelope unwrapping) is unnecessary complexity

**General review comment:**
> *"We should also have a test suite fixture with a WRONG prompt, so we can verify that tests also (correctly) fail."*

This is about test completeness. A test framework that can only demonstrate passing tests is incomplete. The failure fixture proves the Judge actually evaluates (not rubber-stamps).

### 6.2 The Architecture Diagrams

janhesters provided TWO architecture diagrams:

**Diagram 1** (comment #28): Shows the orchestrator agent reading test files, resolving imports, and dispatching to subagents. This establishes the "agent as orchestrator" pattern.

**Diagram 2** (comment #30, preferred/latest): Shows the full 5-step, 3-actor pipeline: Orchestrator reads + understands, Result Generator executes, Judge evaluates per-assertion, CLI harness aggregates TAP.

The reviewer didn't just write text comments — they drew architecture diagrams. This signals high conviction and careful thought about the proposed design. This is not a casual suggestion; it's a considered architectural proposal.

### 6.3 What the Reviewer Is NOT Saying

janhesters is NOT saying:
- "The code doesn't work" — it does (62 tests pass)
- "The tests are bad" — the testing approach is solid
- "The CLI structure is wrong" — the CLI routing pattern is fine
- "The agent-agnostic design is wrong" — they support it

janhesters IS saying:
- The architecture should be agent-first, not code-first
- Deterministic parsing of test files contradicts the epic's "don't parse" principle
- The AI should understand test files, not extract structured data from them
- TAP output from the Judge eliminates the need for complex JSON parsing
- Execution and evaluation should be separated into different agents

---

## 7. Rules Alignment Summary

| Rule | Principle | Current Impl | 3-Actor Pipeline |
|---|---|---|---|
| [please.mdc](../ai/rules/please.mdc) | "Do ONE THING at a time" | `extractTests()` does extraction + import resolution + path validation + prompt building | Each actor does one thing |
| [javascript.mdc](../ai/rules/javascript/javascript.mdc) | "One job per function; separate mapping from IO" | `extractTests()` mixes agent calls (IO) with data transformation (mapping) | Agents handle understanding, CLI handles IO, TAP aggregation is pure mapping |
| [javascript.mdc](../ai/rules/javascript/javascript.mdc) | "KISS" | 3-strategy `parseStringResult`, 42-line architecture comment | Single TAP line parsing, self-explanatory architecture |
| [javascript.mdc](../ai/rules/javascript/javascript.mdc) | "YAGNI" | `extractJSONFromMarkdown`, `tryParseJSON`, markdown-fence handling | Not needed — TAP is trivially parseable |
| [javascript.mdc](../ai/rules/javascript/javascript.mdc) | "Avoid IIFEs" | N/A (separate task) | N/A |
| [javascript.mdc](../ai/rules/javascript/javascript.mdc) | "Prefer immutability" | `let result` reassigned 3 times in `executeAgent()` | `const` throughout TAP parsing |
| [tdd.mdc](../ai/rules/tdd.mdc) | "Units under test should be isolated" | Execution + evaluation in single AI call | Execution (Generator) isolated from evaluation (Judge) |
| [tdd.mdc](../ai/rules/tdd.mdc) | "Thorough - Test expected edge cases" | No failure fixture | Failure fixture with wrong prompt |
| [error-causes.mdc](../ai/rules/javascript/error-causes.mdc) | "Use `createError` with structured metadata" | Mixed `new Error()` and `createError` | Consistent `createError` (addressed in Task 5 of remediation) |

---

## 8. Conclusion

The 3-actor pipeline is not a "nice to have" refactor. It is a **course correction** that restores the implementation to its epic specification. The current two-phase extraction approach was a pragmatic workaround for output reliability that introduced the very parsing the epic said to avoid. janhesters identified this drift and proposed a clean solution.

The core argument is simple: **the test file is a prompt, not data**. The current implementation treats it as data (extract from it, parse it, template around it). The 3-actor pipeline treats it as a prompt (give it to an AI agent and let the agent understand it).

With the hybrid approach (Option B) for file I/O, `validateFilePath` retained for CLI security, and mock agents for unit tests, the practical concerns are addressed without compromising the architectural vision.

The recommended path forward:
1. Adopt the 3-actor pipeline with Option B (hybrid file access)
2. Keep `validateFilePath` for CLI security
3. Use mock agent for failure fixture unit test + separate E2E test
4. Proceed with remediation Tasks 2-7 after architecture settles

---

## References

### Project Files
- [vision.md](../vision.md) — "The standard testing framework for AI Driven Development and software agents"
- [AGENTS.md](../AGENTS.md) — Progressive discovery, vision-first
- [Epic](../tasks/archive/2026-01-22-riteway-ai-testing-framework/2026-01-22-riteway-ai-testing-framework.md) — "pass entire file to AI agent (don't parse - it's a prompt)"
- [Remediation plan](../tasks/2026-02-09-pr394-remediation.md) — 3-actor pipeline design
- [Architecture review](../tasks/2026-02-09-task1-architecture-review.md) — Concerns analysis

### Rules
- [please.mdc](../ai/rules/please.mdc) — "Do ONE THING at a time"
- [javascript.mdc](../ai/rules/javascript/javascript.mdc) — KISS, YAGNI, DRY, SDA, one job per function, avoid IIFEs, favor immutability
- [tdd.mdc](../ai/rules/tdd.mdc) — Test isolation, `Try` for error tests, thoroughness
- [error-causes.mdc](../ai/rules/javascript/error-causes.mdc) — `createError`, `errorCauses` pattern

### PR Review Comments (janhesters)
- **#28** (media-embed-test.sudo:1): Import syntax + orchestrator agent + "deterministic parsing reduces flexibility" + [Diagram 1](https://github.com/user-attachments/assets/7f45f7e9-83b3-4ebc-bbde-d295a108e9c7)
- **#29** (ai-runner.js:15): `validateFilePath` unnecessary for AI-driven import resolution
- **#30** (ai-runner.js:40): "Any parsing step is probably wrong" + [Diagram 2](https://github.com/user-attachments/assets/3e444a3f-2d88-408a-8240-fe1f51ac3326)
- **General**: Failure fixture with wrong prompt
