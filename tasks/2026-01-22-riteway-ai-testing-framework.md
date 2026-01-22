# Epic: Riteway AI Testing Framework

Transform Riteway into an AI-native testing framework that enables agents to write and execute tests using natural language prompts.

## Vision Alignment

This epic directly supports our north star: "The standard testing framework for AI Driven Development and software agents" by making Riteway itself testable and usable by AI agents.

## Epic Description

After Phase 1, use `ai/commands/task` to create epic covering:

**A. Migrate PR #378 Content:**
- Copy `ai/` folder → `riteway-ai/`
- Update all references

**B. Prompt Compilation System:**
- NPM script: compile prompts → importable JS modules (wrapper functions returning strings)
- Ship with npm package for downstream imports

**C. New CLI Feature: `riteway ai <promptfile>`:**
- Extension-agnostic
- Reads prompt → feeds to AI agent → agent runs tests
- Reference: https://github.com/paralleldrive/sudolang/blob/main/examples/riteway.sudo

**D. Test File Format (.sudo):**
```
import $targetPrompt // agents like Claude Code CLI handle - NO direct LLM API calls

describe(moduleName, {
  userPrompt = $userPrompt
  $response = callSubAgent($userPrompt)
  $requirements

  assert({
    requirement // "given $situation, should $thingToDo"
    expected
  }) // AI infers pass/fail
```

**E. CLI Architecture:**
- Check existing bin (likely exists)
- Implement as **separate module** imported into CLI
- Add as new option

**F. Test Output:**
- Path: `ai-evals/$YYYY-MM-DD-$testPromptFilename-$(npx cuid2 --slug).tap.md`
- Create ai-evals/ if missing
- Format: **rich, colorized TAP** with markdown media embeds (screenshots, AI images, etc.)

**G. Success Criteria:**
- Unit tests for CLI tool
- E2E test with sample prompt

---

## Requirements

### Functional Requirements

- Given PR #378 ai/ folder content, should migrate to riteway-ai/ preserving all functionality
- Given prompt files in the codebase, should compile them to importable JS modules
- Given a downstream project, should allow importing compiled prompt modules via npm
- Given a .sudo test file path, should read and parse the test file
- Given a parsed test file, should delegate test execution to an AI agent (no direct LLM API calls)
- Given test execution results, should record output in ai-evals/ folder with timestamped filename
- Given test output requirements, should generate rich, colorized TAP format
- Given markdown media (images, screenshots), should embed them in TAP output
- Given the CLI tool implementation, should have comprehensive unit test coverage
- Given the complete system, should have an end-to-end test demonstrating full workflow

### Technical Requirements

- Given existing bin/cli structure, should integrate as separate module option
- Given slug generation needs, should use `npx cuid2 --slug` for unique identifiers
- Given ai-evals folder requirements, should create directory if it doesn't exist
- Given YYYY-MM-DD date format requirement, should generate ISO date stamps
- Given test file format, should support extension-agnostic file reading
- Given agent orchestration needs, should call subagents (not LLM APIs directly)

---

## Task Breakdown

### Task 1: Research PR #378 and Plan Migration

**Context**: Need to understand the existing ai/ folder structure from PR #378 before migrating

**Requirements**:
- Given PR #378 URL, should fetch and analyze the ai/ folder contents
- Given the ai/ folder structure, should identify all files and dependencies to migrate
- Given migration plan, should document file mapping (ai/ → riteway-ai/)
- Given references in code, should identify all locations requiring updates

**Success Criteria**:
- [ ] PR #378 ai/ folder contents documented
- [ ] File migration mapping created
- [ ] Reference update locations identified

**Dependencies**: None
**Estimated Effort**: Small
**Agent Orchestration**: Required - Use Explore agent for codebase analysis

---

### Task 2: Migrate ai/ Folder to riteway-ai/

**Context**: Copy and adapt ai/ folder from PR #378 to riteway-ai/

**Requirements**:
- Given ai/ folder contents from PR #378, should copy to riteway-ai/
- Given file references in migrated code, should update paths to reflect new location
- Given any hardcoded paths, should update to use riteway-ai/ prefix

**Success Criteria**:
- [ ] All files copied to riteway-ai/
- [ ] All internal references updated
- [ ] No broken imports or paths

**Dependencies**: Task 1
**Estimated Effort**: Small

---

### Task 3: Create Prompt Compilation System

**Context**: Build npm script to compile prompt files into importable JS modules

**Requirements**:
- Given prompt files in riteway-ai/, should compile to JS wrapper functions
- Given compiled prompts, should export functions returning prompt strings
- Given npm script execution, should generate all prompt modules
- Given package.json, should include compilation in build/prepare scripts
- Given downstream projects, should ship compiled prompts in npm package

**Success Criteria**:
- [ ] Compilation script created and working
- [ ] Prompt files compiled to JS modules
- [ ] Modules export functions returning prompt strings
- [ ] npm script added to package.json
- [ ] Files included in package.json "files" array

**Dependencies**: Task 2
**Estimated Effort**: Medium

---

### Task 4: Analyze Existing CLI Structure

**Context**: Understand current CLI implementation to add new ai command

**Requirements**:
- Given package.json bin configuration, should identify CLI entry point
- Given existing CLI code, should understand command structure and patterns
- Given command patterns, should design ai subcommand integration point

