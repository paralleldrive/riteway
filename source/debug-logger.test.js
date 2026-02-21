import { describe, test, onTestFinished, vi } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import { createDebugLogger } from './debug-logger.js';
import { rmSync, existsSync, readFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('debug-logger', () => {
  describe('createDebugLogger()', () => {
    test('logs to console when debug is enabled', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      onTestFinished(() => consoleErrorSpy.mockRestore());

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
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      onTestFinished(() => consoleErrorSpy.mockRestore());

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
      const testDir = mkdtempSync(join(tmpdir(), 'riteway-'));
      const logFile = join(testDir, 'debug.log');
      onTestFinished(() => rmSync(testDir, { recursive: true, force: true }));

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
    });

    test('includes timestamp in log file entries', () => {
      const testDir = mkdtempSync(join(tmpdir(), 'riteway-'));
      const logFile = join(testDir, 'debug.log');
      onTestFinished(() => rmSync(testDir, { recursive: true, force: true }));

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
    });

    test('handles object logging with JSON serialization', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      onTestFinished(() => consoleErrorSpy.mockRestore());

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

    test('handles circular reference objects without throwing', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      onTestFinished(() => consoleErrorSpy.mockRestore());

      const circular = {};
      circular.self = circular;

      const logger = createDebugLogger({ debug: true });
      logger.log('Ref:', circular);

      assert({
        given: 'an object with a circular reference',
        should: 'log [Circular] instead of throwing',
        actual: consoleErrorSpy.mock.calls[0][0],
        expected: '[DEBUG] Ref: [Circular]'
      });
    });

    test('provides structured logging methods', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      onTestFinished(() => consoleErrorSpy.mockRestore());

      const logger = createDebugLogger({ debug: true });
      
      logger.command('node', 'arg1', 'arg2');
      logger.logProcess({ pid: 123, exitCode: 0 });
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

    test('flush is a no-op when no logFile is configured', () => {
      const logger = createDebugLogger({ debug: false });
      logger.log('test message');

      assert({
        given: 'no logFile configured',
        should: 'not throw when flush is called',
        actual: Try(logger.flush),
        expected: undefined
      });
    });

    test('default debug value is false', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      onTestFinished(() => consoleErrorSpy.mockRestore());

      const logger = createDebugLogger();
      logger.log('test');

      assert({
        given: 'no debug option',
        should: 'default to debug disabled',
        actual: consoleErrorSpy.mock.calls.length,
        expected: 0
      });
    });

    test('throws TypeError for non-string logFile', () => {
      const error = Try(createDebugLogger, { logFile: 123 });

      assert({
        given: 'non-string logFile value',
        should: 'throw TypeError',
        actual: error?.name,
        expected: 'TypeError'
      });
    });
  });
});
