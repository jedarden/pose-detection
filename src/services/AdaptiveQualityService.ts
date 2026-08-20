/**
 * Adaptive Quality Service - Manages adaptive quality settings based on performance
 */

import { EventEmitter } from 'events';

export interface QualitySettings {
  videoResolution: { width: number; height: number };
  frameRate: number;
  modelType: 'lightning' | 'thunder';
  processEveryNthFrame: number;
  renderQuality: 'high' | 'medium' | 'low';
  enableGPUAcceleration: boolean;
  enableWebWorkers: boolean;
}

export class AdaptiveQualityService extends EventEmitter {
  private settings: QualitySettings;
  private performanceHistory: number[] = [];
  private readonly maxHistorySize = 60;

  constructor(initialSettings?: QualitySettings) {
    super();
    this.settings = initialSettings || {
      videoResolution: { width: 640, height: 480 },
      frameRate: 30,
      modelType: 'lightning',
      processEveryNthFrame: 1,
      renderQuality: 'medium',
      enableGPUAcceleration: true,
      enableWebWorkers: false
    };
  }

  updatePerformanceMetrics(frameRate: number, processingTime: number): void {
    this.performanceHistory.push(frameRate);

    if (this.performanceHistory.length > this.maxHistorySize) {
      this.performanceHistory.shift();
    }

    // Auto-adjust quality if performance is poor
    if (frameRate < 15 && this.settings.modelType === 'thunder') {
      this.settings.modelType = 'lightning';
      this.emit('qualityChanged', this.settings);
    }
  }

  applyRecommendations(recommendations: any): void {
    if (recommendations.modelType) {
      this.settings.modelType = recommendations.modelType;
    }
    if (recommendations.processEveryNthFrame) {
      this.settings.processEveryNthFrame = recommendations.processEveryNthFrame;
    }
    this.emit('qualityChanged', this.settings);
  }

  getSettings(): QualitySettings {
    return { ...this.settings };
  }

  updateSettings(updates: Partial<QualitySettings>): void {
    this.settings = { ...this.settings, ...updates };
    this.emit('qualityChanged', this.settings);
  }

  getAverageFrameRate(): number {
    if (this.performanceHistory.length === 0) return 0;
    const sum = this.performanceHistory.reduce((a, b) => a + b, 0);
    return sum / this.performanceHistory.length;
  }

  reset(): void {
    this.performanceHistory = [];
  }

  dispose(): void {
    this.performanceHistory = [];
    this.removeAllListeners();
  }
}
