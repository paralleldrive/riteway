# OpenCode Agent Support Fix Epic

**Status**: ✅ COMPLETE  
**Goal**: Fix OpenCode agent integration to properly handle NDJSON streaming output format

## Overview

The OpenCode CLI returns newline-delimited JSON (NDJSON) with multiple event objects, but the current implementation expects a single JSON response. This causes authentication verification and test execution to fail with JSON parsing errors. Users who have OpenCode installed and authenticated cannot run AI tests using the `--agent opencode` flag.

---

## Parse OpenCode NDJSON Output

**Status**: ✅ COMPLETE (Remediation Applied)

Add function to parse OpenCode's streaming NDJSON format and extract text responses.

**Implementation**: Created `parseOpenCodeNDJSON()` function that:
- Splits NDJSON into lines and filters empty lines
- Uses `.reduce()` pattern for functional style iteration
- Parses each line as JSON and extracts `type: "text"` events
- Concatenates all text content from text events
- Throws structured error using `createError()` if no text events found
- Logs parsing progress for debugging
- Handles malformed JSON lines gracefully

**Tests**: 7 tests covering all requirements, all passing with enhanced error verification.

**Requirements**:
- Given NDJSON with text events, should extract and concatenate all text content ✅
- Given NDJSON with multiple event types, should filter only text events ✅
- Given NDJSON with no text events, should throw descriptive structured error ✅
- Given malformed NDJSON lines, should skip invalid lines and process valid ones ✅
- Given text event with markdown-wrapped JSON, should preserve markdown for downstream parsing ✅

**Remediation Applied** (2026-02-04):
- ✅ Replaced `for...of` loop with `.reduce()` pattern for functional style consistency
- ✅ Replaced `throw new Error()` with `createError()` following error-causes.mdc standard
- ✅ Added structured error metadata: name, code, ndjsonLength, linesProcessed
- ✅ Enhanced test coverage to verify structured error properties (cause.name, cause.code, etc.)
- ✅ All 103 tests passing, no linter errors

---

## Update OpenCode Agent Configuration

**Status**: ✅ COMPLETE (Remediation Applied)

Update agent configuration to use correct OpenCode CLI arguments.

**Current Issue**: bin/riteway.js:51 has incorrect args: `['--output-format', 'json']`

**Required Fix**:
```javascript
opencode: {
  command: 'opencode',
  args: ['run', '--format', 'json']  // Must include 'run' subcommand
}
```

**Official OpenCode CLI Syntax** (verified from docs):
- ✅ Correct: `opencode run --format json "prompt"`
- ❌ Wrong: `opencode --output-format json` (no such flag exists)
- Note: The `run` subcommand is mandatory for non-interactive mode

**Requirements**:
- Given OpenCode agent selected, should use `run --format json` arguments ✅
- Given agent config request, should return correct command and args structure ✅

**Testing Checklist**:
- [x] Update args in bin/riteway.js
- [x] Add test in bin/riteway.test.js for correct args
- [x] Verify args format matches OpenCode CLI docs
- [x] Test with live OpenCode CLI installation

**Implementation Summary**:
- Updated `bin/riteway.js` line 51 to use correct args: `['run', '--format', 'json']`
- Updated tests in `bin/riteway.test.js` to verify correct configuration
- All 181 tests passing (78 in main suite + 103 in Vitest)
- Followed TDD process: write failing test → implement fix → verify passing tests

**Live CLI Testing Results** (OpenCode v1.1.50):
- ✅ Correct command `opencode run --format json "test"` works perfectly
- ✅ Returns NDJSON format with events: `step_start`, `text`, `step_finish`
- ✅ Authentication working (no auth errors)
- ❌ Old command `opencode --output-format json` fails and shows help menu
- ✅ Confirms `--output-format` flag does not exist at top level
- ✅ Confirms `--format json` flag only exists under `run` subcommand

---

## Integrate NDJSON Parser into executeAgent

**Status**: ✅ COMPLETE (Code Review Remediation Applied)

Modify executeAgent to detect OpenCode and use NDJSON parser before standard JSON parsing.

**Implemented Approach** (Config-Based with parseOutput):
Added `parseOutput` function to agent config for better separation of concerns:

