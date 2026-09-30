import { Pose } from '@tensorflow-models/pose-detection';
import {
  AdaptiveQualityManager,
  QualityProfile
} from './AdaptiveQualityManager';
import {
  PerformanceMonitor,
  PerformanceMetrics
} from './PerformanceMonitor';
import {
  OptimizedRenderingPipeline,
  RenderingStats
} from '../rendering/OptimizedRenderingPipeline';
import { MemoryManager } from '../memory/MemoryManager';

export interface RuntimeVideoFrame {
  data: ImageData;
  timestamp: number;
  width: number;
  height: number;
}

export interface RuntimePerformanceMetrics {
  frameRate: number;
  averageProcessingTime: number;
  memoryUsage: number;
  droppedFrames: number;
  processingLatency: number;
  modelInferenceTime: number;
  renderingTime: number;
  overallHealth: 'excellent' | 'good' | 'fair' | 'poor';
  qualityProfile: string;
}

export interface RuntimePerformanceOptions {
  targetFPS?: number;
  enableGPUAcceleration?: boolean;
  onQualityChange?: (profile: QualityProfile) => void;
}

type RuntimeObserver = (metrics: RuntimePerformanceMetrics) => void;

const KEYPOINT_NAMES = [
  'nose',
  'left_eye',
  'right_eye',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle'
];

/**
 * Owns the optimized runtime components used by the active webcam flow.
 * Keeping them behind one lifecycle boundary prevents a camera session from
 * leaving performance timers, pooled objects, or rendering callbacks alive.
 */
export class RuntimePerformanceManager {
  private readonly performanceMonitor: PerformanceMonitor;
  private readonly qualityManager: AdaptiveQualityManager;
  private readonly renderingPipeline: OptimizedRenderingPipeline;
  private readonly memoryManager: MemoryManager;
  private readonly observers: RuntimeObserver[] = [];
  private readonly targetFPS: number;
  private isRunning = false;
  private isDisposed = false;

  constructor(
    canvas: HTMLCanvasElement,
    options: RuntimePerformanceOptions = {}
  ) {
    this.targetFPS = options.targetFPS ?? 30;
    this.performanceMonitor = new PerformanceMonitor({
      minFPS: this.targetFPS,
      maxFrameTime: 1000 / this.targetFPS
    });
    this.memoryManager = new MemoryManager();
    this.qualityManager = new AdaptiveQualityManager(this.performanceMonitor);
    this.renderingPipeline = new OptimizedRenderingPipeline(canvas, {
      targetFPS: this.targetFPS,
      enableGPUAcceleration: options.enableGPUAcceleration ?? true
    });

    this.qualityManager.subscribe((profile) => {
      this.renderingPipeline.updateOptions({
        targetFPS: profile.frameRate,
        enableGPUAcceleration: profile.enableGPUAcceleration
      });
      options.onQualityChange?.(profile);
      this.notifyObservers();
    });

    this.performanceMonitor.subscribe(() => this.notifyObservers());
    this.renderingPipeline.subscribe(() => this.notifyObservers());

    // Apply the device-selected profile to the active camera before the first
    // frame, while still allowing the camera service to no-op before start.
    options.onQualityChange?.(this.qualityManager.getCurrentProfile());
  }

  public start(): void {
    if (this.isDisposed) {
      throw new Error('RuntimePerformanceManager has been disposed');
    }

    if (this.isRunning) return;

    this.isRunning = true;
    this.memoryManager.startMonitoring();
    this.renderingPipeline.start();
  }

  public stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    this.renderingPipeline.stop();
    this.renderingPipeline.clear();
    this.memoryManager.stopMonitoring();
  }

  public renderFrame(
    frame: RuntimeVideoFrame,
    pose: Pose | null,
    metrics: Record<string, unknown>,
    showOverlays: boolean
  ): void {
    if (!this.isRunning || this.isDisposed) return;

    const startTime = performance.now();
    const poses = pose ? [this.toRenderPose(pose)] : [];
    const overlays = showOverlays
      ? [
          ...(poses.length > 0
            ? [{ type: 'skeleton' as const, data: null, visible: true, opacity: 1 }]
            : []),
          { type: 'metrics' as const, data: { metrics }, visible: true, opacity: 0.9 }
        ]
      : [];

    this.renderingPipeline.queueFrame({
      id: `camera-frame-${frame.timestamp}`,
      timestamp: frame.timestamp,
      imageData: frame.data,
      poses,
      overlays,
      priority: 1
    });

    this.performanceMonitor.recordFrame({
      processingTime: performance.now() - startTime,
      timestamp: frame.timestamp,
      memoryUsage: this.memoryManager.getMemoryUsage()
    });
  }

  public subscribe(observer: RuntimeObserver): () => void {
    this.observers.push(observer);
    return () => {
      const index = this.observers.indexOf(observer);
      if (index !== -1) this.observers.splice(index, 1);
    };
  }

  public getMetrics(): RuntimePerformanceMetrics {
    return this.combineMetrics(
      this.performanceMonitor.getMetrics(),
      this.renderingPipeline.getStats()
    );
  }

  public getQualityProfile(): QualityProfile {
    return this.qualityManager.getCurrentProfile();
  }

  public dispose(): void {
    if (this.isDisposed) return;

    this.stop();
    this.isDisposed = true;
    this.observers.length = 0;
    this.qualityManager.dispose();
    this.renderingPipeline.dispose();
    this.performanceMonitor.dispose();
    this.memoryManager.dispose();
  }

  private toRenderPose(pose: Pose) {
    const keypoints = pose.keypoints.map((keypoint, index) => ({
      x: keypoint.x,
      y: keypoint.y,
      confidence: keypoint.score ?? 0,
      name: keypoint.name ?? KEYPOINT_NAMES[index] ?? `keypoint-${index}`
    }));

    const xs = keypoints.map((keypoint) => keypoint.x);
    const ys = keypoints.map((keypoint) => keypoint.y);

    return {
      keypoints,
      confidence: pose.score ?? 0,
      bbox: {
        x: xs.length > 0 ? Math.min(...xs) : 0,
        y: ys.length > 0 ? Math.min(...ys) : 0,
        width: xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 0,
        height: ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 0
      }
    };
  }

  private combineMetrics(
    performanceMetrics: PerformanceMetrics,
    renderingStats: RenderingStats
  ): RuntimePerformanceMetrics {
    const frameRate = Number.isFinite(performanceMetrics.fps) ? performanceMetrics.fps : 0;
    const health = frameRate >= this.targetFPS
      ? 'excellent'
      : frameRate >= this.targetFPS * 0.8
        ? 'good'
        : frameRate >= this.targetFPS * 0.5
          ? 'fair'
          : 'poor';

    return {
      frameRate,
      averageProcessingTime: performanceMetrics.averageFrameTime,
      memoryUsage: performanceMetrics.memoryUsage / (1024 * 1024),
      droppedFrames: Math.max(performanceMetrics.droppedFrames, renderingStats.droppedFrames),
      processingLatency: performanceMetrics.processingLatency,
      modelInferenceTime: 0,
      renderingTime: renderingStats.frameTime,
      overallHealth: health,
      qualityProfile: this.qualityManager.getCurrentProfile().name
    };
  }

  private notifyObservers(): void {
    const metrics = this.getMetrics();
    this.observers.forEach((observer) => {
      try {
        observer(metrics);
      } catch (error) {
        console.error('Runtime performance observer error:', error);
      }
    });
  }
}
