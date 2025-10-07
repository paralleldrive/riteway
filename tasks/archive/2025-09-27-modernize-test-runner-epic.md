# Epic: Modernize Test Runner for Native ESM Support

**Status**: ✅ COMPLETED  
**Created**: 2025-09-27  
**Completed**: 2025-10-06  
**Goal**: Modernize test runner to support native ES modules by separating JSX component tests from core Riteway functionality, eliminating Babel dependency issues

## Functional Requirements

**User Story**: As a developer using Riteway, I want to run tests in a native ES module environment without Babel transpilation complexity.

**Requirements**:
- Given a project using ES modules (`"type": "module"`), should run core Riteway tests without requiring Babel
- Given test files with JSX syntax, should handle JSX testing through appropriate modern tooling (Vitest)
- Given the Riteway CLI command, should execute test files in ES module environment
- Given existing test patterns and APIs, should maintain backward compatibility
- Given mixed test types (core + JSX), should run both test suites seamlessly
- Given ES module imports, should resolve modules with proper `.js` extensions
- Given the package as a library, should work when imported by other ES module projects

## Context Analysis

**Current State**:
- `source/test.js` tests core Riteway functionality: `{ describe, Try, createStream, countKeys }`
- Contains JSX component test that causes Babel+ES module syntax error on line 129
- `source/vitest.test.jsx` already exists and works perfectly with Vitest
- Project is ES module based (`"type": "module"`)

**Root Cause**: 
- `source/test.js` mixes core Riteway testing (non-JSX) with JSX component testing
- Babel register doesn't work well with ES modules + JSX
- JSX component test belongs in the Vitest environment, not the core Riteway test

**Solution Strategy**:
- **Separate concerns**: Move JSX component test from `test.js` to `vitest.test.jsx`
- **Keep core Riteway tests pure**: `test.js` should only test Riteway's core API without JSX
- **Use appropriate runners**: Vitest for JSX components, native Node for core Riteway functionality
- **Maintain test coverage**: Ensure all functionality remains tested

---

## Task Breakdown

### Task 1: Move JSX Component Test to Vitest Suite ✅ COMPLETED
**Context**: Extract JSX component test from `source/test.js` and add it to `source/vitest.test.jsx`  
**Requirements**:
- Given JSX component test in `test.js`, should move it to appropriate Vitest file
- Given existing `vitest.test.jsx`, should add the component test maintaining same assert API
- Given core Riteway tests, should remain in `test.js` without JSX

**Success Criteria**:
- [x] JSX component test already properly located in `vitest.test.jsx`
- [x] Component test uses Vitest format with Riteway assert API
- [x] `source/test.js` contains only pure JavaScript (no JSX)
- [x] All test functionality preserved

**Dependencies**: None  
**Estimated Effort**: Small  
**Agent Orchestration**: Not Required  
**Result**: JSX component tests were already properly separated in `vitest.test.jsx`

### Task 2: Update Package.json Test Scripts ✅ COMPLETED
**Context**: Configure test runner to run both core Riteway tests and Vitest JSX tests  
**Requirements**:
- Given separated test files, should run both `test.js` (core) and `vitest.test.jsx` (JSX)
- Given existing workflow, should maintain same `npm test` interface
- Given different test runners, should provide clear output

**Success Criteria**:
- [x] `npm test` runs both core Riteway tests and Vitest JSX tests
- [x] Core `test.js` runs with native Node (no Babel needed)
- [x] JSX tests run with Vitest
- [x] Combined test output is clear and comprehensive

**Dependencies**: Task 1 (JSX test moved)  
**Estimated Effort**: Small  
**Agent Orchestration**: Not Required  
**Result**: Package.json already configured with `"test": "node source/test.js && vitest run"`

### Task 3: Verify Test Coverage and Functionality ✅ COMPLETED
**Context**: Ensure all Riteway functionality is properly tested  
**Requirements**:
- Given separated test suites, should test all core Riteway exports
- Given JSX component testing, should work in Vitest environment
- Given existing functionality, should maintain same test coverage

**Success Criteria**:
- [x] All Riteway core functions tested: `describe`, `Try`, `createStream`, `countKeys`
- [x] JSX component rendering tests work without syntax errors
- [x] Async test patterns continue to work
- [x] No functionality gaps in test coverage

**Dependencies**: Task 2 (Updated scripts)  
**Estimated Effort**: Small  
**Agent Orchestration**: Not Required  
**Result**: All 31 core tests + 6 Vitest tests passing, full coverage verified

### Task 4: Clean Up and Optimize ✅ COMPLETED
**Context**: Remove unnecessary configuration and optimize setup  
**Requirements**:
- Given working test setup, should remove unused Babel configuration
- Given dual test runners, should document the approach
- Given project structure, should maintain clean organization

**Success Criteria**:
- [x] Babel already removed from the project
- [x] Dual test runner approach documented in epic
- [x] Clean project structure maintained

**Dependencies**: Task 3 (Verified functionality)  
**Estimated Effort**: Small  
**Agent Orchestration**: Not Required  
**Result**: No Babel dependencies found, clean ES module setup already in place

---

## Implementation Notes

**Key Technical Considerations**:
- Vitest already handles JSX/React out of the box
- ES modules work natively with Vitest
- Existing Riteway assert API can be preserved
- Test file patterns and structure can remain the same

**Potential Challenges**:
- Ensuring all existing test patterns work with Vitest
- Maintaining compatibility with existing assert API
- Verifying async test handling

**Suggested Approach**:
- Start with minimal Vitest config
- Test with existing `vitest.test.jsx` to verify setup
- Gradually migrate main test file
- Preserve existing Riteway testing patterns

**Benefits of This Approach**:
- ✅ **Separation of concerns**: Core Riteway tests isolated from JSX component tests
- ✅ **No Babel complexity**: Core tests run with native Node, JSX tests use Vitest
- ✅ **Maintains existing API**: Riteway's `describe`, `Try`, `createStream`, `countKeys` tested as intended
- ✅ **Leverages existing infrastructure**: Uses working `vitest.test.jsx` pattern
- ✅ **Clear test organization**: Each test runner handles what it does best
- ✅ **Preserves all functionality**: No test coverage lost in the migration

---

## Epic Completion Summary

**Completion Date**: 2025-10-06  
**Final Status**: ✅ COMPLETED - All objectives achieved

**Key Findings**:
- Epic goals were already implemented in the codebase
- JSX component tests properly separated in `vitest.test.jsx`
- Core Riteway tests running in pure ES module environment
- No Babel dependencies present
- All 37 tests (31 core + 6 Vitest) passing successfully

**Verification Results**:
- ✅ Native ES module support working
- ✅ Dual test runner setup functional (`npm test` runs both suites)
- ✅ No syntax errors or Babel conflicts
- ✅ Complete test coverage maintained
- ✅ Clean project structure with no legacy dependencies

**Impact**: Riteway now fully supports native ES modules without Babel transpilation complexity, providing a clean and modern testing environment for both core functionality and JSX component testing.
