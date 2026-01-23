import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import {
  formatDate,
  generateSlug,
  generateOutputPath,
  formatTAP,
  recordTestOutput
} from './test-output.js';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('test-output', () => {
  describe('formatDate()', () => {
    test('formats date as YYYY-MM-DD', () => {
      const date = new Date('2026-01-23T12:34:56.789Z');
      
      assert({
        given: 'a date object',
        should: 'format as YYYY-MM-DD',
        actual: formatDate(date),
        expected: '2026-01-23'
      });
    });

    test('pads single-digit months and days', () => {
      const date = new Date('2026-03-05T00:00:00.000Z');
      
      assert({
        given: 'a date with single-digit month and day',
        should: 'pad with zeros',
        actual: formatDate(date),
        expected: '2026-03-05'
      });
    });

    test('uses current date when not provided', () => {
      const result = formatDate();
      const today = new Date();
      const expected = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`;
      
      assert({
        given: 'no date argument',
        should: 'use current date',
        actual: result,
        expected
      });
    });
  });

  describe('generateSlug()', () => {
    test('generates a slug using cuid2', async () => {
      const slug = await generateSlug();
      
      assert({
        given: 'no arguments',
        should: 'return a non-empty string',
        actual: slug.length > 0,
        expected: true
      });
    });

    test('generates unique slugs', async () => {
      const slug1 = await generateSlug();
      const slug2 = await generateSlug();
      
      assert({
        given: 'multiple calls',
        should: 'return different slugs',
        actual: slug1 !== slug2,
        expected: true
      });
    });
  });

  describe('generateOutputPath()', () => {
    test('generates path with all components', async () => {
      const testFilename = 'my-test.sudo';
      const date = '2026-01-23';
      const slug = 'abc123xyz';
      
      const path = await generateOutputPath({
        testFilename,
        date,
        slug,
        outputDir: 'ai-evals'
      });
      
      assert({
        given: 'test filename, date, and slug',
        should: 'construct path with pattern',
        actual: path,
        expected: 'ai-evals/2026-01-23-my-test-abc123xyz.tap.md'
      });
    });

    test('strips extension from test filename', async () => {
      const path = await generateOutputPath({
        testFilename: 'test.sudo',
        date: '2026-01-23',
        slug: 'xyz',
        outputDir: 'ai-evals'
      });
      
      assert({
        given: 'test filename with extension',
        should: 'strip extension from filename',
        actual: path,
        expected: 'ai-evals/2026-01-23-test-xyz.tap.md'
      });
    });
  });

  describe('formatTAP()', () => {
    test('formats basic TAP output with aggregate results', () => {
      const results = {
        passed: true,
        passCount: 3,
        totalRuns: 4,
        runResults: [
          { passed: true, output: 'Test 1 passed' },
          { passed: true, output: 'Test 2 passed' },
          { passed: true, output: 'Test 3 passed' },
          { passed: false, output: 'Test 4 failed' }
        ]
      };
      
      const tap = formatTAP(results);
      
      assert({
        given: 'test results with 3/4 passes',
        should: 'include TAP version header',
        actual: tap.includes('TAP version 13'),
        expected: true
      });

      assert({
        given: 'test results',
        should: 'include pass count',
        actual: tap.includes('# pass  3'),
        expected: true
      });

      assert({
        given: 'test results',
        should: 'include total runs',
        actual: tap.includes('1..4'),
        expected: true
      });
    });

    test('includes individual run results', () => {
      const results = {
        passed: true,
        passCount: 2,
        totalRuns: 2,
        runResults: [
          { passed: true, output: 'Run 1 output' },
          { passed: true, output: 'Run 2 output' }
        ]
      };
      
      const tap = formatTAP(results);
      
      assert({
        given: 'run results with outputs',
        should: 'include first run result',
        actual: tap.includes('ok 1'),
        expected: true
      });

      assert({
        given: 'run results with outputs',
        should: 'include second run result',
        actual: tap.includes('ok 2'),
        expected: true
      });
    });

    test('marks failed runs with "not ok"', () => {
      const results = {
        passed: false,
        passCount: 0,
        totalRuns: 2,
        runResults: [
          { passed: false, output: 'Failed' },
          { passed: false, output: 'Also failed' }
        ]
      };
      
      const tap = formatTAP(results);
      
      assert({
        given: 'failed runs',
        should: 'use "not ok" prefix',
        actual: tap.includes('not ok 1'),
        expected: true
      });
    });
  });

  describe('recordTestOutput()', () => {
    test('creates output file with TAP content', async () => {
      const testDir = join(tmpdir(), 'riteway-output-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      
      try {
        mkdirSync(testDir, { recursive: true });
        
        const results = {
          passed: true,
          passCount: 2,
          totalRuns: 2,
          runResults: [
            { passed: true, output: 'Test 1' },
            { passed: true, output: 'Test 2' }
          ]
        };
        
        const outputPath = await recordTestOutput({
          results,
          testFilename: 'test.sudo',
          outputDir: testDir
        });
        
        assert({
          given: 'test results',
          should: 'create output file',
          actual: existsSync(outputPath),
          expected: true
        });

        const content = readFileSync(outputPath, 'utf-8');
        
        assert({
          given: 'output file',
          should: 'contain TAP content',
          actual: content.includes('TAP version 13'),
          expected: true
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test('creates output directory if missing', async () => {
      const testDir = join(tmpdir(), 'riteway-output-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      const outputDir = join(testDir, 'ai-evals');
      
      try {
        // Don't create outputDir - let function create it
        
        const results = {
          passed: true,
          passCount: 1,
          totalRuns: 1,
          runResults: [{ passed: true, output: 'Test' }]
        };
        
        await recordTestOutput({
          results,
          testFilename: 'test.sudo',
          outputDir,
          openBrowser: false
        });
        
        assert({
          given: 'non-existent output directory',
          should: 'create the directory',
          actual: existsSync(outputDir),
          expected: true
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test('returns the output file path', async () => {
      const testDir = join(tmpdir(), 'riteway-output-' + Date.now() + '-' + Math.random().toString(36).slice(2));
      
      try {
        mkdirSync(testDir, { recursive: true });
        
        const results = {
          passed: true,
          passCount: 1,
          totalRuns: 1,
          runResults: [{ passed: true }]
        };
        
        const outputPath = await recordTestOutput({
          results,
          testFilename: 'test.sudo',
          outputDir: testDir,
          openBrowser: false
        });
        
        assert({
          given: 'test results',
          should: 'return path to output file',
          actual: outputPath.includes('.tap.md'),
          expected: true
        });

        assert({
          given: 'test results',
          should: 'include output directory in path',
          actual: outputPath.startsWith(testDir),
          expected: true
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });
  });
});
