import { errorCauses } from 'error-causes';

// Error types for AI agent execution and related operations
export const [aiErrors, handleAIErrors] = errorCauses({
  ParseError: { code: 'PARSE_FAILURE', message: 'Failed to parse AI response' },
  ValidationError: { code: 'VALIDATION_FAILURE', message: 'Invalid input parameters' },
  SecurityError: { code: 'SECURITY_VIOLATION', message: 'Security violation detected' },
  TimeoutError: { code: 'AGENT_TIMEOUT', message: 'AI agent timed out' },
  AgentProcessError: { code: 'AGENT_PROCESS_FAILURE', message: 'AI agent process failed' },
});

export const { ParseError, ValidationError, SecurityError, TimeoutError, AgentProcessError } = aiErrors;
