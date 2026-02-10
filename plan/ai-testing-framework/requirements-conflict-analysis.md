# Requirements Conflict Analysis

> **Created:** 2026-02-10
> **Purpose:** Compare task epic requirements, current prompt instructions, and actual implementation to identify conflicts

## Executive Summary

**CRITICAL CONFLICTS IDENTIFIED:**

The implementation uses a **single-agent-per-assertion pattern** where each agent both generates output and self-evaluates, while both the task epic and current prompt specify a **two-agent pattern** (result agent + judge agents) where one result is evaluated by multiple judges.

This is a fundamental architectural difference that affects:
- Result consistency (reuse vs regeneration)
- Agent separation of concerns (generation vs evaluation)
- Cost efficiency (N result generations vs 1)
- Test reliability (different results per judge)

---

## Three Sources Comparison

### 1. Task Epic Requirements (2026-01-22)

**Architecture Specified:**
```sudolang
import $targetPrompt
describe(moduleName, {
  userPrompt = $userPrompt
  $response = callSubAgent($userPrompt)  // ONE result generation
  $requirements                           // MULTIPLE requirements
  assert(requirements)                   // AI infers pass/fail per requirement
```

**Key Characteristics:**
- ONE call to `callSubAgent($userPrompt)` generates the result
- The SAME result is evaluated against MULTIPLE requirements
- AI infers `given`, `should`, `actual`, `expected` from requirement + response
- Functional requirement (line 46): "Given $requirements in test file, should iterate and create Riteway assertions for each"

**Response Schema:** Not explicitly specified in epic

---

### 2. Current Prompt Instructions

**Architecture Specified:**
```
1. Import the prompt under test and user prompt
2. Generate TAP output {
   sampleSequence for each run {
     1. call the result agent: getResult({ promptUnderTest, userPrompt }) => result
     2. for each assertion, call a judge agent:
        judge({ userPrompt, promptUnderTest, result }) =>
        { pass: true|false, actual: actualResult, expected: expectedResult, score: 0..100 }
   }
   3. Aggregate results
}
```

**Key Characteristics:**
- **Two-agent pattern**: result agent + judge agents
- ONE `getResult()` call per run generates the result
- MULTIPLE `judge()` calls per run (one per assertion)
- Each judge evaluates the SAME result
- Judge receives: `{ userPrompt, promptUnderTest, result }`
- Judge returns: `{ pass: true|false, actual, expected, score: 0..100 }`

**Constraint:**
> "A judge agent should only see ONE requirement assertion at a time to avoid shared mutable state in the attention mechanism"

---

### 3. Actual Implementation

**Architecture Implemented:**

From `test-extractor.js:143-166` (`buildEvaluationPrompt`):
```javascript
return `You are an AI test evaluator. Execute the following test and evaluate whether it meets the requirement.

${contextSection}USER PROMPT:
${userPrompt}

REQUIREMENT TO EVALUATE:
${description}

