import { errorCauses } from 'error-causes';

// Error types for AI agent execution
export const [aiErrors, handleAIErrors] = errorCauses({
  ParseError: { code: 'PARSE_FAILURE', message: 'Failed to parse AI response' },
  TimeoutError: { code: 'AGENT_TIMEOUT', message: 'AI agent timed out' },
  AgentProcessError: { code: 'AGENT_PROCESS_FAILURE', message: 'AI agent process failed' },
});

export const { ParseError, TimeoutError, AgentProcessError } = aiErrors;