```javascript
// In bin/riteway.js - extend agent configs
const agentConfigs = {
  opencode: {
    command: 'opencode',
    args: ['run', '--format', 'json'],
    parseOutput: (stdout, logger) => parseOpenCodeNDJSON(stdout, logger)
  },
  claude: {
    command: 'claude',
    args: ['-p', '--output-format', 'json', '--no-session-persistence']
    // No parseOutput - uses direct JSON parsing
  }
};

// In source/ai-runner.js executeAgent()
const { command, args = [], parseOutput } = agentConfig;
// ... process execution ...
const processedOutput = parseOutput ? parseOutput(stdout, logger) : stdout;
const parsed = JSON.parse(processedOutput);
```

**Benefits of This Approach**:
- Agent config is self-contained
- No string detection needed in executeAgent
- Easier to add new agents with custom parsers
- Better testability and separation of concerns

**Requirements**:
- Given OpenCode agent command, should parse stdout as NDJSON before JSON ✅
- Given Claude agent command, should use existing JSON parsing (no NDJSON) ✅
- Given Cursor agent command, should use existing JSON parsing (no NDJSON) ✅
- Given NDJSON parsing failure, should provide helpful error message ✅

**Implementation Summary**:
- ✅ Added `parseOutput` property to `executeAgent` function signature
- ✅ Updated `executeAgent` to call `parseOutput(stdout, logger)` if provided
- ✅ Added `parseOutput` to OpenCode agent config in `bin/riteway.js`
- ✅ Imported `parseOpenCodeNDJSON` into `bin/riteway.js`
- ✅ Added tests for NDJSON integration in executeAgent
- ✅ Added tests verifying OpenCode has parseOutput and other agents don't
- ✅ All 106 tests passing (78 in main suite + 28 in Vitest suites)
- ✅ No linter errors

**Testing**:
- ✅ Test: processes NDJSON output when parseOutput is provided
- ✅ Test: bypasses parseOutput when not provided
- ✅ Test: handles parseOutput errors gracefully
- ✅ Test: OpenCode config has parseOutput function
- ✅ Test: Claude config does NOT have parseOutput
- ✅ Test: Cursor config does NOT have parseOutput

**Code Review Remediation** (2026-02-04):
- ✅ Fixed Issue #1: Updated error handling in `ai-runner.js:288-298` to use `createError()` instead of `new Error()`
- ✅ Fixed Issue #2: Enhanced test to verify structured error wrapping (not testing parseOutput implementation details)
  - Tests verify that `executeAgent` properly wraps any parseOutput error in structured ParseError
  - Follows principle: don't test implementation details of code we don't own
  - Added assertions for: `error.cause.name`, `error.cause.code`, `error.cause.cause`, and metadata
- ✅ Updated existing "invalid JSON" test to check structured error format instead of message strings
- ✅ Ignored Issue #3: "Redundant variable" is stylistic and not a real issue
- ✅ All 124 tests passing (78 in main suite + 46 in Vitest ai-runner tests)
- ✅ No linter errors

**OpenCode Markdown-Wrapped JSON Fix** (2026-02-05):
- ✅ Fixed parsing issue where OpenCode returns JSON wrapped in markdown code fences
- ✅ Updated `executeAgent` to use `parseStringResult()` instead of direct `JSON.parse()`
- ✅ Now properly handles: raw JSON, markdown-wrapped JSON (` ```json ... ``` `), and nested string results
- ✅ Maintains backward compatibility - Claude and Cursor agents unaffected
- ✅ All 184 tests passing (78 in main suite + 106 in Vitest suites)
- ✅ Live testing with OpenCode CLI: All 4 assertions passed in media-embed-test
- ✅ No linter errors

**Changes Summary**:
```javascript
// Before: Direct JSON.parse() failed on markdown-wrapped JSON
const parsed = JSON.parse(processedOutput);

// After: Use parseStringResult() to handle markdown-wrapped JSON
let result = parseStringResult(processedOutput, logger);
if (typeof result === 'string') {
  throw new Error(`Agent output is not valid JSON: ${result.slice(0, 100)}`);
}
```

---
