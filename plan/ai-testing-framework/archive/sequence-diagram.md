# AI Testing Framework - Sequence Diagram

This sequence diagram shows the complete flow of the AI testing framework from test file input to TAP output.

```mermaid
sequenceDiagram
    participant User
    participant CLI as CLI (bin/riteway.js)
    participant Runner as ai-runner.js
    participant Extractor as test-extractor.js
    participant Logger as debug-logger.js
    participant Agent as AI Agent (Claude/Cursor/OpenCode)
    participant Output as test-output.js
    participant FS as File System

    User->>CLI: Execute test command
    CLI->>CLI: Parse arguments (filePath, runs, threshold, etc.)
    CLI->>Logger: createDebugLogger()
    Logger-->>CLI: logger instance

    CLI->>Runner: runAITests(options)
    activate Runner

    Note over Runner: Phase 0: Read Test File
    Runner->>FS: readTestFile(filePath)
    FS-->>Runner: testContent (string)

    Note over Runner,Extractor: Phase 1: Structured Extraction
    Runner->>Extractor: extractTests({ testContent, testFilePath, agentConfig })
    activate Extractor

    Extractor->>Extractor: buildExtractionPrompt(testContent)
    Extractor->>Agent: executeAgent({ prompt: extractionPrompt })
    activate Agent
    Agent->>Agent: Parse test file structure
    Agent-->>Extractor: JSON array of { id, description, userPrompt, requirement }
    deactivate Agent

    Extractor->>Extractor: parseExtractionResult(result)
    Extractor->>Extractor: parseImports(testContent)

    alt imports found
        loop for each import
            Extractor->>FS: readFile(importPath)
            FS-->>Extractor: promptUnderTest content
        end
    end

    Note over Extractor: Phase 2: Template-Based Evaluation
    loop for each extracted test
        Extractor->>Extractor: buildEvaluationPrompt({ userPrompt, description, promptUnderTest })
    end

    Extractor-->>Runner: Array of { id, description, userPrompt, requirement, prompt }
    deactivate Extractor

    Note over Runner: Phase 3: Parallel Test Execution with Concurrency Control
    Runner->>Runner: Create test execution tasks (assertions × runs)

    par Concurrent Execution (limited by concurrency parameter)
        loop for each test task
            Runner->>Agent: executeAgent({ agentConfig, prompt: evaluationPrompt })
            activate Agent
            Agent->>Agent: spawn child process (claude/cursor/opencode CLI)
            Agent->>Agent: Execute user prompt with context
            Agent->>Agent: Self-evaluate against requirement
            Agent-->>Runner: { passed: boolean, output: string, reasoning?: string }
            deactivate Agent
        end
    end

    Note over Runner: Phase 4: Result Aggregation
    Runner->>Runner: Group results by assertion
    Runner->>Runner: aggregatePerAssertionResults({ perAssertionResults, threshold, runs })
    Runner->>Runner: Calculate pass rates per assertion
    Runner->>Runner: Determine overall pass/fail

    Runner-->>CLI: { passed: boolean, assertions: [...] }
    deactivate Runner

    Note over CLI,Output: Phase 5: Output Formatting & Recording
    CLI->>Output: formatTAP(results, { color })
    Output-->>CLI: TAP formatted string

    CLI->>Output: recordTestOutput({ results, testFilename, outputDir })
    activate Output
    Output->>Output: formatDate() + generateSlug()
    Output->>Output: generateOutputPath()
    Output->>FS: mkdir(outputDir)
    Output->>FS: writeFile(outputPath, tapOutput)
    Output->>Output: openInBrowser(outputPath)
    Output-->>CLI: outputPath
    deactivate Output

    CLI->>User: Display results & output path
    CLI->>User: Exit with code (0 = pass, 1 = fail)
```

## Key Phases

1. **Phase 0: File Reading** - Read test file content from disk
2. **Phase 1: Structured Extraction** - AI agent extracts test metadata
3. **Phase 2: Template-Based Evaluation** - Transform metadata into controlled evaluation prompts
4. **Phase 3: Parallel Execution** - Run tests concurrently with controlled concurrency
5. **Phase 4: Result Aggregation** - Calculate pass rates and determine overall status
6. **Phase 5: Output Generation** - Format as TAP and write to file

## Critical Design Patterns

### Two-Phase Extraction Architecture
The framework uses a two-phase approach instead of asking the AI to create "self-evaluating prompts":

- **Phase 1 (Extraction)**: AI parses test file → structured metadata
- **Phase 2 (Template)**: Code transforms metadata → controlled evaluation prompts

This ensures reliable `{passed: boolean}` responses that can be aggregated correctly.

### Concurrency Control
Tests execute in parallel with a configurable concurrency limit to prevent resource exhaustion while maximizing throughput.

### Import Resolution
The framework supports importing context files (promptUnderTest) that are injected into evaluation prompts, enabling testing of AI behaviors with specific system prompts or instructions.
