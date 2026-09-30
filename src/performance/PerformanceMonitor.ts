/**
 * Performance monitoring service for real-time gait detection
 * Tracks FPS, memory usage, processing times, and system performance
 */

interface PerformanceMetrics {
  fps: number;
  averageFrameTime: number;
  memoryUsage: number;
  cpuUsage: number;
  droppedFrames: number;
  processingLatency: number;
  systemLoad: number;
}

interface FrameMetrics {
  timestamp: number;
  renderTime: number;
  memoryUsage: number;
  processingTime: number;
  accuracy: number;
}

interface PerformanceThresholds {
  minFPS: number;
  maxFrameTime: number;
  maxMemoryUsage: number;
  maxCPUUsage: number;
  maxLatency: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics;
  private frameHistory: FrameMetrics[];
  private thresholds: PerformanceThresholds;
  private maxHistorySize: number;
  private observers: ((metrics: PerformanceMetrics) => void)[];
  private startTime: number;
  private lastFrameTime: number;
  private frameCount: number;
  private droppedFrameCount: number;
  private performanceObserver?: PerformanceObserver;
  private metricsInterval: ReturnType<typeof setInterval> | null = null;

  constructor(thresholds?: Partial<PerformanceThresholds>) {
    this.metrics = {
      fps: 0,
      averageFrameTime: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      droppedFrames: 0,
      processingLatency: 0,
      systemLoad: 0
    };

    this.frameHistory = [];
    this.maxHistorySize = 100;
    this.observers = [];
    this.startTime = performance.now();
    this.lastFrameTime = this.startTime;
    this.frameCount = 0;
    this.droppedFrameCount = 0;

    this.thresholds = {
      minFPS: 30,
      maxFrameTime: 33.33, // 30 FPS = 33.33ms per frame
      maxMemoryUsage: 512 * 1024 * 1024, // 512MB
      maxCPUUsage: 80,
      maxLatency: 50,
      ...thresholds
    };

    this.initializePerformanceObserver();
    this.startMetricsCollection();
  }

