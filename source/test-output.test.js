import { describe, test } from 'vitest';
import { assert } from './vitest.js';
import {
  formatDate,
  generateSlug,
  generateOutputPath,
  generateLogFilePath,
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

  describe('generateLogFilePath()', () => {
    test('generates log file path with debug.log extension', async () => {
      const testDir = join(tmpdir(), 'riteway-log-' + createSlug());

      try {
        const logPath = await generateLogFilePath('test.sudo', testDir);
        
        assert({
          given: 'test filename',
          should: 'generate path with .debug.log extension',
          actual: logPath.endsWith('.debug.log'),
          expected: true
        });

        assert({
          given: 'test filename',
          should: 'include test name in path',
          actual: logPath.includes('test'),
          expected: true
        });

        assert({
          given: 'test filename',
          should: 'create output directory',
          actual: existsSync(testDir),
          expected: true
        });
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    test('uses default ai-evals directory when not provided', async () => {
      const logPath = await generateLogFilePath('test.sudo');
      
      assert({
        given: 'no output directory',
        should: 'use ai-evals directory',
        actual: logPath.startsWith('ai-evals/'),
        expected: true
      });
    });
  });

  describe('formatTAP()', () => {
    test('formats per-assertion TAP output with descriptions', () => {
      const results = {
        passed: true,
        assertions: [
          {
            description: 'Given addition, should add correctly',
            passed: true,
            passCount: 2,
            totalRuns: 2,
            runResults: [
              { passed: true, output: 'ok' },
              { passed: true, output: 'ok' }
            ]
          },
          {
            description: 'Given format, should output JSON',
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
            description: 'Given addition, should add correctly',
            passed: true,
            passCount: 2,
            totalRuns: 2,
            runResults: [{ passed: true }, { passed: true }]
          },
          {
            description: 'Given format, should output JSON',
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
            description: 'Given a test, should pass',
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

  describe('formatTAP() with colorization', () => {
    test('colorizes passing assertions with green', () => {
      const results = {
        passed: true,
        assertions: [
          {
            description: 'Given addition, should add correctly',
            passed: true,
            passCount: 2,
            totalRuns: 2,
            runResults: [{ passed: true }, { passed: true }]
          }
        ]
      };

      const tap = formatTAP(results, { color: true });

      assert({
        given: 'passing assertion with color enabled',
        should: 'include green ANSI code for ok',
        actual: tap.includes('\x1b[32mok 1\x1b[0m'),
        expected: true
      });
    });

    test('colorizes failing assertions with red', () => {
      const results = {
        passed: false,
        assertions: [
          {
            description: 'Given format, should output JSON',
            passed: false,
            passCount: 0,
            totalRuns: 2,
            runResults: [{ passed: false }, { passed: false }]
          }
        ]
      };

      const tap = formatTAP(results, { color: true });

      assert({
        given: 'failing assertion with color enabled',
        should: 'include red ANSI code for not ok',
        actual: tap.includes('\x1b[31mnot ok 1\x1b[0m'),
        expected: true
      });
    });

    test('maintains valid TAP format with colors', () => {
      const results = {
        passed: true,
        assertions: [
          {
            description: 'Given a test, should pass',
            passed: true,
            passCount: 2,
            totalRuns: 2,
            runResults: [{ passed: true }, { passed: true }]
          }
        ]
      };

      const tap = formatTAP(results, { color: true });

      assert({
        given: 'colorized output',
        should: 'still include TAP version header',
        actual: tap.includes('TAP version 13'),
        expected: true
      });

      assert({
        given: 'colorized output',
        should: 'still include test plan',
        actual: tap.includes('1..1'),
        expected: true
      });
    });

    test('defaults to no color when option not provided', () => {
      const results = {
        passed: true,
        assertions: [
          {
            description: 'Given a test, should pass',
            passed: true,
            passCount: 2,
            totalRuns: 2,
            runResults: [{ passed: true }, { passed: true }]
          }
        ]
      };

      const tap = formatTAP(results);

      assert({
        given: 'no color option',
        should: 'not include ANSI codes',
        actual: tap.includes('\x1b['),
        expected: false
      });
    });
  });

  describe('formatTAP() with media embeds', () => {
    test('embeds media attachments using markdown image syntax', () => {
      const results = {
        passed: true,
        assertions: [
          {
            description: 'Given a test, should pass',
            passed: true,
            passCount: 2,
            totalRuns: 2,
            runResults: [{ passed: true }, { passed: true }],
            media: [
              { path: './screenshots/test-result.png', caption: 'Test result screenshot' }
            ]
          }
        ]
      };

      const tap = formatTAP(results);

      assert({
        given: 'assertion with media attachment',
        should: 'include markdown image syntax',
        actual: tap.includes('![Test result screenshot](./screenshots/test-result.png)'),
        expected: true
      });
    });

    test('supports multiple media attachments per assertion', () => {
      const results = {
        passed: true,
        assertions: [
          {
            description: 'Given a test, should pass',
            passed: true,
            passCount: 2,
            totalRuns: 2,
            runResults: [{ passed: true }, { passed: true }],
            media: [
              { path: './images/before.png', caption: 'Before state' },
              { path: './images/after.png', caption: 'After state' }
            ]
          }
        ]
      };

      const tap = formatTAP(results);

      assert({
        given: 'assertion with multiple media attachments',
        should: 'embed first image',
        actual: tap.includes('![Before state](./images/before.png)'),
        expected: true
      });

      assert({
        given: 'assertion with multiple media attachments',
        should: 'embed second image',
        actual: tap.includes('![After state](./images/after.png)'),
        expected: true
      });
    });

    test('handles assertions without media gracefully', () => {
      const results = {
        passed: true,
        assertions: [
          {
            description: 'Given a test, should pass',
            passed: true,
            passCount: 2,
            totalRuns: 2,
            runResults: [{ passed: true }, { passed: true }]
          }
        ]
      };

      const tap = formatTAP(results);

      assert({
        given: 'assertion without media',
        should: 'still format normally',
        actual: tap.includes('ok 1 - Given a test, should pass'),
        expected: true
      });
    });

    test('places media section after pass rate diagnostic', () => {
      const results = {
        passed: true,
        assertions: [
          {
            description: 'Given a test, should pass',
            passed: true,
            passCount: 2,
            totalRuns: 2,
            runResults: [{ passed: true }, { passed: true }],
            media: [
              { path: './test.png', caption: 'Test' }
            ]
          }
        ]
      };

      const tap = formatTAP(results);
      const passRateIndex = tap.indexOf('# pass rate: 2/2');
      const mediaIndex = tap.indexOf('![Test](./test.png)');

      assert({
        given: 'media and pass rate diagnostic',
        should: 'place media after pass rate',
        actual: mediaIndex > passRateIndex,
        expected: true
      });
    });

    test('escapes markdown special characters in captions', () => {
      const results = {
        passed: true,
        assertions: [
          {
            description: 'Given a test, should pass',
            passed: true,
            passCount: 2,
            totalRuns: 2,
            runResults: [{ passed: true }, { passed: true }],
            media: [
              { path: './test.png', caption: 'Test](malicious.png) ![Fake' }
            ]
          }
        ]
      };

      const tap = formatTAP(results);

      assert({
        given: 'caption with markdown injection attempt',
        should: 'escape special characters',
        actual: tap.includes('![Test\\]\\(malicious.png\\) !\\[Fake](./test.png)'),
        expected: true
      });
    });

    test('escapes markdown special characters in paths', () => {
      const results = {
        passed: true,
        assertions: [
          {
            description: 'Given a test, should pass',
            passed: true,
            passCount: 2,
            totalRuns: 2,
            runResults: [{ passed: true }, { passed: true }],
            media: [
              { path: './test[1].png', caption: 'Test' }
            ]
          }
        ]
      };

      const tap = formatTAP(results);

      assert({
        given: 'path with special characters',
        should: 'escape brackets',
        actual: tap.includes('![Test](./test\\[1\\].png)'),
        expected: true
      });
    });
  });

  describe('recordTestOutput()', () => {
    const createTestResults = () => ({
      passed: true,
      assertions: [
        {
          description: 'Given a test, should pass',
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