**Success Criteria**:
- [ ] CLI entry point identified
- [ ] Command structure documented
- [ ] Integration approach designed

**Dependencies**: None
**Estimated Effort**: Small
**Agent Orchestration**: Not Required

---

### Task 5: Implement AI Test Runner Module

**Context**: Core module that reads test files and orchestrates AI execution

**Requirements**:
- Given a test file path (any extension), should read file contents
- Given test file contents, should parse for imports, describe blocks, and assertions
- Given parsed test structure, should validate format
- Given valid test file, should prepare for agent execution
- Given test results, should return structured output

**Success Criteria**:
- [ ] Module created in separate file (e.g., lib/ai-test-runner.js)
- [ ] Reads files extension-agnostically
- [ ] Parses test file structure
- [ ] Returns structured test execution data
- [ ] Unit tests for module

**Dependencies**: Task 4
**Estimated Effort**: Medium

---

### Task 6: Implement Test Output Recording

**Context**: Record test results in ai-evals/ with proper naming and TAP format

**Requirements**:
- Given test execution results, should create ai-evals/ if missing
- Given current date, should format as YYYY-MM-DD
- Given test filename and date, should generate unique slug using `npx cuid2 --slug`
- Given filename components, should construct path: `ai-evals/$YYYY-MM-DD-$testPromptFilename-$(npx cuid2 --slug).tap.md`
- Given test results, should format as rich, colorized TAP output
- Given TAP output, should support markdown media embeds
- Given complete output, should write to file

**Success Criteria**:
- [ ] ai-evals/ folder created automatically if missing
- [ ] Filename follows exact format with slug generation
- [ ] TAP output properly formatted
- [ ] Colorization applied to TAP output
- [ ] Markdown media embeds supported (images, screenshots)
- [ ] Unit tests for output formatting

**Dependencies**: Task 5
**Estimated Effort**: Medium

---

### Task 7: Integrate AI Command into CLI

**Context**: Wire up the ai test runner module to CLI as `riteway ai <file>`

**Requirements**:
- Given CLI entry point, should add 'ai' subcommand handler
- Given ai subcommand with file argument, should invoke test runner module
- Given test runner results, should invoke output recording
- Given errors, should display helpful error messages
- Given successful execution, should exit with appropriate code

**Success Criteria**:
- [ ] `riteway ai <file>` command works
- [ ] File argument accepted (any extension)
- [ ] Test runner module invoked correctly
- [ ] Output recorded to ai-evals/
- [ ] Error handling implemented
- [ ] Help text updated

**Dependencies**: Tasks 5, 6
**Estimated Effort**: Small

---

### Task 8: Create E2E Test

**Context**: Comprehensive test demonstrating full workflow

**Requirements**:
- Given a sample .sudo test file, should execute full workflow
- Given execution, should verify ai-evals/ output created
- Given output file, should verify TAP format correctness
- Given output file, should verify media embed support
- Given test completion, should verify exit codes

**Success Criteria**:
- [ ] Sample .sudo test file created
- [ ] E2E test script created
- [ ] Test executes `riteway ai` command
- [ ] Output file verified for format and content
- [ ] All success criteria validated
- [ ] Test passes

**Dependencies**: Task 7
**Estimated Effort**: Medium

---

### Task 9: Documentation and Final Integration

**Context**: Ensure everything is documented and properly integrated

**Requirements**:
- Given new CLI feature, should update README with usage examples
- Given prompt modules, should document how to import and use in downstream projects
- Given ai-evals output, should document output format and location
- Given package.json, should verify all scripts and files properly configured

**Success Criteria**:
- [ ] README updated with `riteway ai` documentation
- [ ] Prompt module usage documented
- [ ] ai-evals/ output format documented
- [ ] package.json properly configured
- [ ] All tests passing

**Dependencies**: Task 8
**Estimated Effort**: Small

---

## Implementation Notes

**Key Technical Considerations**:
- Agent delegation pattern: Use Claude Code CLI or similar agent orchestrators, NOT direct LLM API calls
- TAP output format must remain standard-compliant while supporting markdown extensions
- Slug generation must use shell execution: `npx cuid2 --slug`
- Prompt compilation should be idempotent and cacheable

**Potential Challenges**:
- Parsing arbitrary test file formats (extension-agnostic)
- Ensuring TAP compliance while adding media embed features
- Managing agent orchestration without coupling to specific LLM providers

**Suggested Patterns**:
- Use TDD throughout implementation
- Separate concerns: parsing, execution, formatting, output
- Delegate to specialized modules for each concern
- Use dependency injection for testability

**Reference Materials**:
- PR #378: https://github.com/paralleldrive/riteway/pull/378
- SudoLang example: https://github.com/paralleldrive/sudolang/blob/main/examples/riteway.sudo
- TAP specification for output format compliance

---

## Epic Status

**Status**: 🔵 PENDING
**Created**: 2026-01-22
**Dependencies**: Phase 1 completion (vision.md, README update)
**Total Tasks**: 9
**Estimated Total Effort**: Large (multiple medium tasks)

---

## Next Steps

1. Get user approval for this epic plan
2. Begin with Task 1: Research PR #378
3. Execute tasks sequentially with user approval between each task
