import { describe, test, vi, beforeEach } from 'vitest';
import { assert } from './vitest.js';
import { Try } from './riteway.js';
import { handleAIErrors, allNoop } from './ai-errors.js';

vi.mock('fs/promises', () => ({
  writeFile: vi.fn()
}));

const fsMock = await import('fs/promises');
const { initAgentRegistry } = await import('./ai-init.js');
const { registryFileName } = await import('./agent-config.js');

describe('initAgentRegistry()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('writes registry JSON to riteway.agent-config.json in cwd', async () => {
    fsMock.writeFile.mockResolvedValue();

    await initAgentRegistry({ cwd: '/project' });

    assert({
      given: 'cwd with no existing registry file',
      should: 'write to the correct path',
      actual: fsMock.writeFile.mock.calls[0][0],
      expected: `/project/${registryFileName}`
    });
  });

  test('registry JSON contains all three built-in agent keys', async () => {
    fsMock.writeFile.mockResolvedValue();

    await initAgentRegistry({ cwd: '/project' });

    const registry = JSON.parse(fsMock.writeFile.mock.calls[0][1]);

    assert({
      given: 'written registry content',
      should: 'include all three built-in agents',
      actual: Object.keys(registry).sort(),
      expected: ['claude', 'cursor', 'opencode']
    });
  });

  test('each registry entry includes command, args, and outputFormat', async () => {
    fsMock.writeFile.mockResolvedValue();

    await initAgentRegistry({ cwd: '/project' });

    const registry = JSON.parse(fsMock.writeFile.mock.calls[0][1]);

    assert({
      given: 'opencode entry in written registry',
      should: 'have outputFormat ndjson',
      actual: registry.opencode.outputFormat,
      expected: 'ndjson'
    });

    assert({
      given: 'claude entry in written registry',
      should: 'have command and outputFormat from built-in config',
      actual: { command: registry.claude.command, outputFormat: registry.claude.outputFormat },
      expected: { command: 'claude', outputFormat: 'json' }
    });

    assert({
      given: 'cursor entry in written registry',
      should: 'have command "agent" and outputFormat json',
      actual: { command: registry.cursor.command, outputFormat: registry.cursor.outputFormat },
      expected: { command: 'agent', outputFormat: 'json' }
    });
  });

  test('returns the path of the written file', async () => {
    fsMock.writeFile.mockResolvedValue();

    const result = await initAgentRegistry({ cwd: '/project' });

    assert({
      given: 'successful registry write',
      should: 'return the absolute path of the written file',
      actual: result,
      expected: `/project/${registryFileName}`
    });
  });

  test('throws ValidationError when registry file already exists without --force', async () => {
    fsMock.writeFile.mockRejectedValue(Object.assign(new Error('EEXIST'), { code: 'EEXIST' }));

    const error = await Try(initAgentRegistry, { cwd: '/project' });

    const invoked = [];
    handleAIErrors({ ...allNoop, ValidationError: () => invoked.push('ValidationError') })(error);

    assert({
      given: 'existing registry file and no --force flag',
      should: 'throw an error that routes to the ValidationError handler',
      actual: invoked,
      expected: ['ValidationError']
    });
  });

  test('includes the filename and --force hint in the error message', async () => {
    fsMock.writeFile.mockRejectedValue(Object.assign(new Error('EEXIST'), { code: 'EEXIST' }));

    const error = await Try(initAgentRegistry, { cwd: '/project' });

    assert({
      given: 'file already exists error',
      should: 'mention the filename in the message',
      actual: /riteway\.agent-config\.json/.test(error?.cause?.message),
      expected: true
    });

    assert({
      given: 'file already exists error',
      should: 'mention --force in the message',
      actual: /--force/.test(error?.cause?.message),
      expected: true
    });
  });

  test('overwrites existing file when --force is set', async () => {
    fsMock.writeFile.mockResolvedValue();

    await initAgentRegistry({ force: true, cwd: '/project' });

    assert({
      given: 'existing registry file and --force flag',
      should: 'write with overwrite flag (not exclusive-create)',
      actual: fsMock.writeFile.mock.calls[0][2],
      expected: { flag: 'w' }
    });
  });

  test('uses exclusive-create flag when --force is not set', async () => {
    fsMock.writeFile.mockResolvedValue();

    await initAgentRegistry({ cwd: '/project' });

    assert({
      given: 'no --force flag',
      should: 'write with exclusive-create flag',
      actual: fsMock.writeFile.mock.calls[0][2],
      expected: { flag: 'wx' }
    });
  });

  test('uses process.cwd() when cwd is not provided', async () => {
    fsMock.writeFile.mockResolvedValue();

    await initAgentRegistry();

    assert({
      given: 'no cwd argument',
      should: 'default to writing in process.cwd()',
      actual: fsMock.writeFile.mock.calls[0][0],
      expected: `${process.cwd()}/${registryFileName}`
    });
  });

  test('throws OutputError when writeFile fails with unexpected error', async () => {
    fsMock.writeFile.mockRejectedValue(Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }));

    const error = await Try(initAgentRegistry, { cwd: '/project' });

    const invoked = [];
    handleAIErrors({ ...allNoop, OutputError: () => invoked.push('OutputError') })(error);

    assert({
      given: 'writeFile fails with a non-EEXIST error',
      should: 'throw an error that routes to the OutputError handler',
      actual: invoked,
      expected: ['OutputError']
    });
  });
});
