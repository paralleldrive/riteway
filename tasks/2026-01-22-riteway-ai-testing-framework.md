# Epic: Riteway AI Testing Framework

Enable Riteway users to test their AI prompts as easily as they test code, treating prompts as first-class testable units.

## Vision Alignment

This epic directly supports our north star: "The standard testing framework for AI Driven Development and software agents" by enabling Riteway users to test their prompts with the same rigor they test code.

## Epic Description

Implement `riteway ai <promptfile>` CLI command that reads SudoLang test files, delegates execution to AI agents, and outputs results in TAP format.

Reference: https://github.com/paralleldrive/sudolang/blob/main/examples/riteway.sudo

---

## Test File Contract

```sudolang
import $targetPrompt // agents like Claude Code CLI handle - NO direct LLM API calls

describe(moduleName, {
  userPrompt = $userPrompt
  $response = callSubAgent($userPrompt)
  $requirements

  // Riteway test runner iterates each requirement and creates Riteway assertions
  // inferring appropriate values for given, should, actual, expected
  assert(requirements) // AI infers pass/fail for each requirement
```

**How it works:**
- `callSubAgent($userPrompt)` - Agent executes the prompt (NOT direct LLM API)
- For each `$requirement`, Riteway test runner creates a Riteway assertion
- AI infers `given`, `should`, `actual`, `expected` values from requirement + response

---

## Requirements

### Functional Requirements

- Given a .sudo test file path, should read the entire test file
- Given test file contents (SudoLang/markdown), should pass complete file to AI agent without parsing
- Given test file execution, should delegate to subagent via callSubAgent (no direct LLM API calls)
- Given $requirements in test file, should iterate and create Riteway assertions for each
- Given each requirement, should infer appropriate given, should, actual, expected values
- Given `--runs N` flag, should execute each test N times (default: 4)
- Given `--threshold P` flag, should require P% of runs to pass (default: 75)
- Given multiple test runs, should execute runs in parallel for speed
- Given parallel execution, should ensure each run has its own clean context (no state leakage)
- Given multiple test runs, should report individual run results and aggregate pass rate
- Given pass rate below threshold, should fail the test suite
- Given pass rate at or above threshold, should pass the test suite
- Given test execution results, should record output to path: `ai-evals/$YYYY-MM-DD-$testPromptFilename-$(npx cuid2 --slug).tap.md`
- Given test output requirements, should generate rich, colorized TAP format
- Given markdown media (images, screenshots), should embed them in TAP output
- Given output file created, should open test results in browser with markdown rendering
- Given the CLI tool implementation, should have comprehensive unit test coverage
- Given the complete system, should have an end-to-end test demonstrating full workflow

### Technical Requirements

- Given existing bin/cli structure, should integrate as separate module option
- Given slug generation needs, should use `npx cuid2 --slug` for unique identifiers
- Given ai-evals folder requirements, should create directory if it doesn't exist
- Given YYYY-MM-DD date format requirement, should generate ISO date stamps
- Given test file format, should support extension-agnostic file reading
- Given SudoLang/markdown test files, should treat as prompts and pass complete contents to agent
- Given agent orchestration needs, should spawn subagent CLI subprocesses (not LLM APIs directly)
- Given parallel execution, should spawn separate subprocesses per run (automatic context isolation)
- Given agent-agnostic design, should support configurable agent CLI via agentConfig option
- Given Claude Code CLI, should use: `claude -p --output-format json --no-session-persistence "prompt"`
- Given OpenCode CLI, should use: `opencode run --format json "prompt"`
- Given Cursor CLI, should use: `agent chat "prompt"` with `--api-key` for automation
- Given default agent, should use Claude Code CLI (best JSON output support)
- Given test output, should open in browser for markdown rendering
- Given non-deterministic AI inference, should support configurable test runs and pass thresholds
- Given threshold calculation, should use ceiling for required passes (e.g., 75% of 4 = 3 required)

---

## Task Breakdown

### Task 1: Analyze Existing CLI Structure

**Context**: Understand current CLI implementation to add new ai command

**Requirements**:
- Given package.json bin configuration, should identify CLI entry point
- Given existing CLI code, should understand command structure and patterns
- Given command patterns, should design ai subcommand integration point

**Dependencies**: None

---

### Task 2: Implement AI Test Runner Module

