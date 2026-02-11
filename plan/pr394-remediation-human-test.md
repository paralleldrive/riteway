# Test: PR #394 Remediation — Manual Verification

**Persona**: Eric (Framework Author) — Expert developer verifying AI testing framework remediation
**Tech Level**: Expert | **Patience**: 8/10

## Pre-test
- Start screen recording (screencast tool of choice)
- Ensure you are on the `riteway-ai-testing-framework-implementation` branch
- Ensure Claude CLI is authenticated: `claude --version && claude -p "respond: ok"`
- Have a terminal visible for all commands

## Instructions
Read each step out loud before attempting it. Think aloud as you work — narrate what you see, what you expect, and any friction. This helps reviewers follow along in the screencast.

---

## Test 1: Automated Test Suite (Green Baseline)

**Goal**: Verify all automated tests pass after remediation

### Step 1.1 — Run TAP tests
- **Do**: `npm test`
- **Think aloud**: How many TAP tests pass? Any failures?
- **Success**: 62 TAP tests pass (`# tests 62`, `# pass 62`, `# ok`)

### Step 1.2 — Run Vitest suite
- **Do**: `npx vitest run`
- **Think aloud**: How many test files? How many tests? All green?
- **Success**: 12 test files, 186 tests pass, 0 failures

### Step 1.3 — TypeScript check
- **Do**: `npm run ts`
- **Think aloud**: Any type errors?
- **Success**: "TypeScript check complete." with no errors

### Step 1.4 — Lint check
- **Do**: `npm run lint`
- **Think aloud**: Any lint violations?
- **Success**: "Lint complete." with no warnings or errors

**Checkpoint**: All 4 checks green before proceeding.

---

## Test 2: E2E — Multi-Assertion Happy Path

**Goal**: Verify the full AI test pipeline works end-to-end with a real agent

### Step 2.1 — Run multi-assertion E2E test
- **Do**: `npx vitest run source/e2e.test.js --reporter=verbose`
- **Think aloud**: Does it connect to Claude? How long do agent calls take? Do all assertions pass?
- **Success**: All E2E test assertions pass (may show "skipped" if Claude not authenticated — that's acceptable)

### Step 2.2 — Run via CLI
- **Do**: `node bin/riteway.js ai source/fixtures/multi-assertion-test.sudo --runs 2 --threshold 50`
- **Think aloud**: What output do you see? Does it show "Running AI tests"? Does it verify authentication? Do you see assertion results?
- **Success**:
  - Shows "Verifying claude agent authentication..."
  - Shows "Agent authenticated successfully"
  - Shows 3 assertions with [PASS] or [FAIL] status
  - Produces a `.tap.md` output file

**Checkpoint**: E2E pipeline works with real agent.

---

## Test 3: E2E — Wrong Prompt (Expected Failure)

**Goal**: Verify the framework correctly reports failures for a deliberately bad prompt

### Step 3.1 — Run wrong-prompt fixture via CLI
- **Do**: `node bin/riteway.js ai source/fixtures/wrong-prompt-test.sudo --runs 2 --threshold 75`
- **Think aloud**: The prompt is deliberately terrible (all-brown, ignoring accessibility). Do the assertions fail as expected?
- **Success**:
  - Test suite reports failure (non-zero exit code)
  - Shows 4 assertions
  - Most or all assertions show [FAIL] status
  - This PROVES the framework catches bad prompts

**Checkpoint**: Framework correctly identifies poor prompt quality.

---

## Test 4: CLI Flag Testing

**Goal**: Verify CLI flags work correctly after the remediation refactoring

### Step 4.1 — Help output
- **Do**: `node bin/riteway.js ai --help`
- **Think aloud**: Is help text displayed? Does it show all flags? Is `--validate-extraction` GONE?
- **Success**: Help text shown, `--validate-extraction` not listed, `--agent-config` is listed

### Step 4.2 — Custom runs/threshold
- **Do**: `node bin/riteway.js ai source/fixtures/multi-assertion-test.sudo --runs 1 --threshold 50`
- **Think aloud**: Does it respect `--runs 1`? Only 1 run?
- **Success**: Shows "1 runs" in configuration output, completes with 1 run

### Step 4.3 — Agent config file
- **Do**: `node bin/riteway.js ai source/fixtures/multi-assertion-test.sudo --agent-config source/fixtures/claude-agent-config.json --runs 1 --threshold 50`
- **Think aloud**: Does it load the JSON config? Does it say "custom" agent?
- **Success**: Shows "agent: custom (source/fixtures/claude-agent-config.json)" in output

### Step 4.4 — Mutual exclusion (--agent + --agent-config)
- **Do**: `node bin/riteway.js ai source/fixtures/multi-assertion-test.sudo --agent opencode --agent-config source/fixtures/claude-agent-config.json`
- **Think aloud**: Should this fail with a validation error?
- **Success**: Error message: "--agent and --agent-config are mutually exclusive"

### Step 4.5 — Debug mode
- **Do**: `node bin/riteway.js ai source/fixtures/multi-assertion-test.sudo --debug --runs 1 --threshold 50`
- **Think aloud**: Do you see extra debug output?
- **Success**: Shows "Debug mode: enabled"

### Step 4.6 — Color output
- **Do**: `node bin/riteway.js ai source/fixtures/multi-assertion-test.sudo --color --runs 1 --threshold 50`
- **Think aloud**: Are [PASS]/[FAIL] indicators colored (green/red)?
- **Success**: ANSI color codes visible in terminal output

**Checkpoint**: All CLI flags work correctly.

---

## Test 5: Security — Path Traversal Prevention

**Goal**: Verify test file path validation still blocks directory traversal

### Step 5.1 — Attempt path traversal
- **Do**: `node bin/riteway.js ai ../../../etc/passwd`
- **Think aloud**: Should this be blocked by security validation?
- **Success**: Error with "SecurityError" and code "PATH_TRAVERSAL"

### Step 5.2 — Valid path accepted
- **Do**: `node bin/riteway.js ai source/fixtures/multi-assertion-test.sudo --runs 1 --threshold 50`
- **Think aloud**: Normal path should work fine
- **Success**: Test executes normally (no path error)

**Checkpoint**: Security validation intact after refactoring.

---

## Post-test
- Stop recording
- What was confusing?
- What worked well?
- Any unexpected behavior?
- Rate overall confidence: would you merge this PR?

---

## Need Professional User Testing?

**Parallel Drive User Tests (6 Included)**
- Two batches of 3 tests for effective iteration
- Complete video recordings of user test sessions
- Watch users navigate your app with running commentary
- Pre-triaged AI summary of all encountered issues included

Purchase 6 user tests: https://buy.stripe.com/9B6fZ53M11jm6CqeCRcwg0a
