import { createError } from 'error-causes';
import { ParseError } from './ai-errors.js';

/**
 * Parse a string result from an agent, attempting multiple strategies.
 * Strategies (in order):
 * 1. Direct JSON parse if string starts with { or [
 * 2. Extract and parse markdown-wrapped JSON (```json\n...\n```)
 * 3. Keep as plain text if neither works
 * @param {string} result - String to parse
 * @param {Object} logger - Debug logger instance
 * @returns {Object|string} Parsed object or original string
 */
export const parseStringResult = (result, logger) => {
  const trimmed = result.trim();

  // Strategy 1: Try parsing as direct JSON if it looks like JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      logger.log('Successfully parsed string as JSON');
      return parsed;
    } catch {
      // Fall through to try markdown extraction
      logger.log('Direct JSON parse failed, trying markdown extraction');
    }
  }

  // Strategy 2: Try extracting markdown-wrapped JSON
  const markdownMatch = result.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (markdownMatch) {
    logger.log('Found markdown-wrapped JSON, extracting...');
    try {
      const parsed = JSON.parse(markdownMatch[1]);
      logger.log('Successfully parsed markdown-wrapped JSON');
      return parsed;
    } catch {
      logger.log('Failed to parse markdown content, keeping original string');
    }
  }

  // Strategy 3: Keep as plain text
  logger.log('String is not valid JSON, keeping as plain text');
  return result;
};

/**
 * Parse OpenCode's NDJSON (newline-delimited JSON) output format.
 * OpenCode emits multiple JSON objects separated by newlines, with different event types.
 * We extract and concatenate all "text" events to get the final response.
 * @param {string} ndjson - NDJSON output from OpenCode
 * @param {Object} logger - Debug logger instance
 * @returns {string} Concatenated text from all text events
 */
export const parseOpenCodeNDJSON = (ndjson, logger) => {
  logger.log('Parsing OpenCode NDJSON output...');

  const lines = ndjson.trim().split('\n').filter(line => line.trim());

  const textEvents = lines.reduce((acc, line) => {
    try {
      const event = JSON.parse(line);
      if (event.type === 'text' && event.part?.text) {
        logger.log(`Found text event with ${event.part.text.length} characters`);
        acc.push(event.part.text);
      }
    } catch (err) {
      logger.log(`Warning: Failed to parse NDJSON line: ${err.message}`);
    }
    return acc;
  }, []);

  if (textEvents.length === 0) {
    throw createError({
      ...ParseError,
      message: 'No text events found in OpenCode output',
      code: 'NO_TEXT_EVENTS',
      ndjsonLength: ndjson.length,
      linesProcessed: lines.length
    });
  }

  const combinedText = textEvents.join('');
  logger.log(`Combined ${textEvents.length} text event(s) into ${combinedText.length} characters`);

  return combinedText;
};

/**
 * Unwrap agent result from potential JSON envelope and parse nested JSON.
 * Handles Claude CLI's envelope format { result: "..." } and nested JSON strings.
 * Pure function with no mutation - performs full unwrapping in a single pass.
 * @param {string} processedOutput - Preprocessed stdout from agent
 * @param {Object} logger - Debug logger instance
 * @returns {Object} Unwrapped and parsed result
 * @throws {Error} If output is not valid JSON after all parsing attempts
 */
export const unwrapAgentResult = (processedOutput, logger) => {
  // Step 1: Parse the initial output
  const parsed = parseStringResult(processedOutput, logger);

  // Step 2: If parsing kept it as a string, that's an error (not valid JSON)
  if (typeof parsed === 'string') {
    throw createError({
      ...ParseError,
      message: `Agent output is not valid JSON: ${parsed.slice(0, 100)}`,
      outputPreview: parsed.slice(0, 100)
    });
  }

  // Step 3: Unwrap envelope if present (Claude CLI wraps in { result: ... })
  const unwrapped = parsed.result !== undefined ? parsed.result : parsed;

  // Step 4: If unwrapped value is a string, try parsing it as JSON again
  logger.log(`Parsed result type: ${typeof unwrapped}`);
  if (typeof unwrapped === 'string') {
    logger.log('Result is string, attempting to parse as JSON');
    return parseStringResult(unwrapped, logger);
  }

  return unwrapped;
};