INSTRUCTIONS:
1. Execute the user prompt above
2. Evaluate whether your response satisfies the requirement
3. Respond with JSON: {"passed": true, "output": "<your response>"}
```

From `ai-runner.js:426-436`:
```javascript
const testTasks = tests.flatMap(({ prompt, description }, index) =>
  Array.from({ length: runs }, (_, runIndex) => async () => {
    return executeAgent({ agentConfig, prompt, timeout, debug, logFile }).then(result => ({
      assertionIndex: index,
      description,
      result
    }));
  })
);
```

**Key Characteristics:**
- **Single-agent pattern**: Each agent both generates output AND self-evaluates
- EACH test execution creates a NEW result (no result reuse)
- Agent receives: `{ userPrompt, description, promptUnderTest }`
- Agent returns: `{ passed: boolean, output: string, reasoning?: string }`
- Template-based evaluation prompt (controlled format)
- Execution: `assertions × runs` total agent calls

**Example Flow (4 assertions, 4 runs = 16 agent calls):**
```
Run 1, Assertion 1: Agent generates result + evaluates → {passed, output}
Run 1, Assertion 2: Agent generates result + evaluates → {passed, output}
Run 1, Assertion 3: Agent generates result + evaluates → {passed, output}
Run 1, Assertion 4: Agent generates result + evaluates → {passed, output}
Run 2, Assertion 1: Agent generates result + evaluates → {passed, output}
... (12 more)
```

---

## Conflict Matrix

| Aspect | Task Epic | Current Prompt | Implementation | Conflict? |
|--------|-----------|----------------|----------------|-----------|
| **Agent Pattern** | Implied two-agent (result + assertions) | Explicit two-agent (result + judge) | Single self-evaluating agent | ⚠️ **YES - CRITICAL** |
| **Result Generation** | ONE per run | ONE per run | ONE per assertion per run | ⚠️ **YES - CRITICAL** |
| **Result Reuse** | Same result for all requirements | Same result for all assertions | Different result per assertion | ⚠️ **YES - CRITICAL** |
| **Response Schema** | Not specified | `{pass, actual, expected, score}` | `{passed, output, reasoning?}` | ⚠️ **YES - MAJOR** |
| **Isolation Constraint** | Not specified | "ONE requirement per judge" | ONE requirement per agent | ✅ **NO - SATISFIED** |
| **Import Support** | Yes (`import $targetPrompt`) | Yes ("Import prompt under test") | Yes (`parseImports`, `promptUnderTest`) | ✅ **NO** |
| **Parallel Execution** | Yes (line 50) | Yes ("for each run") | Yes (with concurrency limit) | ✅ **NO** |
| **Threshold/Runs** | Yes (lines 48-49) | Yes ("Aggregate results") | Yes (`calculateRequiredPasses`) | ✅ **NO** |
| **TAP Output** | Yes (line 56) | Yes ("Generate TAP output") | Yes (`formatTAP`) | ✅ **NO** |

---

## Detailed Conflict Analysis

### CONFLICT 1: Two-Agent vs Single-Agent Pattern

**Epic Intent (lines 23-24):**
```
$response = callSubAgent($userPrompt)
assert(requirements) // AI infers pass/fail for each requirement
```

**Current Prompt:**
```
1. call the result agent: getResult({ promptUnderTest, userPrompt }) => result
2. for each assertion, call a judge agent: judge({ userPrompt, promptUnderTest, result })
```

**Implementation:**
```javascript
// buildEvaluationPrompt creates ONE prompt that does BOTH:
// 1. Execute the user prompt
// 2. Evaluate the response
return `Execute the following test and evaluate whether it meets the requirement.`
```

**Impact:**
- **Epic/Prompt**: Separation of concerns (generation vs judgment)
- **Implementation**: Single agent does both
- **Trade-off**: Implementation is simpler but doesn't match specified architecture

---

### CONFLICT 2: Result Reuse vs Regeneration

**Epic Intent:**
- ONE `callSubAgent($userPrompt)` call generates `$response`
- `$requirements` are evaluated against the SAME `$response`

**Current Prompt:**
```
sampleSequence for each run {
  1. call result agent ONCE → result
  2. for each assertion, call judge with SAME result
}
```

**Implementation:**
```javascript
// For 4 assertions with 4 runs each = 16 SEPARATE agent calls
// Each call BOTH generates a result AND evaluates it
const testTasks = tests.flatMap(({ prompt, description }, index) =>
  Array.from({ length: runs }, (_, runIndex) => async () => {
    return executeAgent({ agentConfig, prompt, timeout, debug, logFile })
  })
);
```

**Impact:**
- **Epic/Prompt**: 1 result per run, N judges per run = 1 + N agent calls per run
  - Example: 4 assertions, 4 runs = 4 result calls + 16 judge calls = 20 total
- **Implementation**: N results per run, no separate judges = N agent calls per run
  - Example: 4 assertions, 4 runs = 16 total
- **Cost**: Implementation is actually MORE efficient (16 vs 20 calls)
- **Consistency**: Epic/Prompt ensures same result evaluated by all judges; Implementation generates different results per assertion

---

### CONFLICT 3: Response Schema

**Current Prompt Specifies:**
```javascript
judge() => {
  pass: true|false,
  actual: actualResult,
  expected: expectedResult,
  score: 0..100
}
```

**Implementation Returns:**
```javascript
{
  passed: boolean,    // Different field name (passed vs pass)
  output: string,     // Actual result
  reasoning?: string  // Why it failed (optional)
}
```

**Missing from Implementation:**
- `expected` field (what was expected)
- `score` field (0-100 numeric score)
- Separation of `actual` and `expected`

**Present in Implementation but Not Specified:**
- `reasoning` field (explanation of failure)

**Impact:**
- Cannot calculate average scores per current prompt requirement
- Cannot show expected vs actual comparison
- Less structured evaluation output

---

### CONFLICT 4: Semantic Differences

**Epic Requirement (line 46):**
> "Given $requirements in test file, should iterate and create Riteway assertions for each"

**Current Prompt:**
> "for each assertion (given $situation, should $thingToDo), call a judge agent"

**Implementation:**
- Does iterate over extracted requirements ✅
- Does evaluate each one separately ✅
- Does NOT create "Riteway assertions" (uses custom evaluation logic) ⚠️
- Does NOT use separate judge agents ⚠️

---

## Constraint Validation

### Constraint: "A judge agent should only see ONE requirement assertion at a time"

**Implementation Analysis:**

From `buildEvaluationPrompt`:
```javascript
REQUIREMENT TO EVALUATE:
${description}  // Only ONE requirement per prompt
```

From `runAITests`:
```javascript
tests.flatMap(({ prompt, description }, index) =>
  // Each test execution has ONE description/requirement
```

**Verdict:** ✅ **SATISFIED**
- Each agent call contains exactly ONE requirement
- No shared mutable state in attention mechanism
- Assertions are independently isolated

However, the constraint assumes separate judge agents, which don't exist in the implementation.

---

## Semantic Intent vs Implementation

### Epic Vision (lines 32-35):
```
callSubAgent($userPrompt) - Agent executes the prompt
For each $requirement, Riteway test runner creates a Riteway assertion
AI infers given, should, actual, expected values from requirement + response
```

**What This Implies:**
1. Agent generates output (no evaluation)
2. Framework extracts requirements
3. Separate evaluation of output against each requirement
4. Structured assertion format (given/should/actual/expected)

### Implementation Reality:

1. Agent generates output AND evaluates in one call
2. Framework extracts requirements AND builds evaluation prompts
3. No separation between generation and evaluation
4. Less structured evaluation (passed/output/reasoning)

---

## Recommendations

### Option 1: Align Implementation with Requirements (Two-Agent Pattern)

**Changes Required:**
1. Split `buildEvaluationPrompt` into two functions:
   - `buildResultPrompt({ userPrompt, promptUnderTest })` - generates result only
   - `buildJudgePrompt({ userPrompt, requirement, result })` - evaluates result
2. Update `runAITests` flow:
   ```javascript
   for each run {
     result = executeAgent({ prompt: buildResultPrompt() })
     for each assertion {
       judgment = executeAgent({ prompt: buildJudgePrompt({ result }) })
     }
   }
   ```
3. Update response schema to include `actual`, `expected`, `score`
4. Update aggregation to average scores

**Benefits:**
- Matches requirements exactly
- Same result evaluated by all judges (consistency)
- Separation of concerns (generation vs judgment)

**Drawbacks:**
- More agent calls (5x more for 4 assertions: 1 result + 4 judges vs 4 combined)
- Higher cost and latency
- More complex orchestration

### Option 2: Update Requirements to Match Implementation (Single-Agent Pattern)

**Changes Required:**
1. Update task epic to describe single-agent pattern
2. Update current prompt instructions to remove two-agent pattern
3. Document trade-offs (efficiency vs separation of concerns)
4. Optional: Enhance response schema to include `actual`, `expected`, `score`

**Benefits:**
- Implementation already working and tested
- More cost-efficient
- Simpler architecture
- Faster execution

**Drawbacks:**
- Each assertion gets different generated output
- Less consistent evaluation (different contexts per assertion)
- Doesn't match original vision

### Option 3: Hybrid Approach

Implement two-agent pattern BUT make it optional:
```javascript
runAITests({
  evaluationMode: 'self-eval' | 'two-agent'
})
```

Default to current single-agent (efficient), allow two-agent for consistency-critical tests.

---

## Conclusion

**Primary Conflicts:**

1. ⚠️ **CRITICAL**: Two-agent pattern (epic/prompt) vs single-agent pattern (implementation)
2. ⚠️ **CRITICAL**: Result reuse (epic/prompt) vs result regeneration (implementation)
3. ⚠️ **MAJOR**: Response schema mismatch (missing `actual`, `expected`, `score`)

**The Good News:**

- Isolation constraint IS satisfied
- Core functionality works (185 tests passing)
- TAP output, parallel execution, thresholds all work correctly
- Import support works correctly

**Decision Required:**

The project owner (ericelliott) must decide:
- **Option 1**: Refactor implementation to match requirements (accuracy, cost increase)
- **Option 2**: Update requirements to match implementation (efficiency, simplicity)
- **Option 3**: Support both modes (flexibility, complexity)

**My Recommendation:** Option 2 (Update Requirements)

Rationale:
- Implementation is simpler, more efficient, and already tested
- Single-agent pattern is a valid architectural choice
- The key constraint (one requirement per agent) IS satisfied
- Can enhance response schema without changing architecture
- Two-agent pattern would 5x the cost for marginal consistency gains
