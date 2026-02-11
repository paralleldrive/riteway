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

  describe('formatTAP() end-to-end with realistic data', () => {
    test('formats complete TAP output with all features: scores, actual/expected, and media', () => {
      const results = {
        passed: true,
        assertions: [
          {
            description: 'Given UI implementation, should match design specifications',
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
            ],
            media: [
              { path: './screenshots/ui-final.png', caption: 'Final UI implementation' },
              { path: './screenshots/design-mockup.png', caption: 'Original design mockup' }
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
  # ![Final UI implementation](./screenshots/ui-final.png)
  # ![Original design mockup](./screenshots/design-mockup.png)
1..1
# tests 1
# pass  1
`;

      assert({
        given: 'assertion with scores, actual/expected, and media',
        should: 'produce complete TAP with all diagnostic features',
        actual: tap,
        expected: expectedTAP
      });
    });

    test('formats complete TAP output with multiple assertions, scores, actual, and expected', () => {
      const results = {
        passed: false,
        assertions: [
          {
            description: 'Given the color scheme, should use semantic colors',
            passed: true,
            passCount: 3,
            totalRuns: 4,
            averageScore: 82.5,
            runResults: [
              {
                passed: true,
                score: 90,
                actual: 'Uses green for pass, red for fail',
                expected: 'Semantic colors mapping status to intuitive colors'
              },
              {
                passed: true,
                score: 85,
                actual: 'Uses semantic color names',
                expected: 'Semantic colors mapping status to intuitive colors'
              },
              {
                passed: true,
                score: 75,
                actual: 'Color-coded status indicators',
                expected: 'Semantic colors mapping status to intuitive colors'
              },
              {
                passed: false,
                score: 80,
                actual: 'Uses green for pass, red for fail, yellow for pending',
                expected: 'Semantic colors mapping status to intuitive colors'
              }
            ]
          },
          {
            description: 'Given the design, should be accessible to colorblind users',
            passed: false,
            passCount: 1,
            totalRuns: 4,
            averageScore: 35.0,
            runResults: [
              {
                passed: false,
                score: 20,
                actual: 'Uses only red/green distinction',
                expected: 'Colorblind-safe design with patterns, shapes, or high-contrast alternatives'
              },
              {
                passed: false,
                score: 30,
                actual: 'No alternative indicators',
                expected: 'Colorblind-safe design with patterns, shapes, or high-contrast alternatives'
              },
              {
                passed: true,
                score: 60,
                actual: 'Includes pattern overlays for status',
                expected: 'Colorblind-safe design with patterns, shapes, or high-contrast alternatives'
              },
              {
                passed: false,
                score: 30,
                actual: 'Uses only red/green distinction without alternative indicators',
                expected: 'Colorblind-safe design with patterns, shapes, or high-contrast alternatives'
              }
            ]
          },
          {
            description: 'Given performance requirements, should load within 100ms',
            passed: true,
            passCount: 4,
            totalRuns: 4,
            averageScore: 95.0,
            runResults: [
              {
                passed: true,
                score: 100,
                actual: 'Loads in 45ms',
                expected: 'Loads within 100ms threshold'
              },
              {
                passed: true,
                score: 95,
                actual: 'Loads in 60ms',
                expected: 'Loads within 100ms threshold'
              },
              {
                passed: true,
                score: 90,
                actual: 'Loads in 75ms',
                expected: 'Loads within 100ms threshold'
              },
              {
                passed: true,
                score: 95,
                actual: 'Loads in 55ms',
                expected: 'Loads within 100ms threshold'
              }
            ]
          }
        ]
      };

      const tap = formatTAP(results);

      const expectedTAP = `TAP version 13
ok 1 - Given the color scheme, should use semantic colors
  # pass rate: 3/4
  # avg score: 82.50
  # actual: Uses green for pass, red for fail, yellow for pending
  # expected: Semantic colors mapping status to intuitive colors
not ok 2 - Given the design, should be accessible to colorblind users
  # pass rate: 1/4
  # avg score: 35.00
  # actual: Uses only red/green distinction without alternative indicators
  # expected: Colorblind-safe design with patterns, shapes, or high-contrast alternatives
ok 3 - Given performance requirements, should load within 100ms
  # pass rate: 4/4
  # avg score: 95.00
  # actual: Loads in 55ms
  # expected: Loads within 100ms threshold
1..3
# tests 3
# pass  2
# fail  1
`;

      assert({
        given: 'realistic multi-assertion test data',
        should: 'produce complete valid TAP output',
        actual: tap,
        expected: expectedTAP
      });
    });

    test('formats TAP with mixed data availability across assertions', () => {
      const results = {
        passed: true,
        assertions: [
          {
            description: 'Given complete data, should include all diagnostics',
            passed: true,
            passCount: 2,
            totalRuns: 2,
            averageScore: 87.5,
            runResults: [
              {
                passed: true,
                score: 85,
                actual: 'First result',
                expected: 'Expected result'
              },
              {
                passed: true,
                score: 90,
                actual: 'Complete implementation with all features',
                expected: 'Full feature set as specified'
              }
            ]
          },
          {
            description: 'Given missing score, should skip avg score line',
            passed: true,
            passCount: 2,
            totalRuns: 2,
            runResults: [
              { passed: true, actual: 'Has actual', expected: 'Has expected' },
              { passed: true, actual: 'Result without score', expected: 'Expected without score' }
            ]
          },
          {
            description: 'Given missing actual/expected, should skip those lines',
            passed: true,
            passCount: 2,
            totalRuns: 2,
            averageScore: 75.0,
            runResults: [
              { passed: true, score: 80 },
              { passed: true, score: 70 }
            ]
          }
        ]
      };

      const tap = formatTAP(results);

      const expectedTAP = `TAP version 13
ok 1 - Given complete data, should include all diagnostics
  # pass rate: 2/2
  # avg score: 87.50
  # actual: Complete implementation with all features
  # expected: Full feature set as specified
ok 2 - Given missing score, should skip avg score line
  # pass rate: 2/2
  # actual: Result without score
  # expected: Expected without score
ok 3 - Given missing actual/expected, should skip those lines
  # pass rate: 2/2
  # avg score: 75.00
1..3
# tests 3
# pass  3
`;

      assert({
        given: 'assertions with mixed data availability',
        should: 'produce valid TAP with appropriate diagnostics',
        actual: tap,
        expected: expectedTAP
      });
    });
  });

  describe('formatTAP() with score diagnostics', () => {
    test('includes average score diagnostic with 2 decimal places', () => {
      const results = {
        passed: true,
        assertions: [
          {
            description: 'Given a test, should pass',
            passed: true,
            passCount: 3,
            totalRuns: 4,
            averageScore: 82.5,
            runResults: [
              { passed: true, score: 90 },
              { passed: true, score: 85 },
              { passed: true, score: 75 },
              { passed: false, score: 80 }
            ]
          }
        ]
      };

      const tap = formatTAP(results);

      assert({
        given: 'assertion with averageScore',
        should: 'include avg score diagnostic with 2 decimals',
        actual: tap.includes('# avg score: 82.50'),
        expected: true
      });
    });

    test('includes actual from last run', () => {
      const results = {
        passed: true,
        assertions: [
          {
            description: 'Given color scheme, should use semantic colors',
            passed: true,
            passCount: 3,
            totalRuns: 4,
            averageScore: 82.5,
            runResults: [
              { passed: true, score: 90, actual: 'First run actual' },
              { passed: true, score: 85, actual: 'Second run actual' },
              { passed: true, score: 75, actual: 'Third run actual' },
              { passed: false, score: 80, actual: 'Uses green for pass, red for fail, yellow for pending' }
            ]
          }
        ]
      };

      const tap = formatTAP(results);

      assert({
        given: 'assertion with actual in runResults',
        should: 'include actual from last run',
        actual: tap.includes('# actual: Uses green for pass, red for fail, yellow for pending'),
        expected: true
      });
    });

    test('includes expected from last run', () => {
      const results = {
        passed: true,
        assertions: [
          {
            description: 'Given color scheme, should use semantic colors',
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
            description: 'Given a test, should pass',
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
