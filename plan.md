# Riteway Project Plan

## Current Epics

### 📋 PR #394 Remediation Epic
**Status**: 📋 PLANNED
**File**: [`tasks/2026-02-11-pr394-remediation-epic.md`](./tasks/2026-02-11-pr394-remediation-epic.md)
**Goal**: Address all outstanding PR review concerns, code quality issues, and file size violations before merge

### 📋 Context7 GitHub Action Integration Epic
**Status**: 📋 PLANNING - Awaiting Approval  
**File**: [`tasks/2025-01-27-context7-github-action-epic.md`](./tasks/2025-01-27-context7-github-action-epic.md)  
**Goal**: Add Upsert Context7 GitHub Action to repository with automatic updates after successful release script runs

## Completed Epics

### ✅ OpenCode Agent Support Fix Epic
**Status**: ✅ COMPLETED (2026-02-05)  
**File**: [`tasks/archive/2026-01-22-riteway-ai-testing-framework/2026-02-04-opencode-agent-support-fix.md`](./tasks/archive/2026-01-22-riteway-ai-testing-framework/2026-02-04-opencode-agent-support-fix.md)  
**Goal**: Fix OpenCode agent integration to properly handle NDJSON streaming output format  
**Result**: Successfully fixed OpenCode agent to parse NDJSON streaming output and handle markdown-wrapped JSON responses. Implemented structured error handling following error-causes.mdc standard. All 184 tests passing, live testing confirmed working.

### ✅ RiteWay AI Testing Framework Epic
**Status**: ✅ COMPLETED (2026-01-23)  
**File**: [`tasks/archive/2026-01-22-riteway-ai-testing-framework.md`](./tasks/archive/2026-01-22-riteway-ai-testing-framework.md)  
**Goal**: Enable Riteway users to test AI prompts as easily as they test code, treating prompts as first-class testable units  
**Result**: Successfully implemented `riteway ai <promptfile>` CLI command with agent orchestration, parallel execution, TAP output, and comprehensive documentation. All 6 tasks completed with 62 passing tests.

### ✅ Modernize Test Runner Epic
**Status**: ✅ COMPLETED (2025-10-06)  
**File**: [`tasks/archive/2025-09-27-modernize-test-runner-epic.md`](./tasks/archive/2025-09-27-modernize-test-runner-epic.md)  
**Goal**: Modernize test runner to support native ES modules by separating JSX component tests from core Riteway functionality  
**Result**: Verified native ES module support working with dual test runner setup (31 core tests + 6 Vitest tests). Updated documentation to reflect current JSX transpilation requirements.

### ✅ Release Script Improvement Epic
**Status**: ✅ COMPLETED (2025-09-27)  
**File**: [`tasks/archive/2025-09-27-release-script-improvement-epic.md`](./tasks/archive/2025-09-27-release-script-improvement-epic.md)  
**Goal**: Enhance Riteway's automated release system with robust error handling and validation  
**Result**: Successfully implemented enhanced release script with error-causes integration, comprehensive error handling, branch validation, and user-friendly CLI. All 5 tasks completed successfully.

## Backlog

*No items in backlog*

