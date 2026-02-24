import { errorCauses, noop } from 'error-causes';

// Error types for AI agent execution and related operations
export const [aiErrors, handleAIErrors] = errorCauses({
  ParseError: { code: 'PARSE_FAILURE', message: 'Failed to parse AI response' },
  ValidationError: { code: 'VALIDATION_FAILURE', message: 'Invalid input parameters' },
  SecurityError: { code: 'SECURITY_VIOLATION', message: 'Security violation detected' },
  TimeoutError: { code: 'AGENT_TIMEOUT', message: 'AI agent timed out' },
  AgentProcessError: { code: 'AGENT_PROCESS_FAILURE', message: 'AI agent process failed' },
  AITestError: { code: 'AI_TEST_ERROR', message: 'AI test execution failed' },
  OutputError: { code: 'OUTPUT_ERROR', message: 'Test output recording failed' },
  ExtractionParseError: { code: 'EXTRACTION_PARSE_FAILURE', message: 'Failed to parse extraction result' },
  ExtractionValidationError: { code: 'EXTRACTION_VALIDATION_FAILURE', message: 'Invalid extraction result' }
});

// handleAIErrors is exhaustive — every registered type must have a handler.
// allNoop satisfies that requirement; spread it and override the type under test.
export const allNoop = Object.fromEntries(Object.keys(aiErrors).map(k => [k, noop]));

export const {
  ParseError,
  ValidationError,
  SecurityError,
  TimeoutError,
  AgentProcessError,
  AITestError,
  OutputError,
  ExtractionParseError,
  ExtractionValidationError
} = aiErrors;
