import { createError } from 'error-causes';
import { ExtractionParseError, ExtractionValidationError } from './ai-errors.js';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

const assertionRequiredFields = ['id', 'requirement'];

/**
 * Resolve and read import files, concatenating their contents.
 *
 * SECURITY NOTE: Import paths are NOT validated for path traversal.
 * This allows legitimate cross-project imports (e.g., shared prompt libraries).
 * Test authors are responsible for not importing sensitive files (.env, credentials).
 * See PR #394 remediation epic (Wave 1, Task 2) for design rationale.
 *
 * @param {string[]} importPaths - Array of import file paths relative to project root
 * @param {string} projectRoot - Project root directory for resolving relative paths
 * @param {boolean} debug - Enable debug logging
 * @returns {Promise<string>} Concatenated content from all import files
 */
export const resolveImportPaths = async (importPaths, projectRoot, debug) => {
  if (debug) {
    console.error(`[DEBUG] Found ${importPaths.length} imports to resolve`);
  }
  const importedContents = await Promise.all(
    importPaths.map(async importPath => {
      // Resolve import paths relative to project root
      const resolvedPath = resolve(projectRoot, importPath);
      if (debug) {
        console.error(`[DEBUG] Reading import: ${importPath} -> ${resolvedPath}`);
      }
      // Read file with error wrapping (preserves original error as cause)
      try {
        const content = await readFile(resolvedPath, 'utf-8');
        return content;
      } catch (originalError) {
        throw createError({
          name: 'ValidationError',
          message: `Failed to read imported prompt file: ${importPath}`,
          code: 'PROMPT_READ_FAILED',
          path: importPath,
          resolvedPath,
          cause: originalError
        });
      }
    })
  );
  const result = importedContents.join('\n\n');
  if (debug) {
    console.error(`[DEBUG] Imported content length: ${result.length} characters`);
  }
  return result;
};

/**
 * Extract JSON from markdown code fences if present.
 * @param {string} str - String that might contain markdown code fences
 * @returns {string} Extracted JSON string
 */
export const extractJSONFromMarkdown = (str) => {
  // Match ```json\n...\n``` or ```\n...\n```
  const match = str.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  return match ? match[1] : str;
};

/**
 * Try to parse a string as JSON, extracting from markdown code fences if needed.
 * @param {string} str - String to parse as JSON
 * @returns {any} Parsed JSON
 * @throws {Error} If parsing fails
 */
export const tryParseJSON = (str) => {
  try {
    const cleaned = extractJSONFromMarkdown(str);
    return JSON.parse(cleaned);
  } catch (originalError) {
    throw createError({
      ...ExtractionParseError,
      rawInput: str,
      cause: originalError
    });
  }
};

/**
 * Parse and validate extraction output from the agent.
 * Accepts either a raw JSON string or an already-parsed object
 * (since executeAgent returns parsed JSON).
 * Handles markdown code fences if present.
 *
 * @param {string|Object} rawOutput - Raw string or parsed output from the agent
 * @returns {{ userPrompt: string, importPaths: string[], assertions: Array<{ id: number, requirement: string }> }}
 * @throws {Error} If output is invalid or missing required fields
 */
export const parseExtractionResult = (rawOutput) => {
  const parsed = typeof rawOutput === 'string'
    ? tryParseJSON(rawOutput)
    : rawOutput;

  if (typeof parsed !== 'object' || parsed === null) {
    throw createError({
      ...ExtractionValidationError,
      message: 'Extraction result must be a JSON object',
      rawOutput
    });
  }

  if (parsed.userPrompt === undefined || parsed.userPrompt === null) {
    throw createError({
      ...ExtractionValidationError,
      message: 'Extraction result is missing required field: userPrompt',
      rawOutput
    });
  }

  if (!Array.isArray(parsed.importPaths)) {
    throw createError({
      ...ExtractionValidationError,
      message: 'Extraction result is missing required field: importPaths (must be an array)',
      rawOutput
    });
  }

  if (!Array.isArray(parsed.assertions)) {
    throw createError({
      ...ExtractionValidationError,
      message: 'Extraction result is missing required field: assertions (must be an array)',
      rawOutput
    });
  }

  // for loop preferred: early throw on first invalid item avoids
  // processing the rest, and the index is needed for the error message.
  for (let i = 0; i < parsed.assertions.length; i++) {
    for (const field of assertionRequiredFields) {
      if (parsed.assertions[i][field] === undefined || parsed.assertions[i][field] === null) {
        throw createError({
          ...ExtractionValidationError,
          message: `Assertion at index ${i} is missing required field: ${field}`,
          assertionIndex: i,
          missingField: field,
          rawOutput
        });
      }
    }
  }

  return parsed;
};
