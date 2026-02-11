# PR #394 Remediation Epic

**Status**: 🚧 IN PROGRESS (Wave 1 ✅, Wave 2 ✅, Wave 3 ✅, Wave 4 next)
**Goal**: Address all outstanding PR review concerns, code quality issues, and file size violations before merge

## Overview

PR #394 implements the two-agent AI testing framework but accumulated technical debt during rapid iteration. Manual review revealed dead code, redundant data structures, overly restrictive import paths, mutation patterns, and files 3-4x over the 160-line limit. Jan and Eric's unresolved PR comments also need attention. This epic systematically addresses all findings in dependency-ordered waves so work can be parallelized where possible.

---

## Wave 1 — Quick Wins (all parallel, no interdependencies)

## Centralize CLI Defaults + Remove Dead `--validate-extraction` Flag — ✅ DONE

Remove the unused `--validate-extraction` CLI option and move all remaining inline defaults into the centralized `defaults` object in `bin/riteway.js`.

**Requirements**:
- Given the `defaults` object in `bin/riteway.js`, should contain all default values including `debug`, `debugLog`, and `concurrency`
- Given the minimist default block, should reference `defaults.*` instead of inline literal values
- Given `--validate-extraction` is parsed but never read by any downstream code, should be removed from Zod schema, minimist config, parsed object, and help text
- Given `bin/riteway.test.js` parseAIArgs assertions, should no longer reference `validateExtraction`

---

## Allow Imports Outside Project Root + Configurable `projectRoot` — ✅ DONE

Remove the `validateFilePath` path traversal restriction from `resolveImportPaths` and thread a configurable `projectRoot` parameter through the extraction pipeline.

**Requirements**:
- Given a test file importing a prompt from outside the project root, should resolve the import path without throwing a security error
- Given `resolveImportPaths` in `test-extractor.js`, should no longer call `validateFilePath` on import paths
- Given `extractTests()` and `runAITests()`, should accept an optional `projectRoot` parameter defaulting to `process.cwd()`
- Given E2E tests that use `process.chdir()`, should pass `projectRoot: testDir` instead to avoid global state mutation

---

## Merge Assertion description/requirement into Single `requirement` Field — ✅ DONE

Eliminate the redundant `description` field from extraction output. The "Given X, should Y" assertion text IS a requirement — name it accordingly.

**Requirements**:
- Given `buildExtractionPrompt`, should instruct the agent to return only `id` and `requirement` per assertion (no separate `description`)
- Given `assertionRequiredFields`, should validate `['id', 'requirement']` only
- Given `buildJudgePrompt`, should receive `requirement` directly (no rename/mapping needed)
- Given TAP output, `formatTAP`, `aggregatePerAssertionResults`, and `runAITests`, should use `requirement` where they previously used `description`
- Given test fixtures in `test-extractor.test.js` and `ai-runner.test.js`, should use `requirement` instead of `description` on assertion objects

---

## Wave 2 — Code Quality (all parallel, after Wave 1)

## Refactor `formatTAP` to Avoid Mutation — ✅ DONE

Replace the 14 `tap +=` string mutations in `formatTAP` with an immutable array-join pattern.

**Requirements**:
- Given `formatTAP` in `test-output.js`, should build TAP output using array push + `join('\n')` instead of string concatenation
- Given existing TAP output tests, should produce byte-identical output after refactor

---

## Convert Error-Testing try/catch to `Try` Helper — ✅ DONE

Replace ~27 `let error; try { fn() } catch(e) { error = e; }` blocks in test files with the riteway `Try` helper.

**Requirements**:
- Given error-testing try/catch blocks in `ai-runner.test.js` (~15 blocks), should use `Try(fn, args)` or `await Try(fn, args)` instead
- Given error-testing try/catch blocks in `test-extractor.test.js` (~12 blocks), should use `Try` helper instead
- Given try/finally blocks used for temp directory cleanup, should remain untouched

---

## Code Style Cleanup in `parseAIArgs` — ✅ DONE

Eliminate mutations and extract duplicated Zod error formatting.

**Requirements**:
- Given the catch block in `parseAIArgs`, should use `const` instead of `let` for error message formatting
- Given identical Zod error formatting in `parseAIArgs` and `loadAgentConfig`, should extract a shared `formatZodError` helper

---

## Wave 3 — File Decomposition (sequential, affects cross-file imports)

## Extract Modules from `ai-runner.js` — ✅ DONE

Break `ai-runner.js` (626 lines) into focused modules under 160 lines each.

**Requirements**:
- Given `limitConcurrency`, should be extracted to `source/limit-concurrency.js`
- Given `normalizeJudgment`, `calculateRequiredPasses`, and `aggregatePerAssertionResults`, should be extracted to `source/aggregation.js`
- Given `ai-runner.js` after extraction, should be under 300 lines
- Given existing test imports, should be updated to reference new module paths

