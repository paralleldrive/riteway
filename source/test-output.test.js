import { describe, test, vi, afterEach } from 'vitest';
import { assert } from './vitest.js';
import {
  formatDate,
  generateOutputPath,
  formatTAP,
  recordTestOutput
} from './test-output.js';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { init } from '@paralleldrive/cuid2';

const createSlug = init({ length: 5 });

describe('test-output', () => {
  describe('formatDate()', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

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
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-23T12:00:00.000Z'));

      const result = formatDate();

      assert({
        given: 'no date argument',
        should: 'use current date',
        actual: result,
        expected: '2026-01-23'
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

    test('uses custom extension when provided', async () => {
      const path = await generateOutputPath({
        testFilename: 'test.sudo',
        date: '2026-01-23',
        slug: 'xyz',
        outputDir: 'ai-evals',
        extension: '.debug.log'
      });

      assert({
        given: 'custom extension parameter',
        should: 'use custom extension instead of default',
        actual: path,
        expected: 'ai-evals/2026-01-23-test-xyz.debug.log'
      });
    });
  });

  describe('formatTAP()', () => {
    test('formats per-assertion TAP output with descriptions', () => {
      const results = {
        passed: true,
        assertions: [
          {
            requirement: 'Given addition, should add correctly',
            passed: true,
            passCount: 2,
            totalRuns: 2,
            runResults: [
              { passed: true, output: 'ok' },
              { passed: true, output: 'ok' }
            ]
          },
          {
            requirement: 'Given format, should output JSON',
            passed: true,
            passCount: 2,
            totalRuns: 2,
            runResults: [
              { passed: true, output: 'ok' },
              { passed: true, output: 'ok' }
            ]
          }
        ]
      };

      const tap = formatTAP(results);

      assert({
        given: 'per-assertion results',
        should: 'include TAP version header',
        actual: tap.includes('TAP version 13'),
        expected: true
      });

      assert({
        given: 'two passing assertions',
        should: 'include ok with first assertion description',
        actual: tap.includes('ok 1 - Given addition, should add correctly'),
        expected: true
      });

      assert({
        given: 'two passing assertions',
        should: 'include ok with second assertion description',
        actual: tap.includes('ok 2 - Given format, should output JSON'),
        expected: true
      });

      assert({
        given: 'two assertions',
        should: 'include test plan 1..2',
        actual: tap.includes('1..2'),
        expected: true
      });

      assert({
        given: 'two passing assertions',
        should: 'include pass count',
        actual: tap.includes('# pass  2'),
        expected: true
      });
    });

    test('marks failed assertions with "not ok"', () => {
      const results = {
        passed: false,
        assertions: [
          {
            requirement: 'Given addition, should add correctly',
            passed: true,
            passCount: 2,
            totalRuns: 2,
            runResults: [{ passed: true }, { passed: true }]
          },
          {
            requirement: 'Given format, should output JSON',
            passed: false,
            passCount: 0,
            totalRuns: 2,
            runResults: [{ passed: false }, { passed: false }]
          }
        ]
      };

      const tap = formatTAP(results);

      assert({
        given: 'a failing assertion',
        should: 'use "not ok" prefix with description',
        actual: tap.includes('not ok 2 - Given format, should output JSON'),
        expected: true
      });

      assert({
        given: 'a failing assertion',
        should: 'include pass rate diagnostic',
        actual: tap.includes('# pass rate: 0/2'),
        expected: true
      });

      assert({
        given: 'one pass and one fail',
        should: 'include fail count',
        actual: tap.includes('# fail  1'),
        expected: true
      });
    });

    test('includes pass rate diagnostics for each assertion', () => {
      const results = {
        passed: true,
        assertions: [
          {
            requirement: 'Given a test, should pass',
            passed: true,
            passCount: 3,
            totalRuns: 4,
            runResults: [
              { passed: true },
              { passed: true },
              { passed: true },
              { passed: false }
            ]
          }
        ]
      };

      const tap = formatTAP(results);

      assert({
        given: 'an assertion with 3/4 passes',
        should: 'include pass rate diagnostic',
        actual: tap.includes('# pass rate: 3/4'),
        expected: true
      });
    });
  });

  describe('formatTAP() end-to-end with realistic data', () => {
    test('formats complete TAP output with scores, actual, and expected', () => {
      const results = {
        passed: true,
        assertions: [
          {
            requirement: 'Given UI implementation, should match design specifications',
            passed: true,
            passCount: 3,
            totalRuns: 4,
            averageScore: 88.75,
            runResults: [
              {
                passed: true,
                score: 95,
                actual: 'UI matches design',
                expected: 'Pixel-perfect implementation'
              },
              {
                passed: true,
                score: 90,
                actual: 'Close match with minor spacing differences',
                expected: 'Pixel-perfect implementation'
              },
              {
                passed: false,
                score: 75,
                actual: 'Layout correct but colors off',
                expected: 'Pixel-perfect implementation'
              },
              {
                passed: true,
                score: 95,
                actual: 'Exact match with design mockup',
                expected: 'Pixel-perfect implementation'
              }
            ]
          }
        ]
      };

      const tap = formatTAP(results);

      const expectedTAP = `TAP version 13
ok 1 - Given UI implementation, should match design specifications
  # pass rate: 3/4
  # avg score: 88.75
  # actual: Exact match with design mockup
  # expected: Pixel-perfect implementation
1..1
# tests 1
# pass  1
`;

      assert({
        given: 'assertion with scores, actual, and expected',
        should: 'produce complete TAP with all diagnostic features',
        actual: tap,
        expected: expectedTAP
      });
    });

    test('formats multiple assertions with mixed pass/fail', () => {
      const results = {
        passed: false,
        assertions: [
          {
            requirement: 'Given the color scheme, should use semantic colors',
            passed: true,
            passCount: 3,
            totalRuns: 4,
            averageScore: 82.5,
            runResults: [
              { passed: true, score: 90, actual: 'Uses green for pass, red for fail', expected: 'Semantic colors' },
              { passed: true, score: 85, actual: 'Uses semantic color names', expected: 'Semantic colors' },
              { passed: true, score: 75, actual: 'Color-coded status indicators', expected: 'Semantic colors' },
              { passed: false, score: 80, actual: 'Uses primary colors only', expected: 'Semantic colors' }
            ]
          },
          {
            requirement: 'Given the design, should be accessible to colorblind users',
            passed: false,
            passCount: 1,
            totalRuns: 4,
            averageScore: 55.0,
            runResults: [
              { passed: true, score: 75, actual: 'Uses patterns in addition to colors', expected: 'Colorblind accessible' },
              { passed: false, score: 50, actual: 'Colors only', expected: 'Colorblind accessible' },
              { passed: false, score: 45, actual: 'Color-only differentiation', expected: 'Colorblind accessible' },
              { passed: false, score: 50, actual: 'No alternative indicators', expected: 'Colorblind accessible' }
            ]
          }
        ]
      };

      const tap = formatTAP(results);

      assert({
        given: 'multiple assertions with mixed results',
        should: 'include both ok and not ok lines',
        actual: tap.includes('ok 1') && tap.includes('not ok 2'),
        expected: true
      });

      assert({
        given: 'two assertions with one failing',
        should: 'include fail count',
        actual: tap.includes('# fail  1'),
        expected: true
      });
    });

    test('includes actual and expected from last run', () => {
      const results = {
        passed: true,
        assertions: [
          {
            requirement: 'Given the color scheme, should use semantic colors',
            passed: true,
            passCount: 3,
            totalRuns: 4,
            averageScore: 82.5,
            runResults: [
              { passed: true, score: 90, expected: 'First run expected' },
              { passed: true, score: 85, expected: 'Second run expected' },
              { passed: true, score: 75, expected: 'Third run expected' },
              { passed: false, score: 80, expected: 'Semantic colors mapping status to intuitive colors' }
            ]
          }
        ]
      };

      const tap = formatTAP(results);

      assert({
        given: 'assertion with expected in runResults',
        should: 'include expected from last run',
        actual: tap.includes('# expected: Semantic colors mapping status to intuitive colors'),
        expected: true
      });
    });

    test('handles missing averageScore gracefully', () => {
      const results = {
        passed: true,
        assertions: [
          {
            requirement: 'Given a test, should pass',
            passed: true,
            passCount: 2,
            totalRuns: 2,
            runResults: [{ passed: true }, { passed: true }]
          }
        ]
      };

      const tap = formatTAP(results);

      assert({
        given: 'assertion without averageScore',
        should: 'not include avg score line',
        actual: tap.includes('# avg score:'),
        expected: false
      });

      assert({
        given: 'assertion without averageScore',
        should: 'still format normally',
        actual: tap.includes('ok 1 - Given a test, should pass'),
        expected: true
      });
    });

    test('handles missing actual and expected in runResults gracefully', () => {
      const results = {
        passed: true,
        assertions: [
          {
            requirement: 'Given a test, should pass',
            passed: true,
            passCount: 2,
            totalRuns: 2,
            averageScore: 85.0,
            runResults: [{ passed: true, score: 90 }, { passed: true, score: 80 }]
          }
        ]
      };

      const tap = formatTAP(results);

      assert({
        given: 'runResults without actual/expected',
        should: 'not include actual line',
        actual: tap.includes('# actual:'),
        expected: false
      });

      assert({
        given: 'runResults without actual/expected',
        should: 'not include expected line',
        actual: tap.includes('# expected:'),
        expected: false
      });

      assert({
        given: 'runResults without actual/expected',
        should: 'still include avg score',
        actual: tap.includes('# avg score: 85.00'),
        expected: true
      });
    });
  });

  describe('recordTestOutput()', () => {
    const createTestResults = () => ({
      passed: true,
      assertions: [
        {
          requirement: 'Given a test, should pass',
          passed: true,
          passCount: 2,
          totalRuns: 2,
          runResults: [{ passed: true }, { passed: true }]
        }
      ]
    });

    test('creates output file with TAP content', async () => {
      const testDir = join(tmpdir(), 'riteway-output-' + createSlug());

      try {
        mkdirSync(testDir, { recursive: true });

        const outputPath = await recordTestOutput({
          results: createTestResults(),
          testFilename: 'test.sudo',
          outputDir: testDir,
          openBrowser: false
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
      const testDir = join(tmpdir(), 'riteway-output-' + createSlug());
      const outputDir = join(testDir, 'ai-evals');

      try {
        await recordTestOutput({
          results: createTestResults(),
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
      const testDir = join(tmpdir(), 'riteway-output-' + createSlug());

      try {
        mkdirSync(testDir, { recursive: true });

        const outputPath = await recordTestOutput({
          results: createTestResults(),
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
