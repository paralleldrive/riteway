import { z } from 'zod';

/**
 * Default values for AI test runner configuration
 */
export const defaults = {
  // Test execution
  runs: 4,
  threshold: 75,
  concurrency: 4,
  
  // Agent configuration
  agent: 'claude',
  timeoutMs: 300_000,
  
  // UI/UX
  color: false,
  debug: false,
  debugLog: false
};

/**
 * Validation constraints
 */
export const constraints = {
  // Threshold must be a percentage (0-100)
  thresholdMin: 0,
  thresholdMax: 100,
  
  // Runs must be positive integer with reasonable upper bound
  runsMin: 1,
  runsMax: 1000,
  
  // Concurrency must be positive integer
  concurrencyMin: 1,
  
  // Timeout must be positive
  timeoutMinMs: 1000,
  timeoutMaxMs: 3_600_000,
  
  // Supported agent types
  supportedAgents: ['claude', 'opencode', 'cursor']
};

/**
 * Zod schemas for validation
 */

export const runsSchema = z.number()
  .int({ message: 'runs must be an integer' })
  .min(constraints.runsMin, { message: `runs must be at least ${constraints.runsMin}` })
  .max(constraints.runsMax, { message: `runs must be at most ${constraints.runsMax}` });

export const thresholdSchema = z.number()
  .finite({ message: 'threshold must be a finite number' })
  .min(constraints.thresholdMin, { message: `threshold must be at least ${constraints.thresholdMin}` })
  .max(constraints.thresholdMax, { message: `threshold must be at most ${constraints.thresholdMax}` });

export const concurrencySchema = z.number()
  .int({ message: 'concurrency must be an integer' })
  .min(constraints.concurrencyMin, { message: `concurrency must be at least ${constraints.concurrencyMin}` });

export const timeoutSchema = z.number()
  .int({ message: 'timeout must be an integer' })
  .min(constraints.timeoutMinMs, { message: `timeout must be at least ${constraints.timeoutMinMs}ms` })
  .max(constraints.timeoutMaxMs, { message: `timeout must be at most ${constraints.timeoutMaxMs}ms` });

export const agentSchema = z.enum(constraints.supportedAgents, {
  message: `agent must be one of: ${constraints.supportedAgents.join(', ')}`
});

export const calculateRequiredPassesSchema = z.object({
  runs: runsSchema,
  threshold: thresholdSchema
});

export const aiTestOptionsSchema = z.object({
  filePath: z.string().min(1, { message: 'Test file path is required' }),
  runs: runsSchema.default(defaults.runs),
  threshold: thresholdSchema.default(defaults.threshold),
  timeout: timeoutSchema.default(defaults.timeoutMs),
  concurrency: concurrencySchema.default(defaults.concurrency),
  agent: agentSchema.default(defaults.agent),
  agentConfigPath: z.string().optional(),
  debug: z.boolean().default(defaults.debug),
  debugLog: z.boolean().default(defaults.debugLog),
  color: z.boolean().default(defaults.color),
  cwd: z.string().default(process.cwd()),
  projectRoot: z.string().optional()
});