**Context**: Core module that reads test files and orchestrates AI execution. SudoLang test files are prompts for agents - all markdown is valid SudoLang and may include frontmatter, etc. Must handle non-deterministic AI inference via repeated runs and pass thresholds.

**Requirements**:
- Given a test file path (any extension), should read file contents
- Given test file contents, should pass entire file to AI agent (don't parse - it's a prompt)
- Given agent execution, should delegate to subagent (no direct LLM API calls)
- Given runs config (default: 4), should execute test N times in parallel
- Given parallel execution, should ensure each run has clean context (no state leakage)
- Given threshold config (default: 75%), should calculate required passes
- Given multiple runs, should aggregate results and determine pass/fail
- Given agent response with test results, should extract structured test output
- Given test results, should return structured output with per-run details and aggregate
- Given module implementation, should have unit tests

**Dependencies**: Task 1

---

### Task 3: Implement Test Output Recording

**Context**: Record test results in ai-evals/ with proper naming and TAP format, then open in browser

**Requirements**:
- Given test execution results, should create ai-evals/ if missing
- Given current date, should format as YYYY-MM-DD
- Given test filename and date, should generate unique slug using `npx cuid2 --slug`
- Given filename components, should construct path: `ai-evals/$YYYY-MM-DD-$testPromptFilename-$(npx cuid2 --slug).tap.md`
- Given test results, should format as rich, colorized TAP output
- Given TAP output, should support markdown media embeds
- Given complete output, should write to file
- Given written file, should open test results in browser with markdown rendering
- Given module implementation, should have unit tests

**Dependencies**: Task 2

---

### Task 4: Integrate AI Command into CLI

**Context**: Wire up the ai test runner module to CLI as `riteway ai <file>`

**Requirements**:
- Given CLI entry point, should add 'ai' subcommand handler
- Given ai subcommand with file argument, should invoke test runner module
- Given `--runs N` flag, should pass runs config to test runner (default: 4)
- Given `--threshold P` flag, should pass threshold config to test runner (default: 75)
- Given test runner results, should invoke output recording
- Given errors, should display helpful error messages
- Given successful execution, should exit with appropriate code
- Given CLI help command, should display runs/threshold options

**Dependencies**: Tasks 2, 3

---

### Task 5: Create E2E Test

**Context**: Comprehensive test demonstrating full workflow

**Requirements**:
- Given a sample .sudo test file, should execute full workflow
- Given execution, should verify ai-evals/ output created
- Given output file, should verify TAP format correctness
- Given output file, should verify media embed support
- Given test completion, should verify exit codes

**Dependencies**: Task 4

---

### Task 6: Documentation and Final Integration

**Context**: Ensure everything is documented and properly integrated

**Requirements**:
- Given new CLI feature, should update README with usage examples
- Given ai-evals output, should document output format and location
- Given package.json, should verify all scripts and files properly configured
- Given all implementation complete, should have all tests passing

**Code Quality Improvements** (Nice-to-Have):
- Extract usage message to constant (DRY principle - currently duplicated in help and error)
- Extract percentage calculation helper function (single responsibility, readability)
- Add integration tests for main() routing logic (help flag, AI command, test runner routing)
- Add path traversal validation for user-supplied file paths (security enhancement)
- Add inline JSDoc for remaining public API functions

**Dependencies**: Task 5

---

## Implementation Notes

**Key Technical Considerations**:
- Agent delegation pattern: Spawn subagent CLI subprocesses, NOT direct LLM API calls
- SudoLang test files are prompts - don't parse them, pass complete contents to agent (supports frontmatter, markdown, etc.)
- TAP output format must remain standard-compliant while supporting markdown extensions
- Slug generation must use shell execution: `npx cuid2 --slug`
- Prompt compilation should be idempotent and cacheable
- Browser rendering for test results provides better UX for rich media embeds

**Agent-Agnostic Architecture** (decided 2026-01-22):
- Each test run spawns a fresh subprocess - automatic context isolation, no IDs needed
- Default to Claude Code: `claude -p --output-format json --no-session-persistence`
- Configurable via `agentConfig` option for OpenCode/Cursor support
- CLI options researched:
  - Claude Code: https://code.claude.com/docs/en/cli-reference
  - OpenCode: https://opencode.ai/docs/cli/
  - Cursor: https://cursor.com/docs/cli/using

