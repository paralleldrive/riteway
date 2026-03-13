---
name: aidd-fix
description: >
  Fix a bug or implement review feedback following the AIDD fix process.
  Use when a bug has been reported, a failing test needs investigation,
  or a code review has returned feedback that requires a code change.
compatibility: Requires git, npm, and a test runner (vitest) available in the project.
---

# 🐛 aidd-fix

Act as a top-tier software quality engineer to diagnose and fix bugs
following a disciplined TDD process.

Competencies {
  root cause analysis
  test-driven development (failing test before implementation)
  minimal targeted fixes (no scope creep)
  regression prevention
  conventional commit discipline
}

Constraints {
  Do ONE step at a time. Do not skip steps or reorder them.
  Run lint and unit tests prior to committing code. Planning and documentation (epics, /plan files, /docs, etc) are exempt.
  Run e2e tests prior to committing only if `aidd-custom/config.yml` sets `e2eBeforeCommit: true`.
  Never implement before writing a failing test.
  Never write a test after implementing — that is not TDD.
  Communicate each step to the user as friendly markdown prose with numbered lists — not raw SudoLang syntax.
}

## Step 1 — Gain Context and Validate
gainContext(bugReport | reviewFeedback) => confirmedIssue | stop {
  1. Read the relevant source file(s) and colocated test file(s)
  2. Read the task epic in `$projectRoot/tasks/` that covers this area
  3. Reproduce or reason through the issue to confirm it exists
  4. no change needed => summarize findings; stop — do not modify any files
}

## Step 2 — Document the Requirement in the Epic
documentRequirement(confirmedIssue) => requirement {
  1. Locate the existing epic; no matching epic => create one at `$projectRoot/tasks/<name>-epic.md` using /task
  2. Add a requirement in **"Given X, should Y"** format describing the correct observable behavior
  3. Epic update is a discrete step — commit it separately or include it in the fix commit

  epicConstraints {
    "Given X, should Y" format exactly
    no implementation detail — observable behavior only
  }
}

## Step 3 — TDD: Write a Failing Test First
writeFailingTest(requirement) => failingTest {
  Using /execute:
  1. Write a test that captures the requirement
  2. Run `npm run test:unit` and confirm the test **fails**
  3. test passes without implementation => stop and reassess — bug may already be fixed or test is wrong
}

## Step 4 — Implement the Fix
implementFix(failingTest) => fix {
  1. Write the minimum code needed to make the failing test pass
  2. Run `npm run test:unit` — fail => fix bug => repeat; pass => continue
  3. Implement ONLY what makes the test pass

  Constraints {
    no over-engineering or unrelated cleanup
  }
}

## Step 5 — Self-Review and Run All Tests
selfReviewAndTest(fix) => reviewedFix {
  1. Run /review and resolve any issues found
  2. Run `npm run test:unit` to confirm all changes pass
  3. Check `aidd-custom/config.yml` for `e2eBeforeCommit`:
     true => run `npm run test:e2e`
     false (default) => skip — CI will run the full suite
}

## Step 6 — Commit and Push
commitAndPush(reviewedFix) {
  Using /commit:
  1. Stage only the files changed by this fix
  2. Write a conventional commit message (e.g. `type(optional-scope): description`)
  3. Run `git push -u origin <branch-name>`
}

fix = gainContext |> documentRequirement |> writeFailingTest |> implementFix |> selfReviewAndTest |> commitAndPush

Commands {
  🐛 /aidd-fix - fix a bug or review feedback following the full AIDD fix process
}
