# `riteway ai` — AI Prompt Evaluations

The `riteway ai` CLI runs your AI agent prompt evaluations against a configurable pass-rate threshold. Write a `.sudo` test file, run it through any supported AI agent, and get a TAP-formatted report with per-assertion pass rates across multiple runs.

---

## Authentication

All agents use OAuth authentication — no API keys needed. Authenticate once before running evals:

| Agent | Command | Docs |
|-------|---------|------|
| Claude | `claude setup-token` | [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code) |
| Cursor | `agent login` | [Cursor docs](https://docs.cursor.com/context/rules-for-ai) |
| OpenCode | See docs | [opencode.ai/docs/cli](https://opencode.ai/docs/cli/) |

---

## Writing a test file

AI evals are written in `.sudo` files using [SudoLang](https://github.com/paralleldrive/sudolang) syntax:

```
# my-feature-test.sudo

import 'path/to/spec.mdc'

userPrompt = """
Implement the sum function as described.
"""

- Given the spec, should name the function sum
- Given the spec, should accept two parameters named a and b
- Given the spec, should return the correct sum of the two parameters
```

Each `- Given ..., should ...` line becomes an independently judged assertion. The agent is asked to respond to the `userPrompt` (with any imported spec as context), and a judge agent scores each assertion across all runs.

---

## Running an eval

```shell
riteway ai path/to/my-feature-test.sudo
```

By default this runs **4 passes**, requires **75% pass rate**, uses the **claude** agent, runs up to **4 tests concurrently**, and allows **300 seconds** per agent call.

```shell
# Specify runs, threshold, and agent
riteway ai path/to/test.sudo --runs 10 --threshold 80 --agent opencode

# Use a Cursor agent with color output
riteway ai path/to/test.sudo --agent cursor --color

# Use a custom agent config file (mutually exclusive with --agent)
riteway ai path/to/test.sudo --agent-config ./my-agent.json
```

---

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--runs N` | `4` | Number of passes per assertion |
| `--threshold P` | `75` | Required pass percentage (0–100) |
| `--timeout MS` | `300000` | Per-agent-call timeout in milliseconds |
| `--agent NAME` | `claude` | Agent: `claude`, `opencode`, `cursor`, or a custom name from `riteway.agent-config.json` |
| `--agent-config FILE` | — | Path to a flat single-agent JSON config `{"command","args","outputFormat"}` — mutually exclusive with `--agent` |
| `--concurrency N` | `4` | Max concurrent test executions |
| `--color` | off | Enable ANSI color output |
| `--save-responses` | off | Save raw agent responses and judge details to a companion `.responses.md` file |

Results are written as a TAP markdown file under `ai-evals/` in the project root.

---

## Saving raw responses for debugging

When `--save-responses` is passed, a companion `.responses.md` file is written alongside the `.tap.md` output. It contains the raw result agent response and per-run judge details (passed, actual, expected, score) for every assertion — useful for debugging failures without adding console noise.

```shell
riteway ai path/to/test.sudo --save-responses
```

Each test file produces its own uniquely-named pair of files (e.g. `2026-03-17-test-abc12.tap.md` and `2026-03-17-test-abc12.responses.md`), so multiple test files never conflict.

### Capturing responses as CI artifacts

In GitHub Actions, use `--save-responses` and upload the `ai-evals/` directory as an artifact:

```yaml
- name: Run AI prompt evaluations
  run: npx riteway ai path/to/test.sudo --save-responses

- name: Upload AI eval responses
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: ai-eval-responses
    path: ai-evals/*.responses.md
    retention-days: 14
```

The `if: always()` ensures responses are uploaded even when assertions fail, so you can inspect exactly what the agent produced.

### Partial results on timeout

If some runs complete before another times out, the completed runs' responses are still written to the responses file. The timed-out run's partial agent output is also captured, followed by a `[RITEWAY TIMEOUT]` marker showing when and where the timeout occurred. This lets you debug why a run took too long and potentially optimize the prompt to run faster.

---

## Custom agent configuration

`riteway ai init` writes all built-in agent configs to `riteway.agent-config.json` in your project root, so you can add custom agents or tweak existing flags:

```shell
riteway ai init           # create riteway.agent-config.json
riteway ai init --force   # overwrite existing file
```

The generated file is a keyed registry. Add a custom agent entry and use it with `--agent`:

```json
{
  "claude":   { "command": "claude",   "args": ["-p", "--output-format", "json", "--no-session-persistence"], "outputFormat": "json"  },
  "opencode": { "command": "opencode", "args": ["run", "--format", "json"],                                   "outputFormat": "ndjson" },
  "cursor":   { "command": "agent",    "args": ["--print", "--output-format", "json"],                        "outputFormat": "json"  },
  "my-agent": { "command": "my-tool",  "args": ["--json"],                                                    "outputFormat": "json"  }
}
```

```shell
riteway ai path/to/test.sudo --agent my-agent
```

Once `riteway.agent-config.json` exists, any agent key defined in it supersedes the library's built-in defaults for that agent.

---

## Configuring Model and Temperature (OpenCode)

Most agent harnesses don't expose temperature settings. If you need temperature control for Riteway AI evals, use OpenCode with a custom agent config.

### 1. Create the agent file

Create `.opencode/agents/riteway.md` in your project root:

```markdown
---
description: Riteway AI eval agent
mode: primary
model: anthropic/claude-sonnet-4-6
temperature: 0.2
---
```

### 2. Configure the Riteway agent

In your Riteway config (`riteway.agent-config.json`), reference the agent by filename (without extension):

```json
{
  "opencode": {
    "command": "opencode",
    "args": ["run", "--agent", "riteway", "--format", "json"],
    "outputFormat": "ndjson"
  }
}
```

Then run your evals using the `opencode` agent:

```shell
riteway ai path/to/test.sudo --agent opencode
```

This gives you precise control over both the model and sampling temperature used during evaluations. Temperature shapes the next-token probability distribution — lower values skew toward more probable tokens (less creative, more repetitive), and higher values spread probability more evenly (more creative, less predictable). Note that no current LLM guarantees deterministic outputs even at temperature 0; results will still vary across runs.