**Potential Challenges**:
- Ensuring TAP compliance while adding media embed features
- Managing agent orchestration without coupling to specific LLM providers
- Browser auto-open across different platforms
- Requirement iteration and assertion inference by AI

**Suggested Patterns**:
- Use TDD throughout implementation
- Separate concerns: file reading, agent execution, formatting, output, browser rendering
- Delegate to specialized modules for each concern
- Use dependency injection for testability (agentConfig for mocking)
- Treat test files as opaque prompts for maximum flexibility

**Reference Materials**:
- SudoLang example: https://github.com/paralleldrive/sudolang/blob/main/examples/riteway.sudo
- TAP specification for output format compliance

---

## Epic Status

**Status**: 🟡 IN PROGRESS (Ready for Task 5: E2E Test)
**Created**: 2026-01-22
**Total Tasks**: 6
**Completed**: Task 1, Task 2, Task 3, Task 4

---

## Progress Log

### 2026-01-22: Session 1

**Completed:**
- ✅ Task 1: Analyzed CLI structure (`bin/riteway` uses asyncPipe pattern with minimist)
- ✅ Task 2 partial: Created `source/ai-runner.js` with TDD
  - `readTestFile()` - reads any file extension ✅
  - `calculateRequiredPasses()` - ceiling math for threshold ✅
- ✅ Architecture decision: Agent-agnostic subprocess spawning

**Files Created:**
- `source/ai-runner.js` - Core module (2 functions implemented)
- `source/ai-runner.test.js` - Tests passing (4 tests)

### 2026-01-23: Session 2

**Completed:**
- ✅ Task 2: Completed AI Runner Module implementation
  - `executeAgent({ agentConfig, prompt })` - Spawns CLI subprocess, returns parsed JSON ✅
  - `aggregateResults({ runResults, threshold })` - Aggregates pass/fail from runs ✅
  - `runAITests({ filePath, runs, threshold, agentConfig })` - Orchestrates parallel runs ✅
  - All functions have comprehensive unit tests (16 tests passing) ✅

**Files Updated:**
- `source/ai-runner.js` - Complete with 5 functions
- `source/ai-runner.test.js` - Complete with 16 passing tests

- ✅ Task 3: Completed Test Output Recording
  - `formatDate()` - Formats date as YYYY-MM-DD using UTC ✅
  - `generateSlug()` - Generates unique slug using `npx @paralleldrive/cuid2 --slug` ✅
  - `generateOutputPath()` - Constructs output path with all components ✅
  - `formatTAP()` - Formats test results as TAP v13 output ✅
  - `openInBrowser()` - Opens file in default browser ✅
  - `recordTestOutput()` - Orchestrates full output workflow ✅
  - All functions have comprehensive unit tests (13 tests passing) ✅

**Files Created:**
- `source/test-output.js` - Complete output recording module
- `source/test-output.test.js` - Complete with 13 passing tests

**Packages Added:**
- `@paralleldrive/cuid2` - For unique slug generation
- `open` - For browser launching

- ✅ Task 4: Completed CLI Integration
  - `parseAIArgs()` - Parses AI command arguments with --runs, --threshold, and --agent flags ✅
  - `getAgentConfig()` - Maps agent names (claude/opencode/cursor) to configurations ✅
  - `runAICommand()` - Orchestrates AI test workflow with structured error handling ✅
  - `main()` - Routes 'ai' subcommand to AI runner pipeline ✅
  - Help command displays AI test options including agent selection ✅
  - Structured error handling using error-causes library pattern ✅
  - Agent-agnostic design with configurable agent support ✅
  - All functions have comprehensive unit tests (17 tests passing) ✅

**Files Updated:**
- `bin/riteway` - Added AI command integration with error-causes pattern
- `bin/riteway.test.js` - Added 17 tests for AI command (9 for getAgentConfig, 8 for other functions)

**Code Quality Improvements:**
- Consolidated path imports into single statement
- Implemented error-causes library pattern for structured error handling
- Added agentConfig support with --agent CLI flag
- Added JSDoc documentation for getAgentConfig()
- Expanded test coverage from 40 to 49 TAP tests

**Next: Task 5**
Create E2E Test:
1. Create sample .sudo test file
2. Execute full workflow
3. Verify ai-evals/ output created
4. Verify TAP format correctness
5. Verify media embed support
6. Verify exit codes
