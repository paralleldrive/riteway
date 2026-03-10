import { createError } from 'error-causes';
import { ParseError } from './ai-errors.js';

/**
 * Parse a string result from an agent, attempting multiple strategies:
 * 1. Direct JSON parse if string starts with { or [
 * 2. Extract and parse markdown-wrapped JSON (```json\n...\n```)
 * 3. Keep as plain text if neither works
 */
export const parseStringResult = (result) => {
  const trimmed = result.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // fall through to markdown extraction
    }
  }

  const markdownMatch = result.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (markdownMatch) {
    try {
      return JSON.parse(markdownMatch[1]);
    } catch {
      // fall through to plain text
    }
  }

  return result;
};

/**
 * Parse OpenCode's NDJSON output, extracting and concatenating all "text" events.
 */
export const parseOpenCodeNDJSON = (ndjson) => {
  const lines = ndjson.trim().split('\n').filter(line => line.trim());

  const textEvents = lines.reduce((acc, line) => {
    try {
      const event = JSON.parse(line);
      if (event.type === 'text' && event.part?.text) {
        return [...acc, event.part.text];
      }
    } catch {
      // skip malformed lines
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

  return textEvents.join('');
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
export const unwrapAgentResult = (processedOutput) => {
  const parsed = parseStringResult(processedOutput);

  if (typeof parsed === 'string') {
    throw createError({
      ...ParseError,
      message: `Agent output is not valid JSON: ${parsed.slice(0, 100)}`,
      outputPreview: parsed.slice(0, 100)
    });
  }

  const unwrapped = unwrapEnvelope(parsed);

  if (typeof unwrapped === 'string') {
    return parseStringResult(unwrapped);
  }

  return unwrapped;
};
