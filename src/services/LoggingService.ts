/**
 * Logging Service - Centralized logging system
 * Provides structured logging with different levels and persistence
 * In production builds, debug and info logs are no-ops for performance
 */

import { EventEmitter } from 'events';

export interface LogEntry {
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  data?: any;
  timestamp: number;
  source?: string;
}

export class LoggingService extends EventEmitter {
  private logs: LogEntry[] = [];
  private maxLogSize = 1000;
  private isProduction: boolean;

  constructor() {
    super();
    // Detect production environment
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  public async initialize(): Promise<void> {
    this.emit('initialized');
  }

  public error(message: string, data?: any, source?: string): void {
    this.log('error', message, data, source);
  }

  public warn(message: string, data?: any, source?: string): void {
    this.log('warn', message, data, source);
  }

  public info(message: string, data?: any, source?: string): void {
    // In production, info logs are no-ops
    if (this.isProduction) {
      return;
    }
    this.log('info', message, data, source);
  }

  public debug(message: string, data?: any, source?: string): void {
    // In production, debug logs are no-ops (critical for per-frame logging)
    if (this.isProduction) {
      return;
    }
    this.log('debug', message, data, source);
  }

  private log(level: LogEntry['level'], message: string, data?: any, source?: string): void {
    const entry: LogEntry = {
      level,
      message,
      data,
      timestamp: Date.now(),
      source: source || 'LoggingService'
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogSize) {
      this.logs.shift();
    }

    // Console output (already gated at info/debug level)
    const timestamp = new Date(entry.timestamp).toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] [${entry.source}] ${message}`;

    switch (level) {
      case 'error':
        console.error(logMessage, data || '');
        break;
      case 'warn':
        console.warn(logMessage, data || '');
        break;
      case 'info':
        console.info(logMessage, data || '');
        break;
      case 'debug':
        console.debug(logMessage, data || '');
        break;
    }

    this.emit('logEntry', entry);
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public getLogsByLevel(level: LogEntry['level']): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  public clearLogs(): void {
    this.logs = [];
    this.emit('logsCleared');
  }

  public getStatus(): any {
    return {
      logCount: this.logs.length,
      errorCount: this.logs.filter(l => l.level === 'error').length,
      warnCount: this.logs.filter(l => l.level === 'warn').length
    };
  }
}