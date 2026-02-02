#!/usr/bin/env node

import { resolve as resolvePath } from 'path';
import { readFileSync } from 'fs';
import resolve from 'resolve';
import minimist from 'minimist';
import { globSync } from 'glob';
import dotignore from 'dotignore';

const resolveModule = resolve.sync;
const createMatcher = dotignore.createMatcher;

const asyncPipe = (...fns) => x => fns.reduce(async (y, f) => f(await y), x);

export const parseArgs = (argv) => {
  const opts = minimist(argv, {
    alias: { r: 'require', i: 'ignore' },
    string: ['require', 'ignore'],
    default: { r: [], i: null }
  });
  
  return {
    require: Array.isArray(opts.require) ? opts.require : [opts.require].filter(Boolean),
    ignore: opts.ignore,
    patterns: opts._,
    cwd: process.cwd()
  };
};

export const loadModules = async ({ require: modules, ...rest }) => {
  await Promise.all(
    modules.map(async (module) => {
      const options = { basedir: rest.cwd, extensions: ['.js', '.mjs', '.json'] };
      await import(resolveModule(module, options));
    })
  );
  return { require: modules, ...rest };
};

export const createIgnoreMatcher = ({ ignore, cwd, ...rest }) => {
  if (!ignore) return { ...rest, cwd, matcher: null };
  
  try {
    const ignoreStr = readFileSync(resolvePath(cwd, ignore || '.gitignore'), 'utf-8');
    return { ...rest, cwd, matcher: createMatcher(ignoreStr) };
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
};

export const resolveTestFiles = ({ patterns, matcher, cwd, ...rest }) => {
  const files = patterns
    .flatMap(pattern => globSync(pattern))
    .filter(file => !matcher || !matcher.shouldIgnore(file))
    .map(file => resolvePath(cwd, file));
    
  return { ...rest, files };
};

export const runTests = async ({ files }) => {
  await Promise.all(files.map(file => import(file)));
};

const main = asyncPipe(
  parseArgs,
  loadModules,
  createIgnoreMatcher,
  resolveTestFiles,
  runTests
);

main(process.argv.slice(2)).catch(console.error);
