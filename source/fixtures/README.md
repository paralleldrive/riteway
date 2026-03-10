# Test Fixtures

This directory contains test fixtures for the Riteway AI testing framework.

## Unit Test Fixtures

These fixtures are used by `agent-config.test.js` to exercise config loading:

### `test-agent-config.json`
Valid flat agent config with a custom agent name and args. Used to test `loadAgentConfig` and `resolveAgentConfig` with an explicit `--agent-config` path.

### `ndjson-agent-config.json`
Valid flat agent config with `outputFormat: "ndjson"`. Used to test the schema round-trip for non-default output formats.

### `no-command-agent-config.json`
Invalid flat agent config missing the required `command` field — used to verify schema validation error paths.

### `invalid-agent-config.txt`
A non-JSON file — used to verify JSON parse error paths.

### `riteway.agent-config.json`
Valid agent registry (keyed by agent name). Used to test `loadAgentRegistry` and the registry resolution path in `resolveAgentConfig`. Contains a `testAgent` entry with a custom command.

### `invalid-registry/riteway.agent-config.json`
Registry file containing invalid JSON — used to verify `AgentConfigParseError` is thrown when the registry is malformed.

### `bad-schema-registry/riteway.agent-config.json`
Registry file with valid JSON but invalid schema (agent values are strings instead of objects) — used to verify `AgentConfigValidationError` is thrown.

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

### `sudolang-prompt-test.sudo`
Verifies the framework handles SudoLang syntax in the `userPrompt` field. The extraction agent,
result agent, and judge agent all process SudoLang natively. Imports `sum-function-spec.mdc`.

### `claude-agent-config.json`
Valid claude agent config in JSON format — used to verify the `--agent-config` file-loading flow.

---

## Validation Error Fixtures

These fixtures trigger specific validation errors in the extraction pipeline.
Each requires one real agent call (extraction only — no result/judge agents).

### `no-prompt-under-test.sudo`
Has a `userPrompt` and assertions but no `import` statement. Verifies `extractTests` throws
`MISSING_PROMPT_UNDER_TEST` when no prompt-under-test import is provided.

### `missing-user-prompt.sudo`
Has an `import` and assertions but no `userPrompt` field. Verifies `extractTests` throws
`MISSING_USER_PROMPT` when the test file omits the user prompt.

### `no-assertions.sudo`
Has an `import` and `userPrompt` but no assertion lines. Verifies `extractTests` throws
`NO_ASSERTIONS_FOUND` when no requirements are specified.

---

## Why No Deterministic Failure Fixture?

Deterministic failure tests are not viable with capable LLMs as both result and judge agents —
the result agent will satisfy requirements from first principles regardless of bad prompt context,
and the judge will pass output that is genuinely correct even under constraints. The failure
detection path is proven at the unit test level with mock agents in `ai-runner.test.js`.

---

## Requirements Reference

These fixtures demonstrate functionality specified in:
- **Epic**: `tasks/archive/2026-01-22-riteway-ai-testing-framework/2026-01-22-riteway-ai-testing-framework.md`
