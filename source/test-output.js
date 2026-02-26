import { mkdir, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import open from 'open';
import { init } from '@paralleldrive/cuid2';

/**
 * Format a date as YYYY-MM-DD.
 * @param {Date} [date=new Date()] - Date to format
 * @returns {string} Formatted date string
 */
export const formatDate = (date = new Date()) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createSlug = init({ length: 5 });

/**
 * Generate output file path.
 * @param {Object} options
 * @param {string} options.testFilename - Test file name
 * @param {string} options.date - Formatted date (YYYY-MM-DD)
 * @param {string} options.slug - Unique slug
 * @param {string} options.outputDir - Output directory path
 * @param {string} [options.extension='.tap.md'] - File extension
 * @returns {Promise<string>} Output file path
 */
export const generateOutputPath = async ({ testFilename, date, slug, outputDir, extension = '.tap.md' }) => {
  const nameWithoutExt = basename(testFilename, '.sudo')
    .replace(/\.(md|txt|sudo)$/, '');

  const filename = `${date}-${nameWithoutExt}-${slug}${extension}`;
  return join(outputDir, filename);
};

/**
 * Create TAP version header.
 * @returns {string} TAP version 13 header
 */
const createHeader = () => 'TAP version 13\n';

/**
 * Format assertion result line.
 * @param {Object} params
 * @param {boolean} params.passed - Whether assertion passed
 * @param {number} params.testNumber - Test number
 * @param {string} params.requirement - Assertion requirement description
 * @returns {string} TAP result line
 */
const formatResultLine = ({ passed, testNumber, requirement }) => {
  const prefix = passed ? 'ok' : 'not ok';
  return `${prefix} ${testNumber} - ${requirement}\n`;
};

/**
 * Format pass rate diagnostic.
 * @param {Object} params
 * @param {number} params.passCount - Number of passes
 * @param {number} params.totalRuns - Total number of runs
 * @returns {string} Pass rate diagnostic line
 */
const formatPassRate = ({ passCount, totalRuns }) =>
  `  # pass rate: ${passCount}/${totalRuns}\n`;

/**
 * Format average score diagnostic.
 * @param {Object} params
 * @param {number} [params.averageScore] - Average score
 * @returns {string} Average score line or empty string
 */
const formatAverageScore = ({ averageScore }) =>
  averageScore !== undefined
    ? `  # avg score: ${averageScore.toFixed(2)}\n`
    : '';

/**
 * Format actual and expected from last run.
 * @param {Object} params
 * @param {Array<Object>} [params.runResults] - Run results array
 * @returns {string} Actual/expected lines or empty string
 */
const formatLastRun = ({ runResults }) => {
  if (!runResults || runResults.length === 0) return '';

  const lastRun = runResults[runResults.length - 1];
  const actualLine = lastRun.actual !== undefined
    ? `  # actual: ${lastRun.actual}\n`
    : '';
  const expectedLine = lastRun.expected !== undefined
    ? `  # expected: ${lastRun.expected}\n`
    : '';

  return actualLine + expectedLine;
};

/**
 * Format a single assertion with all its diagnostics.
 * @param {Object} assertion - Assertion data
 * @param {number} index - Assertion index
 * @returns {string} Complete assertion TAP output
 */
const formatAssertion = (assertion, index) => {
  const testNumber = index + 1;

  return [
    formatResultLine({ passed: assertion.passed, testNumber, requirement: assertion.requirement }),
    formatPassRate({ passCount: assertion.passCount, totalRuns: assertion.totalRuns }),
    formatAverageScore({ averageScore: assertion.averageScore }),
    formatLastRun({ runResults: assertion.runResults })
  ].filter(Boolean).join('');
};

/**
 * Create TAP footer with plan and totals.
 * @param {Object} params
 * @param {Array<Object>} params.assertions - All assertions
 * @returns {string} TAP footer
 */
const createFooter = ({ assertions }) => {
  const totalAssertions = assertions.length;
  const passedAssertions = assertions.filter(a => a.passed).length;
  const failCount = totalAssertions - passedAssertions;

  const lines = [
    `1..${totalAssertions}\n`,
    `# tests ${totalAssertions}\n`,
    `# pass  ${passedAssertions}\n`
  ];

  if (failCount > 0) {
    lines.push(`# fail  ${failCount}\n`);
  }

  return lines.join('');
};

/**
 * Format test results as TAP output with per-assertion breakdown.
 *
 * The TAP output format is markdown (.tap.md), so any markdown media references
 * that agents naturally include in their responses flow through as diagnostic
 * comment lines without requiring a dedicated media schema.
 *
 * @param {Object} [results] - Test results object
 * @param {Array<Object>} [results.assertions] - Per-assertion results
 * @returns {string} TAP formatted output
 */
export const formatTAP = ({ assertions = [] } = {}) =>
  [
    createHeader(),
    ...assertions.map(formatAssertion),
    createFooter({ assertions })
  ].join('');

/**
 * Open a file in the default browser.
 * @param {string} filePath - Path to file to open
 * @returns {Promise<void>}
 */
export const openInBrowser = async (filePath) => {
  try {
    await open(filePath, { wait: false });
  } catch (err) {
    console.warn(`Could not open browser: ${err.message}`);
  }
};

/**
 * Record test output to file.
 * @param {Object} options
 * @param {Object} options.results - Test results
 * @param {string} options.testFilename - Test file name
 * @param {string} [options.outputDir='ai-evals'] - Output directory
 * @param {boolean} [options.openBrowser=true] - Whether to open in browser
 * @returns {Promise<string>} Path to output file
 */
export const recordTestOutput = async ({
  results,
  testFilename,
  outputDir = 'ai-evals',
  openBrowser = true
}) => {
  await mkdir(outputDir, { recursive: true });

  const date = formatDate();
  const slug = createSlug();
  const outputPath = await generateOutputPath({
    testFilename,
    date,
    slug,
    outputDir
  });

  const tap = formatTAP(results);
  await writeFile(outputPath, tap, 'utf-8');

  if (openBrowser) {
    await openInBrowser(outputPath);
  }

  return outputPath;
};
