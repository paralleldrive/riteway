import { createError } from 'error-causes';
import { ExtractionParseError, ExtractionValidationError, ValidationError } from './ai-errors.js';
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
 */
export const resolveImportPaths = async (importPaths, projectRoot, debug) => {
  if (debug) {
    console.error(`[DEBUG] Found ${importPaths.length} imports to resolve`);
  }
  const importedContents = await Promise.all(
    importPaths.map(async importPath => {
      const resolvedPath = resolve(projectRoot, importPath);
      if (debug) {
        console.error(`[DEBUG] Reading import: ${importPath} -> ${resolvedPath}`);
      }
      try {
        return await readFile(resolvedPath, 'utf-8');
      } catch (originalError) {
        throw createError({
          ...ValidationError,
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

/** Extract JSON from markdown code fences if present. */
export const extractJSONFromMarkdown = (str) => {
  const match = str.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  return match ? match[1] : str;
};

/**
 * Try to parse a string as JSON, extracting from markdown code fences if needed.
 * @throws {Error} If parsing fails
 */
export const tryParseJSON = (str) => {
  try {
    return JSON.parse(extractJSONFromMarkdown(str));
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
 * Accepts either a raw JSON string or an already-parsed object.
 * Handles markdown code fences if present.
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

  // for loop: early throw on first invalid item; index needed for error context
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
