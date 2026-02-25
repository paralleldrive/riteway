import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import { handleAIErrors, allNoop } from './ai-errors.js';
import {
  validateFilePath,
  verifyAgentAuthentication
} from './validation.js';

describe('validation', () => {
  describe('validateFilePath()', () => {
    test('accepts paths within base directory', () => {
      const baseDir = '/home/user/project';

      assert({
        given: 'a path within the base directory',
        should: 'return the resolved absolute path',
        actual: validateFilePath('tests/test.sudo', baseDir),
        expected: '/home/user/project/tests/test.sudo'
      });
    });

    test('accepts absolute paths within base directory', () => {
      const baseDir = '/home/user/project';

      assert({
        given: 'an absolute path within the base directory',
        should: 'return the resolved absolute path',
        actual: validateFilePath('/home/user/project/tests/test.sudo', baseDir),
        expected: '/home/user/project/tests/test.sudo'
      });
    });

    test('rejects path traversal attempts', () => {
      const baseDir = '/home/user/project';

      const error = Try(validateFilePath, '../../etc/passwd', baseDir);

      const invoked = [];
      handleAIErrors({ ...allNoop, SecurityError: () => invoked.push('SecurityError') })(error);

      assert({
        given: 'a path that escapes the base directory',
        should: 'throw an error that routes to the SecurityError handler',
        actual: invoked,
        expected: ['SecurityError']
      });

      assert({
        given: 'a path that escapes the base directory',
        should: 'identify the violation with PATH_TRAVERSAL code',
        actual: error?.cause?.code,
        expected: 'PATH_TRAVERSAL'
      });
    });

    test('rejects absolute path outside base directory', () => {
      const baseDir = '/home/user/project';

      const error = Try(validateFilePath, '/etc/passwd', baseDir);

      const invoked = [];
      handleAIErrors({ ...allNoop, SecurityError: () => invoked.push('SecurityError') })(error);

      assert({
        given: 'an absolute path outside the base directory',
        should: 'throw an error that routes to the SecurityError handler',
        actual: invoked,
        expected: ['SecurityError']
      });

      assert({
        given: 'an absolute path outside the base directory',
        should: 'identify the violation with PATH_TRAVERSAL code',
        actual: error?.cause?.code,
        expected: 'PATH_TRAVERSAL'
      });
    });
  });

  describe('verifyAgentAuthentication()', () => {
    // Mock executeAgent function for testing
    const createMockExecuteAgent = ({ shouldSucceed = true, errorMessage = 'Authentication failed' } = {}) => {
      return async () => {
        if (!shouldSucceed) {
          throw new Error(errorMessage);
        }
        return { status: 'ok' };
      };
    };

    test('succeeds when agent returns valid JSON', async () => {
      const executeAgent = createMockExecuteAgent({ shouldSucceed: true });
      const agentConfig = {
        command: 'mock-agent',
        args: []
      };

      const result = await verifyAgentAuthentication({ agentConfig, executeAgent });

      assert({
        given: 'agent returning valid JSON',
        should: 'return success result',
        actual: result,
        expected: { success: true }
      });
    });

    test('fails when agent throws error', async () => {
      const executeAgent = createMockExecuteAgent({ shouldSucceed: false, errorMessage: 'Process failed' });
      const agentConfig = {
        command: 'mock-agent',
        args: []
      };

      const result = await verifyAgentAuthentication({ agentConfig, executeAgent, timeout: 1000 });

      assert({
        given: 'agent throwing error',
        should: 'return failure result with authentication guidance',
        actual: result,
        expected: {
          success: false,
          error: 'Process failed\n\n💡 Agent authentication required. Run the appropriate setup command:\n   - Claude:  "claude setup-token" - https://docs.anthropic.com/en/docs/claude-code\n   - Cursor:  "agent login" - https://docs.cursor.com/context/rules-for-ai\n   - OpenCode: See https://opencode.ai/docs/cli/ for authentication setup'
        }
      });
    });

    test('succeeds without explicit timeout argument', async () => {
      const executeAgent = createMockExecuteAgent({ shouldSucceed: true });
      const agentConfig = {
        command: 'mock-agent',
        args: []
      };

      const result = await verifyAgentAuthentication({ agentConfig, executeAgent });

      assert({
        given: 'no timeout specified',
        should: 'complete successfully with default timeout',
        actual: result,
        expected: { success: true }
      });
    });
  });
});
