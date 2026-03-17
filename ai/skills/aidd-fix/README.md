# aidd-fix — Bug Fix & Review Feedback Reference

`/aidd-fix` guides an AI agent through a disciplined, test-driven process for
fixing bugs and implementing code review feedback — one step at a time, with
no scope creep.

## Why a structured fix process matters

Unstructured bug fixes share a common failure mode: the fix is written first,
a test is added after (or not at all), and the root cause is never formally
recorded. This leads to regressions, incomplete fixes, and a codebase that
becomes harder to trust over time.

`/aidd-fix` enforces the opposite discipline:

1. Confirm the bug exists before touching any code
2. Document the correct observable behavior in the task epic
3. Write a **failing test** that encodes the requirement
4. Write the **minimum code** to make the test pass
5. Self-review, run the full test suite, then commit

The failing test is not optional. If the test passes before any implementation,
the bug is already fixed — or the test is wrong. Either way, you know before
writing a line of production code.

## The fix workflow

### Step 1 — Gain context and validate

Read the relevant source file(s) and colocated test file(s), then read the
task epic in `tasks/` that covers this area. Reproduce or reason through the
issue to confirm it actually exists. If no change is needed, stop and
summarize — do not modify any files.

### Step 2 — Document the requirement in the epic

Locate the existing epic or create one at `tasks/<name>-epic.md`. Add a
requirement in **"Given X, should Y"** format describing the correct
observable behavior — no implementation detail, only what the user or caller
should experience.

```
Given an invalid email address, the registration form should display a
validation error without submitting.
```

### Step 3 — Write a failing test first

Write a unit test that encodes the requirement, run `npm run test:unit`, and
confirm it **fails**. If it passes without any implementation change, stop and
reassess — the bug may already be fixed or the test is not targeting the right
behavior.

### Step 4 — Implement the fix

Write the minimum code needed to make the failing test pass. Run
`npm run test:unit` after each attempt. Implement only what the test requires —
no over-engineering or unrelated cleanup.

### Step 5 — Self-review and run all tests

Run `/review` and resolve any issues found. Run `npm run test:unit` to confirm
all tests pass. If `aidd-custom/config.yml` sets `e2eBeforeCommit: true`, also
run `npm run test:e2e` before committing.

### Step 6 — Commit and push

Stage only the files changed by the fix. Write a conventional commit message
(`type(optional-scope): description`) and push to the feature branch.

## When to use `/aidd-fix`

- A bug has been reported and needs investigation
- A failing test needs a root cause identified and resolved
- A code review has returned feedback that requires a code change
- A regression has been introduced and needs to be traced and corrected

## Constraints

- Steps must be followed in order — do not skip or reorder them
- Run lint and unit tests before every commit (documentation commits are exempt)
- Never implement before the failing test exists
- Never write a test after implementing — that is not TDD
- Keep fixes minimal and targeted; unrelated improvements belong in a separate commit
