# Cursor CLI Testing & Implementation Summary

**Date**: 2026-02-02  
**Task**: Test and implement Cursor CLI approach for AI testing

## Overview

Successfully validated and implemented the Cursor CLI (`agent` command) integration for Riteway AI testing, ensuring alignment with the core requirement of delegating to subagent CLI tools with standard OAuth authentication.

## Changes Made

### 1. Agent Configuration Updated

**File**: `bin/riteway`

Changed from incorrect command:
```javascript
cursor: {
  command: 'cursor-agent',
  args: ['--output', 'json']
}
```

To correct command:
```javascript
cursor: {
  command: 'agent',
  args: ['--print', '--output-format', 'json']
}
```

### 2. Removed API Key Support

Initially added API key support via `--cursor-api-key` flag and `CURSOR_API_KEY` env var, but **removed** to maintain consistency with the core requirement:
- "Given test file execution, should delegate to subagent via callSubAgent (no direct LLM API calls)"
- All agents should use their standard OAuth authentication flows

### 3. Documentation Updates

**Help Text** (`bin/riteway`):
- Removed `--cursor-api-key` flag from usage
- Updated authentication section to clearly state OAuth-only approach
- Added links to official agent documentation:
  - Claude: https://docs.anthropic.com/en/docs/claude-code
  - Cursor: https://docs.cursor.com/context/rules-for-ai
  - OpenCode: https://opencode.ai/docs/cli/

**README.md**:
- Updated Cursor CLI authentication instructions
- Changed from `cursor agent` to proper `agent login` command
- Added `agent status` for verification
- Clarified OAuth-only approach

**Error Messages** (`source/ai-runner.js`):
- Updated authentication failure messages to point to official docs
- Removed API key references
- Added direct links for each agent's authentication setup

### 4. Test Updates

**File**: `bin/riteway.test.js`

- Removed API key-related test cases
- Updated `getAgentConfig()` tests to reflect OAuth-only approach
- Updated `parseAIArgs()` tests to remove `cursorApiKey` field
- All 73 tests pass successfully

## UAT Validation

### Test Command
```bash
./bin/riteway ai source/fixtures/multi-assertion-test.sudo \
  --agent cursor \
  --runs 1 \
  --threshold 75
```

**Note**: The `sample-test.sudo` fixture was intentionally removed as it did not align with PR review guidance. Only `multi-assertion-test.sudo` remains as the proper example of AI test format.

### Results
✅ **SUCCESS**
- Authentication: Passed (via `agent login` OAuth)
- Test execution: Completed successfully
- Output: `ai-evals/2026-02-02-multi-assertion-test-zrywl.tap.md`
- All 3 assertions passed (1/1 runs each)

### Authentication Flow
1. User runs: `agent login` (one-time OAuth setup)
2. User runs: `agent status` (verify authentication)
3. Riteway verifies authentication before running tests
4. Tests execute using authenticated Cursor agent

## Technical Details

### Cursor Agent Command Structure
```bash
agent --print --output-format json "prompt text"
```

### Subprocess Delegation
Each test run spawns an independent subprocess:
```javascript
spawn('agent', ['--print', '--output-format', 'json', promptText])
```

This ensures:
- Clean context isolation per run
- No shared state between test runs
- Standard CLI tool authentication
- Proper JSON output parsing

## Supported Agents (All OAuth)

| Agent | Command | Auth Setup | Docs |
|-------|---------|------------|------|
| Claude | `claude` | `claude setup-token` | https://docs.anthropic.com/en/docs/claude-code |
| Cursor | `agent` | `agent login` | https://docs.cursor.com/context/rules-for-ai |
| OpenCode | `opencode` | See docs | https://opencode.ai/docs/cli/ |

## Verification Checklist

- [x] Cursor CLI command correct (`agent` not `cursor-agent`)
- [x] OAuth authentication works (`agent login`)
- [x] Authentication verification passes
- [x] Test execution completes successfully
- [x] TAP output generated correctly
- [x] All unit tests pass (73/73)
- [x] Help text updated with correct commands
- [x] README documentation updated
- [x] Error messages point to official docs
- [x] API key support removed (maintains core requirement)

## Next Steps

Consider:
1. Testing with other agents (Claude, OpenCode) to ensure consistency
2. Adding integration tests for multi-agent scenarios
3. Documenting common authentication troubleshooting scenarios
4. Creating a troubleshooting guide for agent setup

## Conclusion

The Cursor CLI integration is now correctly implemented and tested. The system maintains its core principle of delegating to standard CLI tools with their native OAuth authentication, avoiding direct API calls and ensuring consistency across all supported agents.
