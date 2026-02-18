import { createError } from 'error-causes';
import { ParseError } from './ai-errors.js';

/**
 * Parse a string result from an agent, attempting multiple strategies:
 * 1. Direct JSON parse if string starts with { or [
 * 2. Extract and parse markdown-wrapped JSON (```json\n...\n```)
 * 3. Keep as plain text if neither works
 */
export const parseStringResult = (result, logger) => {
  const trimmed = result.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      logger.log('Successfully parsed string as JSON');
      return parsed;
    } catch {
      logger.log('Direct JSON parse failed, trying markdown extraction');
    }
  }

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

  logger.log('String is not valid JSON, keeping as plain text');
  return result;
};

/**
 * Parse OpenCode's NDJSON output, extracting and concatenating all "text" events.
 */
export const parseOpenCodeNDJSON = (ndjson, logger) => {
  logger.log('Parsing OpenCode NDJSON output...');

  const lines = ndjson.trim().split('\n').filter(line => line.trim());

  const textEvents = lines.reduce((acc, line) => {
    try {
      const event = JSON.parse(line);
      if (event.type === 'text' && event.part?.text) {
        logger.log(`Found text event with ${event.part.text.length} characters`);
        return [...acc, event.part.text];
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
 * Unwrap a JSON envelope object { result: ... }, returning the inner value.
 * If no envelope is present, returns the object as-is.
 * Shared helper used by unwrapAgentResult and execute-agent's raw output handling.
 */
export const unwrapEnvelope = (parsed) =>
  parsed?.result !== undefined ? parsed.result : parsed;

/**
 * Unwrap agent result from potential JSON envelope and parse nested JSON.
 * Handles Claude CLI's envelope format { result: "..." } and nested JSON strings.
 * @throws {Error} If output is not valid JSON after all parsing attempts
 */
export const unwrapAgentResult = (processedOutput, logger) => {
  const parsed = parseStringResult(processedOutput, logger);

  if (typeof parsed === 'string') {
    throw createError({
      ...ParseError,
      message: `Agent output is not valid JSON: ${parsed.slice(0, 100)}`,
      outputPreview: parsed.slice(0, 100)
    });
  }

  const unwrapped = unwrapEnvelope(parsed);

  logger.log(`Parsed result type: ${typeof unwrapped}`);
  if (typeof unwrapped === 'string') {
    logger.log('Result is string, attempting to parse as JSON');
    return parseStringResult(unwrapped, logger);
  }

  return unwrapped;
};
