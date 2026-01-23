import { describe, test, vi } from 'vitest';
import { assert } from './vitest.js';
import {
  readTestFile,
  calculateRequiredPasses,
  aggregateResults,
  runAITests
} from './ai-runner.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('ai-runner', () => {
  describe('readTestFile()', () => {
    test('reads file contents from path', async () => {
      const testDir = join(tmpdir(), 'riteway-test-' + Date.now());
      mkdirSync(testDir, { recursive: true });
      const testFile = join(testDir, 'test.sudo');
      const contents = 'describe("test", { requirements: ["should work"] })';
      writeFileSync(testFile, contents);

      try {
        assert({
          given: 'a test file path',
          should: 'return the file contents',
          actual: await readTestFile(testFile),
          expected: contents
        });
      } finally {
        rmSync(testDir, { recursive: true });
      }
    });

    test('reads any file extension', async () => {
      const testDir = join(tmpdir(), 'riteway-test-' + Date.now());
      mkdirSync(testDir, { recursive: true });
      const testFile = join(testDir, 'test.md');
      const contents = '# My Test\n\nSome markdown content';
      writeFileSync(testFile, contents);

      try {
        assert({
          given: 'a markdown file path',
          should: 'return the file contents',
          actual: await readTestFile(testFile),
          expected: contents
        });
      } finally {
        rmSync(testDir, { recursive: true });
      }
    });
  });

  describe('calculateRequiredPasses()', () => {
    test('calculates required passes using ceiling', () => {
      assert({
        given: '4 runs with 75% threshold',
        should: 'require 3 passes (ceiling of 3)',
        actual: calculateRequiredPasses({ runs: 4, threshold: 75 }),
        expected: 3
      });

      assert({
        given: '5 runs with 75% threshold',
        should: 'require 4 passes (ceiling of 3.75)',
        actual: calculateRequiredPasses({ runs: 5, threshold: 75 }),
        expected: 4
      });

      assert({
        given: '10 runs with 80% threshold',
        should: 'require 8 passes',
        actual: calculateRequiredPasses({ runs: 10, threshold: 80 }),
        expected: 8
      });
    });

    test('uses default values', () => {
      assert({
        given: 'no arguments',
        should: 'use defaults (4 runs, 75% threshold) requiring 3 passes',
        actual: calculateRequiredPasses(),
        expected: 3
      });
    });
  });
});
