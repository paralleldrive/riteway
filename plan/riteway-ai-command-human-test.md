# Test: Riteway AI Command — Developer Workflow

**Persona**: Alex — Senior Developer adopting AI-driven testing

**Role**: Full-stack engineer with TDD discipline, extending prompt testing to AI outputs  
**Tech Level**: Expert  
**Patience**: 8/10  
**Goals**:
- Run AI prompt tests with the same confidence as code tests
- Catch prompt regressions before they ship
- Get reproducible pass/fail results from non-deterministic AI

---

## Pre-test

- [ ] Start screen recording
- [ ] Ensure `riteway` is installed: `npm i -g riteway` (or use local `npx riteway`)
- [ ] Ensure Claude CLI is authenticated: `claude --version`
- [ ] Create a clean working directory for this session
- [ ] Have a terminal and text editor ready

---

## Instructions

Read each step out loud before attempting it. Think aloud as you work — this helps reviewers follow along.

---

## Shared Test Fixtures

Create these files once in your working directory before starting:

```sh
# Companion prompt file
echo "You are a professional greeter assistant." > greet.mdc

# Basic .sudo test file
cat > greet.test.sudo << 'EOF'
import greet.mdc

describe(Greeter, {
  userPrompt = "Say hello to Alex in a friendly, professional tone."
  $response = callSubAgent($userPrompt)
  $requirements = [
    "Given a name, should address the user by name",
    "Given a professional context, should use respectful language",
    "Given a greeting request, should include a greeting word like hello or hi"
  ]
  assert($requirements)
})
EOF
```

---

## Happy Path

---

### Step 1: Run with default settings

**Goal**: Execute the AI command with no extra flags and verify output format

**Do**:
```sh
riteway ai greet.test.sudo
```

**Think aloud**: What does the output look like? Can you tell which assertions are passing/failing? Does the format feel like a test runner you'd trust in CI?

**Success**:
- Header line shows: `Running AI tests: greet.test.sudo`
- Configuration line shows: `4 runs, 75% threshold, 4 concurrent, 300000ms timeout, agent: claude`
- Each of the 3 requirements appears with `[PASS]` or `[FAIL]` and run counts, e.g. `(3/4 runs)`
- `ai-evals/` directory is created automatically
- A file named `YYYY-MM-DD-greet.test.sudo-<slug>.tap.md` appears in `ai-evals/`
- Exit code `0` if all assertions pass; `1` if any fall below threshold

---

### Step 2: Inspect the ai-evals/ output file

**Goal**: Verify the recorded TAP output is written with the correct naming and content

**Do**:
```sh
ls ai-evals/
cat ai-evals/$(ls ai-evals/ | head -1)
```

**Think aloud**: Is the filename self-explanatory? Does the TAP content match what you saw in the terminal? Would this file be useful to check into git or share with a teammate?

**Success**:
- Filename follows: `YYYY-MM-DD-greet.test.sudo-<slug>.tap.md`
- Date prefix matches today (`2026-03-09`)
- File contains TAP-formatted output with per-assertion results and a summary
- Browser opens automatically (or the file path is printed clearly so you can open it)

---

### Step 3: `--color` flag

**Goal**: Verify colorized terminal output

**Do**:
```sh
riteway ai --color greet.test.sudo
```

**Think aloud**: Are the colors helpful at a glance? Is `[PASS]` visually distinct from `[FAIL]`?

**Success**:
- `[PASS]` lines appear in green
- `[FAIL]` lines appear in red
- Output is otherwise identical to Step 1
- A new file is created in `ai-evals/` (total should be 2)

---

### Step 4: `--runs` flag

**Goal**: Verify custom run counts are respected

**Do**:
```sh
riteway ai --runs 2 greet.test.sudo
```

**Think aloud**: Does it complete faster? Do the run counts in the output reflect `X/2 runs`?

**Success**:
- Each assertion shows `(X/2 runs)` format
- Command completes noticeably faster than the default 4-run execution
- A new file created in `ai-evals/`

---

### Step 5: `--threshold` flag

**Goal**: Verify custom pass threshold is applied

**Do**:
```sh
riteway ai --runs 2 --threshold 50 greet.test.sudo
```

**Think aloud**: With 50% threshold and 2 runs, only 1 of 2 runs needs to pass per assertion. Does the output reflect that lower bar?

**Success**:
- Configuration line shows `50% threshold`
- Assertions that previously hovered near 50% may now pass
- Exit code reflects the 50% threshold, not the default 75%

---

### Step 6: `--timeout` flag

**Goal**: Verify custom per-run timeout is accepted and shown

**Do**:
```sh
riteway ai --timeout 60000 greet.test.sudo
```

**Think aloud**: Does the configuration line reflect `60000ms timeout`? Does the run behave normally?

**Success**:
- Configuration line shows `60000ms timeout`
- Tests execute normally (no premature timeout with a reasonable prompt)

