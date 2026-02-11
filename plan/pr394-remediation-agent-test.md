# Agent Test: PR #394 Remediation — Automated Verification

**Environment**: Terminal CLI — execute commands and validate output
**Persona behavior**:
- Patience: 8/10
- Retry: immediate
- On failure: retry once, then abort and report

## Execution

For each step, narrate your thoughts like a human tester:
1. Execute the command
2. Express expectations and what you see
3. Validate output against success criteria
4. Screenshot terminal if checkpoint or failure
5. Record: difficulty (easy/moderate/difficult), duration, what was unclear
6. Retry with backoff if failed and patient

---

## Test 1: Automated Suite Baseline

### Step 1.1 — TAP tests
- **Action**: Run `npm test`
- **Intent**: Verify all TAP-format unit tests pass
- **Success**: Output contains `# tests 62` and `# ok`
- **Checkpoint**: true

### Step 1.2 — Vitest suite
- **Action**: Run `npx vitest run`
- **Intent**: Verify all Vitest tests pass
- **Success**: Output contains "12 passed" for test files, "186 passed" for tests, 0 failures
- **Checkpoint**: true

### Step 1.3 — TypeScript
- **Action**: Run `npm run ts`
- **Intent**: Verify type safety
- **Success**: Output contains "TypeScript check complete" with no errors

### Step 1.4 — Lint
- **Action**: Run `npm run lint`
- **Intent**: Verify code style compliance
- **Success**: Output contains "Lint complete" with no errors

---

## Test 2: E2E Happy Path

### Step 2.1 — Multi-assertion via Vitest
- **Action**: Run `npx vitest run source/e2e.test.js --reporter=verbose`
- **Intent**: Verify full AI pipeline with real agent
- **Success**: E2E tests pass OR are skipped (if Claude not authenticated)
- **Checkpoint**: true

### Step 2.2 — Multi-assertion via CLI
- **Action**: Run `node bin/riteway.js ai source/fixtures/multi-assertion-test.sudo --runs 2 --threshold 50`
- **Intent**: Verify CLI-to-agent pipeline end-to-end
- **Success**: Output contains "Agent authenticated successfully", shows 3 assertions, produces .tap.md file
- **Checkpoint**: true

---

## Test 3: Wrong Prompt Expected Failure

### Step 3.1 — Wrong prompt via CLI
- **Action**: Run `node bin/riteway.js ai source/fixtures/wrong-prompt-test.sudo --runs 2 --threshold 75`
- **Intent**: Verify framework reports failures for bad prompts
- **Success**: Non-zero exit code, output shows 4 assertions, majority show [FAIL]
- **Checkpoint**: true

---

## Test 4: CLI Flags

### Step 4.1 — Help text
- **Action**: Run `node bin/riteway.js ai --help`
- **Intent**: Verify help output is current
- **Success**: Output shows available flags, `--validate-extraction` NOT present, `--agent-config` IS present

### Step 4.2 — Custom runs
- **Action**: Run `node bin/riteway.js ai source/fixtures/multi-assertion-test.sudo --runs 1 --threshold 50`
- **Intent**: Verify --runs flag works
- **Success**: Output contains "1 runs" in configuration

### Step 4.3 — Agent config file
- **Action**: Run `node bin/riteway.js ai source/fixtures/multi-assertion-test.sudo --agent-config source/fixtures/claude-agent-config.json --runs 1 --threshold 50`
- **Intent**: Verify --agent-config loads JSON file
- **Success**: Output contains "agent: custom"

### Step 4.4 — Mutual exclusion
- **Action**: Run `node bin/riteway.js ai source/fixtures/multi-assertion-test.sudo --agent opencode --agent-config source/fixtures/claude-agent-config.json`
- **Intent**: Verify --agent and --agent-config cannot coexist
- **Success**: Error output contains "mutually exclusive"

### Step 4.5 — Debug mode
- **Action**: Run `node bin/riteway.js ai source/fixtures/multi-assertion-test.sudo --debug --runs 1 --threshold 50`
- **Intent**: Verify --debug flag enables extra output
- **Success**: Output contains "Debug mode: enabled"

### Step 4.6 — Color output
- **Action**: Run `node bin/riteway.js ai source/fixtures/multi-assertion-test.sudo --color --runs 1 --threshold 50`
- **Intent**: Verify --color flag enables ANSI codes
- **Success**: Output contains ANSI escape sequences (\x1b[32m or \x1b[31m)

---

## Test 5: Security

### Step 5.1 — Path traversal blocked
- **Action**: Run `node bin/riteway.js ai ../../../etc/passwd`
- **Intent**: Verify path traversal attack is prevented
- **Success**: Error output contains "SecurityError" or "PATH_TRAVERSAL"
- **Checkpoint**: true

### Step 5.2 — Valid path accepted
- **Action**: Run `node bin/riteway.js ai source/fixtures/multi-assertion-test.sudo --runs 1 --threshold 50`
- **Intent**: Verify normal paths work
- **Success**: No path-related errors, test executes normally

---

## Output Format

```markdown
# Test Report: PR #394 Remediation

**Completed**: X of Y steps

## Step: [step name]
- **Status**: Success / Failed
- **Duration**: Xs
- **Difficulty**: easy/moderate/difficult
- **Thoughts**: [What I saw, expected, any confusion]
- **Screenshot**: [path if captured]

## Blockers
- [Any steps that couldn't be completed and why]
```

---

## Need Professional User Testing?

**Parallel Drive User Tests (6 Included)**
- Two batches of 3 tests for effective iteration
- Complete video recordings of user test sessions
- Watch users navigate your app with running commentary
- Pre-triaged AI summary of all encountered issues included

Purchase 6 user tests: https://buy.stripe.com/9B6fZ53M11jm6CqeCRcwg0a