**Result**: ai-runner.js reduced from 626→296 lines. Extracted 5 modules: limit-concurrency.js, aggregation.js, agent-parser.js, validation.js, ai-errors.js.

**Review finding — DRY violation (FIXED)**: ParseError was duplicated across ai-errors.js, agent-parser.js, and aggregation.js. Fixed by importing from ai-errors.js as the single source of truth.

---

### Wave 3 Extraction Rules (apply to ALL remaining extraction tasks)

> **Learned from Task #7 review**: When extracting modules, follow these rules to avoid issues:
> 1. **Single source of truth for error definitions** — all error types must be defined in ONE module (e.g., `ai-errors.js`) and imported elsewhere. Never duplicate `errorCauses` or `createError` definitions.
> 2. **Colocated tests** — when extracting functions to a new module, move their corresponding tests to a colocated test file (e.g., `aggregation.js` → `aggregation.test.js`).
> 3. **Re-export for backward compatibility** — the original module must re-export all moved functions so downstream imports don't break.

---

## Extract Modules from `test-extractor.js` — ✅ DONE

Break `test-extractor.js` (484 lines) into focused modules targeting ~160 lines each.

**Requirements**:
- Given `parseTAPYAML`, should be extracted to `source/tap-yaml.js`
- Given `resolveImportPaths`, `extractJSONFromMarkdown`, `tryParseJSON`, and `parseExtractionResult`, should be extracted to `source/extraction-parser.js`
- Given imports in `test-extractor.js`, `ai-runner.js`, and their test files, should be updated to reference new module paths
- **Must follow Wave 3 Extraction Rules above** (single error source, colocated tests, re-exports)

**Result**: test-extractor.js reduced from 477→286 lines. Extracted 2 modules: tap-yaml.js (40 lines), extraction-parser.js (149 lines). Colocated tests created: tap-yaml.test.js, extraction-parser.test.js. Error types (ExtractionParseError, ExtractionValidationError) added to ai-errors.js.

**Review (96/100 APPROVED)**: No blockers. Minor deferred findings:
- `let result` mutation in ai-runner.js:114 — low priority, defer
- Missing `@throws` JSDoc tags — low priority, defer
- `verifyAgentAuthentication` string matching — already tracked as Task #10 (Wave 4)

---

## Extract Modules from `bin/riteway.js` — ✅ DONE

Break `bin/riteway.js` (515 lines) into focused modules targeting ~160 lines each.

**Requirements**:
- Given `getAgentConfig`, `loadAgentConfig`, and `agentConfigFileSchema`, should be extracted to `source/agent-config.js`
- Given `parseAIArgs`, `aiArgsSchema`, `formatAssertionReport`, and `runAICommand`, should be extracted to `source/ai-command.js`
- Given `bin/riteway.js` after extraction, should primarily contain CLI entry point wiring
- **Must follow Wave 3 Extraction Rules above** (single error source, colocated tests, re-exports)

**Result**: bin/riteway.js reduced from 515→190 lines (63% reduction). Extracted 2 modules: agent-config.js (105 lines), ai-command.js (255 lines). Colocated Vitest tests created. Error types (AITestError, OutputError) added to ai-errors.js.

---

## Wave 4 — PR Comment Resolutions (all parallel, after Wave 3)

## Error-Causes Switch in `verifyAgentAuthentication`

Replace fragile string matching in the `verifyAgentAuthentication` catch block with the error-causes pattern.

**Requirements**:
- Given `verifyAgentAuthentication` failure, should always include agent setup guidance (since the function's purpose IS auth checking)
- Given the catch block, should not use `err.message.includes('authentication')` string matching

---

## Add Wrong Prompt E2E Test Fixture

Add an E2E test that verifies the framework correctly reports failures for a deliberately bad prompt.

**Requirements**:
- Given a test file with a deliberately wrong prompt under test, should produce `results.passed === false`
- Given existing wrong-prompt fixture files, should be reused if they exist or created if not

---

## Wave 5 — Final (after all above)

## Documentation + Flow Diagram Updates

Update all architecture documentation and flow diagrams to reflect the final module structure after remediation.

**Requirements**:
- Given completed file decomposition, should update `plan/ai-testing-framework/two-agent-architecture.md` with new module boundaries
- Given the remediation changes, should update flowcharts to reflect the simplified assertion model and relaxed import paths

---

## Deferred: "passed" to "pass" Rename

Deeply embedded across 4 source files, 70+ test assertions, TAP YAML parsing, and the API contract. Deferred unless Eric explicitly requires it — would be a breaking change requiring a major version bump.
