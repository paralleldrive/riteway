import { createError } from 'error-causes';

/**
 * Parse the judge agent's TAP YAML diagnostic output into a structured object.
 *
 * @param {string} output - Raw output from judge agent containing TAP YAML block
 * @returns {{ passed: boolean, actual: string, expected: string, score: number }}
 * @throws {Error} If no valid TAP YAML block found
 */
export const parseTAPYAML = (output) => {
  // Strict regex: requires --- at line boundaries. LLMs sometimes add surrounding text,
  // so strict matching ensures we only accept clean TAP YAML blocks.
  const match = output.match(/^---\s*\n([\s\S]*?)\n---\s*$/m);
  if (!match) {
    throw createError({
      name: 'ParseError',
      message: 'Judge output does not contain a valid TAP YAML block (--- delimited)',
      code: 'JUDGE_INVALID_TAP_YAML',
      rawOutput: output
    });
  }

  const yaml = match[1];
  const lines = yaml.split('\n');
  const result = /** @type {{ passed: boolean, actual: string, expected: string, score: number }} */ ({});

  for (const line of lines) {
    const kvMatch = line.match(/^(\w+):\s*(.+)$/);
    if (kvMatch) {
      const [, key, rawValue] = kvMatch;
      // Strip surrounding quotes if present
      const value = rawValue.replace(/^["']|["']$/g, '').trim();
      if (key === 'passed') result.passed = value === 'true';
      else if (key === 'score') result.score = Number(value);
      else result[key] = value;
    }
  }

  return result;
};
