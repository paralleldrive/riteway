import { appendFileSync } from 'fs';

/**
 * Create a debug logger that can write to console and/or log file.
 * Callers must invoke flush() to write buffered entries to disk before process exit.
 * @param {Object} options
 * @param {boolean} [options.debug=false] - Enable debug logging
 * @param {string} [options.logFile] - Optional log file path for buffered writes
 * @returns {{ log: Function, command: Function, logProcess: Function, result: Function, flush: Function }}
 */
export const createDebugLogger = ({ debug = false, logFile } = {}) => {
  if (logFile !== undefined && typeof logFile !== 'string') {
    throw new TypeError(`logFile must be a string, got ${typeof logFile}`);
  }

  const buffer = [];

  const formatMessage = (parts) =>
    parts.map(part => {
      if (typeof part !== 'object') return String(part);
      try { return JSON.stringify(part); }
      catch { return '[Circular]'; }
    }).join(' ');

  const bufferEntry = (message) => {
    if (!logFile) return;
    
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    buffer.push(logEntry);
  };

  const log = (...parts) => {
    const message = formatMessage(parts);
    
    if (debug) {
      console.error(`[DEBUG] ${message}`);
    }
    
    bufferEntry(message);
  };

  const command = (cmd, ...args) => {
    log(`Command: ${cmd} ${args.join(' ')}`);
  };

  const logProcess = (data) => {
    log('Process:', data);
  };

  const result = (data) => {
    log('Result:', data);
  };

  const flush = () => {
    if (!logFile || buffer.length === 0) return;
    appendFileSync(logFile, buffer.join(''));
    buffer.length = 0;
  };

  return { log, command, logProcess, result, flush };
};
