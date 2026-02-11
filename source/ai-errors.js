import { errorCauses } from 'error-causes';

// Error types for AI agent execution and related operations
export const [aiErrors, handleAIErrors] = errorCauses({
  ParseError: { code: 'PARSE_FAILURE', message: 'Failed to parse AI response' },
  ValidationError: { code: 'VALIDATION_FAILURE', message: 'Invalid input parameters' },
  SecurityError: { code: 'SECURITY_VIOLATION', message: 'Security violation detected' },
  TimeoutError: { code: 'AGENT_TIMEOUT', message: 'AI agent timed out' },
  AgentProcessError: { code: 'AGENT_PROCESS_FAILURE', message: 'AI agent process failed' },
  // Extraction-specific errors (used by extraction-parser.js)
  ExtractionParseError: { code: 'EXTRACTION_PARSE_FAILURE', message: 'Failed to parse extraction result' },
  ExtractionValidationError: { code: 'EXTRACTION_VALIDATION_FAILURE', message: 'Invalid extraction result' }
});

export const { ParseError, ValidationError, SecurityError, TimeoutError, AgentProcessError, ExtractionParseError, ExtractionValidationError } = aiErrors;
