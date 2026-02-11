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
 * Generate a unique 5-character slug using cuid2.
 * @returns {string} Generated slug
 */
export const generateSlug = () => createSlug();

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
  // Strip extension from filename
  const nameWithoutExt = basename(testFilename, '.sudo')
    .replace(/\.(md|txt|sudo)$/, '');
  
  const filename = `${date}-${nameWithoutExt}-${slug}${extension}`;
  return join(outputDir, filename);
};

/**
 * Escape markdown special characters to prevent injection.
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
const escapeMarkdown = (text) => {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
};

/**
 * Format test results as TAP output with per-assertion breakdown.
 * @param {Object} results - Test results object
 * @param {boolean} results.passed - Overall pass status
 * @param {Array<Object>} results.assertions - Per-assertion results
 * @returns {string} TAP formatted output
 */
export const formatTAP = (results) => {
  const { assertions } = results;

  let tap = 'TAP version 13\n';

  assertions.forEach((assertion, index) => {
    const testNumber = index + 1;
    const prefix = assertion.passed ? 'ok' : 'not ok';
    tap += `${prefix} ${testNumber} - ${assertion.requirement}\n`;
    tap += `  # pass rate: ${assertion.passCount}/${assertion.totalRuns}\n`;

    // Add average score if available
    if (assertion.averageScore !== undefined) {
      tap += `  # avg score: ${assertion.averageScore.toFixed(2)}\n`;
    }

    // Add actual and expected from last run if available
    if (assertion.runResults && assertion.runResults.length > 0) {
      const lastRun = assertion.runResults[assertion.runResults.length - 1];
      if (lastRun.actual !== undefined) {
        tap += `  # actual: ${lastRun.actual}\n`;
      }
      if (lastRun.expected !== undefined) {
        tap += `  # expected: ${lastRun.expected}\n`;
      }
    }

    // Add media embeds if present
    if (assertion.media && assertion.media.length > 0) {
      assertion.media.forEach(({ path, caption }) => {
        const escapedCaption = escapeMarkdown(caption);
        const escapedPath = escapeMarkdown(path);
        tap += `  # ![${escapedCaption}](${escapedPath})\n`;
      });
    }
  });

  const totalAssertions = assertions.length;
  const passedAssertions = assertions.filter(a => a.passed).length;

  tap += `1..${totalAssertions}\n`;
  tap += `# tests ${totalAssertions}\n`;
  tap += `# pass  ${passedAssertions}\n`;

  const failCount = totalAssertions - passedAssertions;
  if (failCount > 0) {
    tap += `# fail  ${failCount}\n`;
  }

  return tap;
};

/**
 * Open a file in the default browser.
 * @param {string} filePath - Path to file to open
 * @returns {Promise<void>}
 */
export const openInBrowser = async (filePath) => {
  try {
    await open(filePath, { wait: false });
  } catch (err) {
    // Silently fail - browser opening is a nice-to-have
    console.warn(`Could not open browser: ${err.message}`);
  }
};

/**
 * Generate a log file path for debug output.
 * @param {string} testFilename - Test file name
 * @param {string} [outputDir='ai-evals'] - Output directory
 * @returns {Promise<string>} Path to log file
 */
export const generateLogFilePath = async (testFilename, outputDir = 'ai-evals') => {
  await mkdir(outputDir, { recursive: true });
  
  const date = formatDate();
  const slug = await generateSlug();
  return generateOutputPath({
    testFilename,
    date,
    slug,
    outputDir,
    extension: '.debug.log'
  });
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
  // Create output directory if it doesn't exist
  await mkdir(outputDir, { recursive: true });
  
  // Generate output path
  const date = formatDate();
  const slug = await generateSlug();
  const outputPath = await generateOutputPath({
    testFilename,
    date,
    slug,
    outputDir
  });
  
  // Format and write TAP output
  const tap = formatTAP(results);
  await writeFile(outputPath, tap, 'utf-8');
  
  // Open in browser if requested
  if (openBrowser) {
    await openInBrowser(outputPath);
  }
  
  return outputPath;
};
