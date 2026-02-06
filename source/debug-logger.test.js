import { describe, test, beforeEach, afterEach, vi } from 'vitest';
import { assert } from './vitest.js';
import { createDebugLogger } from './debug-logger.js';
import { rmSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { init } from '@paralleldrive/cuid2';

const createSlug = init({ length: 5 });

describe('debug-logger', () => {
  describe('createDebugLogger()', () => {
    let consoleErrorSpy;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    test('logs to console when debug is enabled', () => {
      const logger = createDebugLogger({ debug: true });
      logger.log('test message');

      assert({
        given: 'debug enabled',
        should: 'write to console.error',
        actual: consoleErrorSpy.mock.calls.length > 0,
        expected: true
      });

      assert({
        given: 'a log message',
        should: 'include [DEBUG] prefix',
        actual: consoleErrorSpy.mock.calls[0][0],
        expected: '[DEBUG] test message'
      });
    });

    test('does not log to console when debug is disabled', () => {
      const logger = createDebugLogger({ debug: false });
      logger.log('test message');

      assert({
        given: 'debug disabled',
        should: 'not write to console.error',
        actual: consoleErrorSpy.mock.calls.length,
        expected: 0
      });
    });

    test('writes to log file when logFile is specified', () => {
      const testDir = join(tmpdir(), 'riteway-test-' + createSlug());
      const logFile = join(testDir, 'debug.log');

      try {
        mkdirSync(testDir, { recursive: true });
        const logger = createDebugLogger({ debug: true, logFile });
        
        logger.log('test message 1');
        logger.log('test message 2');
        logger.flush();

        assert({
          given: 'logFile specified',
          should: 'create the log file',
          actual: existsSync(logFile),
          expected: true
        });

        const logContents = readFileSync(logFile, 'utf-8');

        assert({
          given: 'multiple log messages',
          should: 'write all messages to file',
          actual: logContents.includes('test message 1') && logContents.includes('test message 2'),
          expected: true
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test('includes timestamp in log file entries', () => {
      const testDir = join(tmpdir(), 'riteway-test-' + createSlug());
      const logFile = join(testDir, 'debug.log');

      try {
        mkdirSync(testDir, { recursive: true });
        const logger = createDebugLogger({ debug: true, logFile });
        
        logger.log('test message');
        logger.flush();

        const logContents = readFileSync(logFile, 'utf-8');

        assert({
          given: 'a log message',
          should: 'include ISO timestamp',
          actual: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(logContents),
          expected: true
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test('handles object logging with JSON serialization', () => {
      const logger = createDebugLogger({ debug: true });
      const testObj = { key: 'value', nested: { data: 123 } };
      
      logger.log('Object:', testObj);

      assert({
        given: 'object in log message',
        should: 'serialize object to JSON',
        actual: consoleErrorSpy.mock.calls[0][0].includes('"key":"value"'),
        expected: true
      });
    });

    test('provides structured logging methods', () => {
      const logger = createDebugLogger({ debug: true });
      
      logger.command('node', ['arg1', 'arg2']);
      logger.process({ pid: 123, exitCode: 0 });
      logger.result({ passed: true });

      assert({
        given: 'command logged',
        should: 'format command with args',
        actual: consoleErrorSpy.mock.calls[0][0].includes('Command: node arg1 arg2'),
        expected: true
      });

      assert({
        given: 'process info logged',
        should: 'serialize process data',
        actual: consoleErrorSpy.mock.calls[1][0].includes('"pid":123'),
        expected: true
      });

      assert({
        given: 'result logged',
        should: 'serialize result data',
        actual: consoleErrorSpy.mock.calls[2][0].includes('"passed":true'),
        expected: true
      });
    });

    test('default debug value is false', () => {
      const logger = createDebugLogger();
      logger.log('test');

      assert({
        given: 'no debug option',
        should: 'default to debug disabled',
        actual: consoleErrorSpy.mock.calls.length,
        expected: 0
      });
    });
  });
});
