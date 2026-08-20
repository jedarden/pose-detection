/**
 * Error Handling Service - Manages error reporting and recovery
 */

import { EventEmitter } from 'events';

export interface AppError {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: any;
  timestamp: number;
  recoverable: boolean;
}

export class ErrorHandlingService extends EventEmitter {
  private errorHistory: AppError[] = [];
  private readonly maxHistorySize = 100;

  constructor(eventBus?: any) {
    super();
  }

  handleError(error: AppError): void {
    this.errorHistory.push(error);

    // Keep history size bounded
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }

    this.emit('error', error);
  }

  getRecentErrors(count: number = 10): AppError[] {
    return this.errorHistory.slice(-count);
  }

  getErrorById(id: string): AppError | undefined {
    return this.errorHistory.find(error => error.id === id);
  }

  clearErrors(): void {
    this.errorHistory = [];
  }

  getErrorCount(): number {
    return this.errorHistory.length;
  }

  getErrorsByType(type: string): AppError[] {
    return this.errorHistory.filter(error => error.type === type);
  }

  getErrorsBySeverity(severity: AppError['severity']): AppError[] {
    return this.errorHistory.filter(error => error.severity === severity);
  }

  dispose(): void {
    this.errorHistory = [];
    this.removeAllListeners();
  }
}
