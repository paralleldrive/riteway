import { appendFileSync } from 'fs';

/**
 * Create a debug logger that can write to console and/or log file.
 * @param {Object} options
 * @param {boolean} [options.debug=false] - Enable debug logging
 * @param {string} [options.logFile] - Optional log file path
 * @returns {Object} Logger with log, command, process, result, and flush methods
 */
export const createDebugLogger = ({ debug = false, logFile } = {}) => {
  const buffer = [];

  const formatMessage = (parts) => {
    return parts.map(part => 
      typeof part === 'object' ? JSON.stringify(part) : String(part)
    ).join(' ');
  };

  const writeToFile = (message) => {
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
    
    writeToFile(message);
  };

  const command = (cmd, args = []) => {
    log(`Command: ${cmd} ${args.join(' ')}`);
  };

  const process = (data) => {
    log('Process:', data);
  };

  const result = (data) => {
    log('Result:', data);
  };

  const flush = () => {
    if (!logFile || buffer.length === 0) return;
    
    for (const entry of buffer) {
      appendFileSync(logFile, entry);
    }
    buffer.length = 0;
  };

  return { log, command, process, result, flush };
};
