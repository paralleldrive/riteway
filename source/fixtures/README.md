# Test Fixtures

This directory contains test fixtures for the Riteway AI testing framework.

## Unit Test Fixtures

These fixtures are used by `agent-config.test.js` to exercise config loading:

### `test-agent-config.json`
Valid agent config with a custom agent name and args.

### `no-command-agent-config.json`
Invalid agent config missing the required `command` field — used to verify schema validation error paths.

### `invalid-agent-config.txt`
A non-JSON file — used to verify JSON parse error paths.

---

## E2E Test Fixtures

These fixtures are used by `e2e.test.js` and require a real AI agent to be authenticated.

### `sum-function-spec.mdc`
A simple, self-contained prompt-under-test that specifies a `sum` JavaScript function. Imported by
`multi-assertion-test.sudo` to exercise the full two-agent pipeline (with `promptUnderTest` context).

### `sum-function-test.sudo`
Reference implementation of a `.sudo` test file demonstrating:
- Importing a prompt spec via `import 'path/to/spec.mdc'`
- A `userPrompt` that instructs the agent to implement the spec
- Three assertions that the judge evaluates against the agent's output

### `claude-agent-config.json`
Valid claude agent config in JSON format — used to verify the `--agent-config` file-loading flow.

---

## Why No Failure Fixture?

Deterministic failure tests are not viable with capable LLMs as both result and judge agents —
the result agent will satisfy requirements from first principles regardless of bad prompt context,
and the judge will pass output that is genuinely correct even under constraints. The failure
detection path is proven at the unit test level with mock agents in `ai-runner.test.js`.

---

## Requirements Reference

These fixtures demonstrate functionality specified in:
- **Epic**: `tasks/archive/2026-01-22-riteway-ai-testing-framework/2026-01-22-riteway-ai-testing-framework.md`
