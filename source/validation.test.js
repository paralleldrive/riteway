import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
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

      assert({
        given: 'a path that escapes the base directory',
        should: 'throw an error with message',
        actual: error?.message,
        expected: 'File path escapes base directory'
      });

      assert({
        given: 'a path that escapes the base directory',
        should: 'have SecurityError name in cause',
        actual: error?.cause?.name,
        expected: 'SecurityError'
      });

      assert({
        given: 'a path that escapes the base directory',
        should: 'have PATH_TRAVERSAL code in cause',
        actual: error?.cause?.code,
        expected: 'PATH_TRAVERSAL'
      });
    });

    test('rejects absolute path outside base directory', () => {
      const baseDir = '/home/user/project';

      const error = Try(validateFilePath, '/etc/passwd', baseDir);

      assert({
        given: 'an absolute path outside the base directory',
        should: 'throw an error with message',
        actual: error?.message,
        expected: 'File path escapes base directory'
      });

      assert({
        given: 'an absolute path outside the base directory',
        should: 'have SecurityError name in cause',
        actual: error?.cause?.name,
        expected: 'SecurityError'
      });

      assert({
        given: 'an absolute path outside the base directory',
        should: 'have PATH_TRAVERSAL code in cause',
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
        should: 'return success true',
        actual: result.success,
        expected: true
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
        should: 'return success false',
        actual: result.success,
        expected: false
      });

      assert({
        given: 'agent authentication failure',
        should: 'include error message',
        actual: result.error !== undefined,
        expected: true
      });
    });

    test('provides helpful error message for authentication errors', async () => {
      const executeAgent = createMockExecuteAgent({
        shouldSucceed: false,
        errorMessage: 'authentication failed: invalid token'
      });
      const agentConfig = {
        command: 'mock-agent',
        args: []
      };

      const result = await verifyAgentAuthentication({ agentConfig, executeAgent, timeout: 1000 });

      assert({
        given: 'authentication error message',
        should: 'include helpful guidance',
        actual: result.error.includes('Agent authentication required') || result.error.includes('Make sure your agent CLI is authenticated'),
        expected: true
      });
    });

    test('uses default timeout of 30 seconds', async () => {
      const executeAgent = createMockExecuteAgent({ shouldSucceed: true });
      const agentConfig = {
        command: 'mock-agent',
        args: []
      };

      const result = await verifyAgentAuthentication({ agentConfig, executeAgent });

      assert({
        given: 'no timeout specified',
        should: 'complete successfully with default timeout',
        actual: result.success,
        expected: true
      });
    });
  });
});
