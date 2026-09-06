import { LoggerService as NestLoggerService } from '@nestjs/common';
import * as winston from 'winston';

import { loggerConfig } from './logger.config';

interface LogOptions {
  save?: boolean; // сохранять в файл через winston (default: true)
  logData?: boolean; // выводить в консоль data вместо message (default: false)
}

const LEVEL_COLORS: Record<string, string> = {
  info: '\x1b[32m', // green
  error: '\x1b[31m', // red
  warn: '\x1b[33m', // yellow
  debug: '\x1b[35m', // magenta
  verbose: '\x1b[36m', // cyan
};
const RESET = '\x1b[0m';
const YELLOW_CONTEXT = '\x1b[33m';

const LEVEL_LABELS: Record<string, string> = {
  info: 'LOG',
  error: 'ERROR',
  warn: 'WARN',
  debug: 'DEBUG',
  verbose: 'VERBOSE',
};

function formatTimestamp(): string {
  const date = new Date();
  const datePart = date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
  const timePart = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
}

export class LoggerService implements NestLoggerService {
  private static readonly fileLogger = winston.createLogger(loggerConfig);
  private readonly pid = process.pid;

  constructor(private context?: string) {}

  log(message: string, data?: any, options?: LogOptions) {
    this.write('info', message, data, options);
  }

  error(message: string, data?: any, options?: LogOptions) {
    this.write('error', message, data, options);
  }

  warn(message: string, data?: any, options?: LogOptions) {
    this.write('warn', message, data, options);
  }

  debug(message: string, data?: any, options?: LogOptions) {
    this.write('debug', message, data, options);
  }

  verbose(message: string, data?: any, options?: LogOptions) {
    this.write('verbose', message, data, options);
  }

  private write(
    level: 'info' | 'error' | 'warn' | 'debug' | 'verbose',
    message: string,
    data?: any,
    { save = true, logData = false }: LogOptions = {},
  ) {
    const consoleOutput = logData && data !== undefined ? data : message;
    const text =
      typeof consoleOutput === 'string'
        ? consoleOutput
        : JSON.stringify(consoleOutput);

    this.printConsole(level, text);

    if (save) {
      LoggerService.fileLogger.log(level, message, {
        context: this.context,
        ...(data !== undefined ? { data } : {}),
      });
    }
  }

  private printConsole(level: string, message: string) {
    const color = LEVEL_COLORS[level] ?? '';
    const label = LEVEL_LABELS[level] ?? level.toUpperCase();
    const contextPart = this.context
      ? `${YELLOW_CONTEXT}[${this.context}]${RESET} `
      : '';

    const line =
      `${color}[Nest] ${this.pid}  - ${RESET}` +
      `${formatTimestamp()}     ` +
      `${color}${label}${RESET} ` +
      `${contextPart}` +
      `${color}${message}${RESET}`;

    const stream = level === 'error' ? console.error : console.log;
    stream(line);
  }
}
