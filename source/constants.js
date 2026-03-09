import { z } from 'zod';

export const defaults = {
  runs: 4,
  threshold: 75,
  concurrency: 4,
  agent: 'claude',
  timeoutMs: 300_000,
  color: false
};

const constraints = {
  thresholdMin: 0,
  thresholdMax: 100,
  runsMin: 1,
  runsMax: 1000,
  concurrencyMin: 1,
  concurrencyMax: 50,
  timeoutMinMs: 1000,
  timeoutMaxMs: 3_600_000
};

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
  .min(constraints.concurrencyMin, { message: `concurrency must be at least ${constraints.concurrencyMin}` })
  .max(constraints.concurrencyMax, { message: `concurrency must be at most ${constraints.concurrencyMax}` });

export const timeoutSchema = z.number()
  .int({ message: 'timeout must be an integer' })
  .min(constraints.timeoutMinMs, { message: `timeout must be at least ${constraints.timeoutMinMs}ms` })
  .max(constraints.timeoutMaxMs, { message: `timeout must be at most ${constraints.timeoutMaxMs}ms` });

export const aggregationParamsSchema = z.object({
  runs: runsSchema,
  threshold: thresholdSchema
});