---

### Step 7: `--concurrency` flag

**Goal**: Verify custom concurrency is accepted and shown

**Do**:
```sh
riteway ai --runs 4 --concurrency 2 greet.test.sudo
```

**Think aloud**: Does the configuration line show `2 concurrent`? Does execution still produce correct results?

**Success**:
- Configuration line shows `2 concurrent`
- All assertions are evaluated correctly with fewer parallel workers

---

### Step 8: `--agent` flag with a non-default built-in

**Goal**: Verify switching to a different built-in agent

**Do**:
```sh
riteway ai --agent opencode greet.test.sudo
```

**Think aloud**: Does the configuration line show `agent: opencode`? Does it fail gracefully if opencode is not installed?

**Success**:
- Configuration line shows `agent: opencode`
- If opencode is installed and authenticated: tests run
- If opencode is not installed: a clear authentication or process error is shown (not a silent fallback to claude)

---

### Step 9: `--agent-config` with a valid custom config file

**Goal**: Verify loading an agent from a flat JSON config file

**Do**:
1. Create `my-agent.json`:
   ```json
   {
     "command": "claude",
     "args": ["-p", "--output-format", "json", "--no-session-persistence"],
     "outputFormat": "json"
   }
   ```
2. Run:
   ```sh
   riteway ai --agent-config ./my-agent.json greet.test.sudo
   ```

**Think aloud**: Does the configuration line show `agent: custom (./my-agent.json)`? Does it behave the same as the default claude run?

**Success**:
- Configuration line shows `custom (./my-agent.json)`
- Tests execute and produce results identical to the default claude run

---

### Step 10: Project-level `riteway.agent-config.json` registry

**Goal**: Verify the project registry is picked up automatically when present

**Do**:
1. Create `riteway.agent-config.json` in the working directory:
   ```json
   {
     "my-claude": {
       "command": "claude",
       "args": ["-p", "--output-format", "json", "--no-session-persistence"],
       "outputFormat": "json"
     }
   }
   ```
2. Run with the registry entry name:
   ```sh
   riteway ai --agent my-claude greet.test.sudo
   ```

**Think aloud**: Did it pick up the config without needing `--agent-config`? Does the config line reflect the resolved agent?

**Success**:
- Tests execute using `my-claude` from the registry
- Configuration line shows `agent: my-claude`

3. Clean up before continuing:
   ```sh
   rm riteway.agent-config.json
   ```

---

## Validation Errors

---

### Step 11: Missing file path argument

**Goal**: Verify helpful error when no test file is provided

**Do**:
```sh
riteway ai
```

**Think aloud**: Does the error message tell you what's missing? Does `--help` show the correct usage?

**Success**:
- Error message references "file path" or similar
- Exit code is non-zero

Also check help text:
```sh
riteway ai --help
```

**Success**:
- Help shows all flags: `--runs`, `--threshold`, `--timeout`, `--agent`, `--agent-config`, `--color`, `--concurrency`
- Default values are shown for each flag

---

### Step 12: Nonexistent test file

**Goal**: Verify clear error when file is not found

**Do**:
```sh
riteway ai nonexistent.sudo
```

**Think aloud**: Is the error message clear about what went wrong? Does it show the path that was attempted?

**Success**:
- Error mentions the file was not found (`ENOENT` or descriptive message)
- No silent crash; exit code is non-zero

---

### Step 13: Path traversal attempt

**Goal**: Verify the CLI rejects paths that escape the working directory

**Do**:
```sh
riteway ai ../../../etc/passwd
```

**Think aloud**: Does the CLI stop execution before reaching the agent? Is the security error message clear?

**Success**:
- `SecurityError` or similar is shown with a message about path traversal
- Exit code is non-zero
- No agent is invoked

---

### Step 14: `--runs 0` (below minimum)

**Goal**: Verify runs minimum constraint is enforced

**Do**:
```sh
riteway ai --runs 0 greet.test.sudo
```

**Success**: `ValidationError` with message about runs minimum; exit code non-zero

---

### Step 15: `--threshold 150` (above maximum)

**Goal**: Verify threshold maximum constraint is enforced

**Do**:
```sh
riteway ai --threshold 150 greet.test.sudo
```

**Success**: `ValidationError` about threshold range (0–100); exit code non-zero

---

### Step 16: `--threshold -10` (below minimum)

**Do**:
```sh
riteway ai --threshold -10 greet.test.sudo
```

**Success**: `ValidationError` about threshold range; exit code non-zero

---

### Step 17: `--timeout 500` (below 1000ms minimum)

**Do**:
```sh
riteway ai --timeout 500 greet.test.sudo
```

**Success**: `ValidationError` about timeout minimum (1000ms); exit code non-zero

---

### Step 18: `--concurrency -5` (below minimum)

**Do**:
```sh
riteway ai --concurrency -5 greet.test.sudo
```

