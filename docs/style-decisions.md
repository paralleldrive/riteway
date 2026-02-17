# Style Decisions

This document records technical decisions made during code review that may appear to contradict external suggestions but align with project standards.

## Promise Handling: Async/Await vs .then() Chains

**Date:** 2026-02-16

**Context:** During refactoring tasks 4.1-4.3, external suggestions were made to use `.then()` chains for promise handling (e.g., in `loadAgentConfig`, `spawnProcess`, `runAgentProcess`, `executeAgent`). These suggestions came from a contributor (Jan) who was not aware of our project's JavaScript style guidelines.

**Decision:** All `.then()` chains were converted to `async/await` syntax per project style guidelines in `.cursor/rules/javascript/javascript.mdc`.

**Rationale:**

1. **Project Standard:** Our `javascript.mdc` explicitly states:
   > "Prefer async/await or asyncPipe over raw promise chains."

2. **Consistency:** The codebase already uses async/await extensively. Mixing styles creates cognitive overhead and makes the code harder to maintain.

3. **Readability:** Async/await provides clearer, more imperative flow control that's easier to read and debug.

4. **Error Handling:** Try/catch blocks with async/await are more explicit and consistent than `.catch()` chains.

**Examples of Changes:**

### Before (Jan's suggested pattern):
```javascript
export const loadAgentConfig = async (configPath) =>
  readAgentConfigFile({ configPath })
    .then(parseJson({ configPath }))
    .then(validateAgentConfig());
```

### After (Project standard):
```javascript
export const loadAgentConfig = async (configPath) => {
  const raw = await readAgentConfigFile({ configPath });
  const parsed = await parseJson({ configPath })(raw);
  return validateAgentConfig()(parsed);
};
```

**Exceptions:**

The following `.then()` usages were **preserved** as they are acceptable per project standards:

1. **`limit-concurrency.js`** - Concurrency control primitive where `.then()` is needed to track completion within the execution pool.

2. **`riteway.js`** - Core test framework utilities (lines 35, 46-47) that predate the refactor and handle dynamic promise detection.

These are low-level utilities where `.then()` is the most appropriate solution.

**Related Files:**
- `.cursor/rules/javascript/javascript.mdc` - JavaScript style guidelines
- `source/agent-config.js` - loadAgentConfig implementation
- `source/ai-runner.js` - spawnProcess, runAgentProcess, executeAgent implementations
- `source/ai-command.js` - recordTestOutput error handling
- `bin/riteway.js` - mainAIRunner error handling

**References:**
- Review transcript: `agent-transcripts/30ad9d9c-1c52-4096-83eb-2f4a5bd58302.txt`
- Remediation task: `tasks/2026-02-16-pr394-remediation-round3.md` (if created)
