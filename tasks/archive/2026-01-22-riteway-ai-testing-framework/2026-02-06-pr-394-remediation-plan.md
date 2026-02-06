# PR #394 Remediation Plan

> **Created:** 2026-02-06
> **PR:** [#394 feat(ai-runner): implement core module with TDD](https://github.com/paralleldrive/riteway/pull/394)
> **Branch:** `riteway-ai-testing-framework-implementation`

Cross-referencing the current branch state (184 tests passing, lint clean, TS clean) against the [in-progress self-review](https://github.com/paralleldrive/riteway/pull/394#issuecomment-2630534735) by ianwhitedeveloper (2026-02-03) and all cursor[bot] Bugbot findings.

## Status Summary

- **Resolved:** 9 of 12 review items from cursor[bot] + all 5 ericelliott feedback items
- **Remaining:** 3 blocking, 4 high-priority, and 1 dependency classification issue

## Checklist

- [ ] B1. Move `error-causes` from devDependencies to dependencies
- [ ] H3. Add `openBrowser: false` to recordTestOutput test
- [ ] H4. Rename `process` function in debug-logger.js
- [ ] B2. Add `Number.isFinite` guard for threshold validation (TDD)
- [ ] H2. Wire `OutputError` into recordTestOutput error handling or remove dead code
- [ ] B3. Add `validateFilePath` to import resolution in test-extractor.js (TDD)
- [ ] H1. Add concurrency limiter to `runAITests` (optional `--concurrency` flag)

---

## B1. BLOCKING: `error-causes` is a devDependency but used at runtime

**Files:** [package.json](../../package.json) line 97, consumed in [bin/riteway.js](../../bin/riteway.js) line 9 and [source/ai-runner.js](../../source/ai-runner.js) line 4

`error-causes` is imported at runtime via `createError` and `errorCauses` but is listed under `devDependencies`. Users installing `riteway` will hit a runtime crash since `npm install --production` won't install it.

**Fix:** Move `"error-causes": "^3.0.2"` from `devDependencies` to `dependencies` in `package.json`, then regenerate `package-lock.json`.

---

## B2. BLOCKING: NaN threshold bypasses validation silently

**Files:** [source/ai-runner.js](../../source/ai-runner.js) lines 140-146, [bin/riteway.js](../../bin/riteway.js) lines 98-99

The threshold validation `if (threshold < 0 || threshold > 100)` does not handle `NaN`. When a user passes `--threshold abc`, `Number('abc')` returns `NaN`. Since `NaN < 0 || NaN > 100` evaluates to `false`, validation passes silently. `calculateRequiredPasses` then returns `NaN`, and `passCount >= NaN` is always `false`, causing all tests to fail without a clear error message.

**Fix (TDD):**

1. Write test in [source/ai-runner.test.js](../../source/ai-runner.test.js) under `calculateRequiredPasses()`:

```javascript
test('validates threshold is a finite number', () => {
  let error;
  try {
    calculateRequiredPasses({ runs: 4, threshold: NaN });
  } catch (err) {
    error = err;
  }

  assert({
    given: 'NaN threshold',
    should: 'throw ValidationError',
    actual: error?.cause?.name,
    expected: 'ValidationError'
  });

  assert({
    given: 'NaN threshold',
    should: 'have INVALID_THRESHOLD code',
    actual: error?.cause?.code,
    expected: 'INVALID_THRESHOLD'
  });
});
```

2. Update validation in `calculateRequiredPasses` at [source/ai-runner.js](../../source/ai-runner.js) line 140:

```javascript
if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
```

This catches `NaN`, `Infinity`, `-Infinity`, and non-numeric values in one guard.

---

## B3. BLOCKING: Import path traversal in `extractTests`

**Files:** [source/test-extractor.js](../../source/test-extractor.js) lines 311-325

The `extractTests` function resolves import paths from test file content without calling `validateFilePath`. A test file at a valid path could contain `import @secrets from '../../../../.env'` and that file would be read. The existing comment (lines 306-309) explains the trust model, but it does not prevent the risk.

**Fix (TDD):**

1. Write test in [source/test-extractor.test.js](../../source/test-extractor.test.js) verifying that import path traversal throws a SecurityError
2. Call `validateFilePath(resolvedPath, projectRoot)` before `readFile` at line 325, wrapping the resolved import path in the same security boundary used for the test file itself
3. Import `validateFilePath` from `./ai-runner.js` in `test-extractor.js`

Per the project [error-causes rule](../../ai/rules/javascript/error-causes.mdc), the error should use `createError` with `name: 'SecurityError'` and `code: 'IMPORT_PATH_TRAVERSAL'`.

---

## H1. HIGH: Unbounded concurrency in `runAITests`

**File:** [source/ai-runner.js](../../source/ai-runner.js) lines 404-414

`Promise.all` fires `assertions * runs` subprocesses simultaneously. With 10 assertions and 4 runs = 40 concurrent subprocesses. The code comment at lines 401-403 acknowledges this but leaves it unresolved.

**Fix:**

1. Add `p-limit` as a dependency (or implement a simple concurrency limiter inline per [JavaScript rules](../../ai/rules/javascript/javascript.mdc) -- favor simplicity)
2. Default concurrency to a sensible limit (e.g., 4 or `os.cpus().length`)
3. Expose as optional `--concurrency N` CLI flag in `parseAIArgs`
4. Write test verifying concurrency is respected (mock agent with delay, verify sequential execution within limit)

---

## H2. HIGH: `OutputError` type is dead code

**File:** [bin/riteway.js](../../bin/riteway.js) lines 28-31 (definition), 34 (destructuring), 282-289 (handler)

`OutputError` is defined in `errorCauses`, destructured, and has a handler in `handleAIRunnerErrors`, but is never thrown anywhere. Flagged by cursor[bot] on 2026-01-23, confirmed unresolved in self-review.

**Fix (choose one):**

- **Option A (preferred):** Wire `OutputError` into `recordTestOutput` error handling in `runAICommand`. Wrap the `recordTestOutput` call (line 160-164) in its own try/catch and throw `createError({ ...OutputError, ... })` on failure, so the existing handler at line 282 is exercised.
- **Option B:** Remove `OutputError` from the `errorCauses` definition, destructuring, and handler if it's truly unnecessary.

---

## H3. HIGH: Test missing `openBrowser: false`

**File:** [source/test-output.test.js](../../source/test-output.test.js) lines 617-621

The "creates output file with TAP content" test calls `recordTestOutput` without `openBrowser: false`, while the other two tests (lines 652, 676) correctly pass this option. This causes the test to attempt opening a browser during test execution.

**Fix:** Add `openBrowser: false` to the options object at line 620:

```javascript
const outputPath = await recordTestOutput({
  results: createTestResults(),
  testFilename: 'test.sudo',
  outputDir: testDir,
  openBrowser: false
});
```

---

## H4. HIGH: `process` shadows Node global in debug-logger

**File:** [source/debug-logger.js](../../source/debug-logger.js) line 41

A local function named `process` shadows Node's global `process` within the closure. While the closure doesn't currently reference `process` globally, it's a readability trap per the [JavaScript naming rules](../../ai/rules/javascript/javascript.mdc) (use clear, consistent naming).

**Fix:** Rename the function from `process` to `logProcess` (or `logData`):

```javascript
const logProcess = (data) => {
  log('Process:', data);
};
// ...
return { log, command, process: logProcess, result, flush };
```

Update any callers (e.g., [source/ai-runner.js](../../source/ai-runner.js) references to `logger.process` -- currently none found, only `logger.log`, `logger.command`, `logger.result`, `logger.flush`).

---

## Execution Order

Per [TDD rules](../../ai/rules/tdd.mdc), each fix follows Red-Green-Refactor. Recommended order by dependency:

1. **B1** -- dependency fix, no code changes, just `package.json` (unblocks everything)
2. **H3** -- one-line fix, immediate CI safety improvement
3. **H4** -- rename, low-risk, prevents future bugs
4. **B2** -- test-first, then add `Number.isFinite` guard
5. **H2** -- wire `OutputError` or remove dead code
6. **B3** -- test-first, then add `validateFilePath` to import resolution
7. **H1** -- concurrency limiter (largest change, can be separate commit)

---

## Standards Reference

- Error handling: per [error-causes rule](../../ai/rules/javascript/error-causes.mdc) -- all errors use `createError` with `name`, `message`, `code`
- Testing: per [TDD rule](../../ai/rules/tdd.mdc) -- write failing test first, implement minimally, verify green
- JavaScript: per [JavaScript rule](../../ai/rules/javascript/javascript.mdc) -- favor simplicity, pure functions, named exports
- Commits: per [commit rule](../../ai/commands/commit.md) -- conventional commit format

---

## Review Sources

- [cursor[bot] Bugbot Review #1](https://github.com/paralleldrive/riteway/pull/394#pullrequestreview-3695230211) (2026-01-23) -- 4 findings, 4 resolved
- [cursor[bot] Bugbot Review #2](https://github.com/paralleldrive/riteway/pull/394#pullrequestreview-3700103397) (2026-01-23) -- 2 findings, 0 resolved
- [cursor[bot] Bugbot Review #3](https://github.com/paralleldrive/riteway/pull/394#pullrequestreview-3736966446) (2026-02-02) -- 3 findings, 1 resolved
- [ericelliott feedback](https://github.com/paralleldrive/riteway/pull/394#issuecomment-2609048553) (2026-01-24) -- 5 items, all resolved
- [ianwhitedeveloper self-review](https://github.com/paralleldrive/riteway/pull/394#issuecomment-2630534735) (2026-02-03) -- identified B1-B3, H1-H4
