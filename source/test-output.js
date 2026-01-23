import { mkdir, writeFile } from 'fs/promises';
import { spawn } from 'child_process';
import { basename, join } from 'path';
import open from 'open';

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

/**
 * Generate a unique slug using cuid2.
 * @returns {Promise<string>} Generated slug
 */
export const generateSlug = () => {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['@paralleldrive/cuid2', '--slug']);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`cuid2 exited with code ${code}: ${stderr}`));
      }
      resolve(stdout.trim());
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn cuid2: ${err.message}`));
    });
  });
};

/**
 * Generate output file path.
 * @param {Object} options
 * @param {string} options.testFilename - Test file name
 * @param {string} options.date - Formatted date (YYYY-MM-DD)
 * @param {string} options.slug - Unique slug
 * @param {string} options.outputDir - Output directory path
 * @returns {Promise<string>} Output file path
 */
export const generateOutputPath = async ({ testFilename, date, slug, outputDir }) => {
  // Strip extension from filename
  const nameWithoutExt = basename(testFilename, '.sudo')
    .replace(/\.(md|txt|sudo)$/, '');
  
  const filename = `${date}-${nameWithoutExt}-${slug}.tap.md`;
  return join(outputDir, filename);
};

/**
 * Format test results as TAP output.
 * @param {Object} results - Test results object
 * @param {boolean} results.passed - Overall pass status
 * @param {number} results.passCount - Number of passed runs
 * @param {number} results.totalRuns - Total number of runs
 * @param {Array<Object>} results.runResults - Individual run results
 * @returns {string} TAP formatted output
 */
export const formatTAP = (results) => {
  const { passCount, totalRuns, runResults } = results;
  
  let tap = 'TAP version 13\n';
  
  // Add individual test results
  runResults.forEach((run, index) => {
    const testNumber = index + 1;
    const prefix = run.passed ? 'ok' : 'not ok';
    tap += `${prefix} ${testNumber}\n`;
    
    // Add output as TAP diagnostic if present
    if (run.output) {
      const outputLines = run.output.split('\n');
      outputLines.forEach(line => {
        tap += `  # ${line}\n`;
      });
    }
  });
  
  // Add test plan
  tap += `1..${totalRuns}\n`;
  
  // Add summary
  tap += `# tests ${totalRuns}\n`;
  tap += `# pass  ${passCount}\n`;
  
  const failCount = totalRuns - passCount;
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