**Success**: `ValidationError` about concurrency minimum; exit code non-zero

---

### Step 19: `--agent` and `--agent-config` used together

**Goal**: Verify the mutual exclusion constraint

**Do**:
```sh
riteway ai --agent opencode --agent-config ./my-agent.json greet.test.sudo
```

**Think aloud**: Is the error message specific about *why* these can't be combined?

**Success**:
- Error message says the flags are mutually exclusive
- No test execution begins
- Exit code is non-zero

---

### Step 20: Unknown `--agent` name (no registry present)

**Goal**: Verify unknown agent names are caught at resolution time

**Do**:
```sh
riteway ai --agent does-not-exist greet.test.sudo
```

**Think aloud**: Does the error tell you which agents are supported? Or how to use `--agent-config` to add a custom one?

**Success**:
- Error mentions `does-not-exist` is unknown
- Supported agents are listed (`claude`, `opencode`, `cursor`)
- Suggestion to use `--agent-config` or `riteway.agent-config.json` is shown
- Exit code is non-zero

---

### Step 21: `--agent-config` pointing to a nonexistent file

**Goal**: Verify clear error when the config file doesn't exist

**Do**:
```sh
riteway ai --agent-config ./no-such-file.json greet.test.sudo
```

**Success**:
- Error references the config file path that was not found
- `AgentConfigReadError` or similar; exit code non-zero

---

### Step 22: `--agent-config` with invalid JSON

**Goal**: Verify parse errors in agent config files are surfaced clearly

**Do**:
```sh
echo "{ not valid json }" > bad-agent.json
riteway ai --agent-config ./bad-agent.json greet.test.sudo
```

**Think aloud**: Does the error explain *why* the config is bad (parse error), and point you to the file?

**Success**:
- Error mentions the config file path and indicates invalid JSON
- `AgentConfigParseError` or similar; exit code non-zero

---

### Step 23: `--agent-config` with valid JSON but invalid schema

**Goal**: Verify schema validation rejects malformed agent configs

**Do**:
```sh
echo '{ "wrongField": true }' > invalid-schema-agent.json
riteway ai --agent-config ./invalid-schema-agent.json greet.test.sudo
```

**Think aloud**: Does the error tell you which field is wrong and what's expected?

**Success**:
- Error mentions the invalid field or missing required field (`command`)
- `AgentConfigValidationError` or similar; exit code non-zero

---

### Step 24: `--agentConfig` (camelCase — wrong flag name)

**Goal**: Verify a typo in flag casing is caught, not silently ignored

**Do**:
```sh
riteway ai --agentConfig ./my-agent.json greet.test.sudo
```

**Think aloud**: Did the CLI reject `--agentConfig` immediately with a clear error?

**Success**:
- Error message reads: `Unknown flag(s): --agentConfig`
- A `ValidationError` with code `INVALID_AI_ARGS` is thrown
- No test execution begins; exit code is non-zero
- The message clearly names the unrecognized flag so the user knows exactly what to fix

---

### Step 25: Agent in registry not found for given `--agent` name

**Goal**: Verify a clear error when a registry exists but the requested agent isn't in it

**Do**:
1. Create a registry with one entry:
   ```sh
   echo '{"my-claude": {"command": "claude", "args": ["-p"], "outputFormat": "json"}}' > riteway.agent-config.json
   ```
2. Run with an agent name not in the registry:
   ```sh
   riteway ai --agent does-not-exist greet.test.sudo
   ```

**Think aloud**: Does the error explain that the registry was found but the agent is missing from it? Does it suggest adding the agent or removing the registry file?

**Success**:
- Error mentions `does-not-exist` was not found in `riteway.agent-config.json`
- Error suggests adding the agent to the registry, using `--agent-config`, or removing the registry file
- Exit code is non-zero

3. Clean up:
   ```sh
   rm riteway.agent-config.json
   ```

---

## Post-test

- [ ] Stop recording

### Reflection Questions

1. **What was confusing?** Were any flags unclear or surprising? Was the SudoLang test file format intuitive?
2. **What worked well?** Did the output clearly communicate pass/fail state and help you debug?
3. **Most surprising behavior?** Did any step behave differently than expected? (e.g., Step 24 — the `--agentConfig` bug)
4. **Would you use this in CI?** Would you add `riteway ai` tests to your CI pipeline today? What's blocking you?
5. **Error message quality**: Rate the error messages 1–5 for each validation step. Which ones were unhelpful?

---

## Need Professional User Testing?

**Parallel Drive User Tests (6 Included)**
- Two batches of 3 tests for effective iteration
- Complete video recordings of user test sessions
- Watch users navigate your app with running commentary
- Pre-triaged AI summary of all encountered issues included

Purchase 6 user tests: https://buy.stripe.com/9B6fZ53M11jm6CqeCRcwg0a