  private initializePerformanceObserver(): void {
    if ('PerformanceObserver' in window) {
      this.performanceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'measure') {
            this.handlePerformanceMeasure(entry);
          }
        }
      });

      this.performanceObserver.observe({ entryTypes: ['measure'] });
    }
  }

  private handlePerformanceMeasure(entry: PerformanceEntry): void {
    if (entry.name.startsWith('gait-detection')) {
      const category = entry.name.split('-')[2];
      switch (category) {
        case 'frame':
          this.recordFrameProcessingTime(entry.duration);
          break;
        case 'inference':
          this.recordInferenceTime(entry.duration);
          break;
        case 'rendering':
          this.recordRenderingTime(entry.duration);
          break;
      }
    }
  }

  private startMetricsCollection(): void {
    if (this.metricsInterval) return;

    // Update metrics every 100ms
    this.metricsInterval = setInterval(() => {
      this.updateMetrics();
    }, 100);
  }

  public stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }

  public recordFrame(frameMetrics: Partial<FrameMetrics>): void {
    const now = performance.now();
    const frameTime = now - this.lastFrameTime;
    
    const metrics: FrameMetrics = {
      timestamp: now,
      renderTime: frameTime,
      memoryUsage: this.getCurrentMemoryUsage(),
      processingTime: frameMetrics.processingTime || 0,
      accuracy: frameMetrics.accuracy || 1.0
    };

    this.frameHistory.push(metrics);
    
    if (this.frameHistory.length > this.maxHistorySize) {
      this.frameHistory.shift();
    }

    this.frameCount++;
    this.lastFrameTime = now;

    // Check for dropped frames
    if (frameTime > this.thresholds.maxFrameTime) {
      this.droppedFrameCount++;
    }

    this.updateMetrics();
  }

  private recordFrameProcessingTime(duration: number): void {
    performance.mark('gait-detection-frame-start');
    setTimeout(() => {
      performance.mark('gait-detection-frame-end');
      performance.measure('gait-detection-frame-processing', 'gait-detection-frame-start', 'gait-detection-frame-end');
    }, duration);
  }

  private recordInferenceTime(duration: number): void {
    // Track AI inference performance
    const recentInference = this.frameHistory.slice(-10).map(f => f.processingTime);
    const avgInference = recentInference.reduce((a, b) => a + b, 0) / recentInference.length;
    
    if (duration > avgInference * 2) {
      console.warn(`Inference time spike detected: ${duration}ms (avg: ${avgInference}ms)`);
    }
  }

  private recordRenderingTime(duration: number): void {
    // Track rendering performance
    if (duration > this.thresholds.maxFrameTime) {
      console.warn(`Rendering time exceeded threshold: ${duration}ms`);
    }
  }

  private updateMetrics(): void {
    const now = performance.now();
    const timeElapsed = now - this.startTime;
    
    // Calculate FPS
    if (this.frameHistory.length > 1) {
      const recentFrames = this.frameHistory.slice(-10);
      const timeSpan = recentFrames[recentFrames.length - 1].timestamp - recentFrames[0].timestamp;
      this.metrics.fps = ((recentFrames.length - 1) / timeSpan) * 1000;
    }

    // Calculate average frame time
    if (this.frameHistory.length > 0) {
      const renderTimes = this.frameHistory.slice(-10).map(f => f.renderTime);
      this.metrics.averageFrameTime = renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length;
    }

    // Update memory usage
    this.metrics.memoryUsage = this.getCurrentMemoryUsage();

    // Calculate CPU usage approximation
    this.metrics.cpuUsage = this.estimateCPUUsage();

    // Update dropped frames
    this.metrics.droppedFrames = this.droppedFrameCount;

    // Calculate processing latency
    if (this.frameHistory.length > 0) {
      const processingTimes = this.frameHistory.slice(-10).map(f => f.processingTime);
      this.metrics.processingLatency = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
    }

    // Calculate system load
    this.metrics.systemLoad = this.calculateSystemLoad();

    // Notify observers
    this.notifyObservers();
  }

  private getCurrentMemoryUsage(): number {
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return 0;
  }

  private estimateCPUUsage(): number {
    // Rough approximation based on frame processing times
    const targetFrameTime = 1000 / 60; // 60 FPS target
    const actualFrameTime = this.metrics.averageFrameTime;
    return Math.min(100, (actualFrameTime / targetFrameTime) * 100);
  }

  private calculateSystemLoad(): number {
    // Composite score based on multiple factors
    const fpsScore = Math.max(0, 1 - (this.metrics.fps / this.thresholds.minFPS));
    const memoryScore = Math.min(1, this.metrics.memoryUsage / this.thresholds.maxMemoryUsage);
    const cpuScore = Math.min(1, this.metrics.cpuUsage / this.thresholds.maxCPUUsage);
    const latencyScore = Math.min(1, this.metrics.processingLatency / this.thresholds.maxLatency);
    
    return (fpsScore + memoryScore + cpuScore + latencyScore) / 4;
  }

  private notifyObservers(): void {
    this.observers.forEach(observer => {
      try {
        observer(this.metrics);
      } catch (error) {
        console.error('Performance observer error:', error);
      }
    });
  }

  public subscribe(observer: (metrics: PerformanceMetrics) => void): () => void {
    this.observers.push(observer);
    return () => {
      const index = this.observers.indexOf(observer);
      if (index > -1) {
        this.observers.splice(index, 1);
      }
    };
  }

  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  public getFrameHistory(): FrameMetrics[] {
    return [...this.frameHistory];
  }

  public getThresholds(): PerformanceThresholds {
    return { ...this.thresholds };
  }

  public updateThresholds(newThresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
  }

  public isPerformanceGood(): boolean {
    return (
      this.metrics.fps >= this.thresholds.minFPS &&
      this.metrics.averageFrameTime <= this.thresholds.maxFrameTime &&
      this.metrics.memoryUsage <= this.thresholds.maxMemoryUsage &&
      this.metrics.cpuUsage <= this.thresholds.maxCPUUsage &&
      this.metrics.processingLatency <= this.thresholds.maxLatency
    );
  }

  public getPerformanceIssues(): string[] {
    const issues: string[] = [];
    
    if (this.metrics.fps < this.thresholds.minFPS) {
      issues.push(`Low FPS: ${this.metrics.fps.toFixed(1)} (min: ${this.thresholds.minFPS})`);
    }
    
    if (this.metrics.averageFrameTime > this.thresholds.maxFrameTime) {
      issues.push(`High frame time: ${this.metrics.averageFrameTime.toFixed(1)}ms (max: ${this.thresholds.maxFrameTime}ms)`);
    }
    
    if (this.metrics.memoryUsage > this.thresholds.maxMemoryUsage) {
      issues.push(`High memory usage: ${(this.metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB (max: ${this.thresholds.maxMemoryUsage / 1024 / 1024}MB)`);
    }
    
    if (this.metrics.cpuUsage > this.thresholds.maxCPUUsage) {
      issues.push(`High CPU usage: ${this.metrics.cpuUsage.toFixed(1)}% (max: ${this.thresholds.maxCPUUsage}%)`);
    }
    
    if (this.metrics.processingLatency > this.thresholds.maxLatency) {
      issues.push(`High latency: ${this.metrics.processingLatency.toFixed(1)}ms (max: ${this.thresholds.maxLatency}ms)`);
    }
    
    return issues;
  }

  public reset(): void {
    this.frameHistory = [];
    this.frameCount = 0;
    this.droppedFrameCount = 0;
    this.startTime = performance.now();
    this.lastFrameTime = this.startTime;
    
    this.metrics = {
      fps: 0,
      averageFrameTime: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      droppedFrames: 0,
      processingLatency: 0,
      systemLoad: 0
    };
  }

  public dispose(): void {
    this.stop();
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }
    this.observers = [];
  }
}

export { PerformanceMonitor, type PerformanceMetrics, type FrameMetrics, type PerformanceThresholds };
