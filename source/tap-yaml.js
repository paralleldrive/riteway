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

  const parseField = (key, rawValue) => {
    const value = rawValue.replace(/^["']|["']$/g, '').trim();
    if (key === 'passed') return { [key]: value === 'true' };
    if (key === 'score') return { [key]: Number(value) };
    return { [key]: value };
  };

  return match[1]
    .split('\n')
    .map(line => line.match(/^(\w+):\s*(.+)$/))
    .filter(Boolean)
    .reduce((acc, [, key, rawValue]) => ({ ...acc, ...parseField(key, rawValue) }), {});
};
