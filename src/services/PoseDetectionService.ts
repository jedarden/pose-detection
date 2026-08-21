/**
 * PoseDetectionService - Real-time human pose detection and motion tracking using TensorFlow.js MoveNet
 * Optimized for general pose detection, motion tracking, and visual overlay applications
 */

import * as tf from '@tensorflow/tfjs';
import * as poseDetection from '@tensorflow-models/pose-detection';
import { 
  IPoseDetectionService,
  PoseDetectionConfig,
  PoseDetectionResult,
  PoseDetectionStats,
  PoseDetectionError,
  EnhancedKeypoint,
  KeypointName
} from '../types/pose';

const getPerformanceNow = (): number => {
  const performanceApi = typeof window !== 'undefined' ? window.performance : undefined;
  return typeof performanceApi?.now === 'function' ? performanceApi.now() : Date.now();
};

export class PoseDetectionService implements IPoseDetectionService {
  private detector: poseDetection.PoseDetector | null = null;
  private config?: PoseDetectionConfig;
  private stats: PoseDetectionStats;
  private frameCount: number = 0;
  private lastFrameTime: number = 0;
  private processingTimes: number[] = [];
  private isInitialized: boolean = false;
  
  // Motion tracking properties
  private poseHistory: PoseDetectionResult[] = [];
  private motionData: Map<string, { velocity: number; acceleration: number; lastPosition: { x: number; y: number } }> = new Map();
  private adaptivePerformance: {
    currentTargetFPS: number;
    performanceScore: number;
    frameSkipMultiplier: number;
  } = {
    currentTargetFPS: 30,
    performanceScore: 1.0,
    frameSkipMultiplier: 1
  };

  constructor(config?: PoseDetectionConfig) {
    this.config = config;
    this.stats = {
      totalPoses: 0,
      averageConfidence: 0,
      currentFPS: 0,
      avgProcessingTime: 0,
      droppedFrames: 0,
      memoryUsage: 0,
      modelLoadTime: 0
    };
  }

  /**
   * Initialize the pose detection service for real-time human pose detection
   */
  async initialize(config?: PoseDetectionConfig): Promise<void> {
    const startTime = getPerformanceNow();
    const tensorflow: any = typeof window !== 'undefined' && (window as any).tf
      ? (window as any).tf
      : tf;
    const poseDetectionApi: any = typeof window !== 'undefined' && (window as any).poseDetection
      ? (window as any).poseDetection
      : poseDetection;
    try {
      const activeConfig = config ?? this.config;
      if (!activeConfig) {
        throw new Error('Pose detection configuration is required');
      }

      this.config = activeConfig;
      this.adaptivePerformance.currentTargetFPS = activeConfig.performance.targetFPS;
      
      // Initialize TensorFlow.js with optimizations for real-time performance
      await tensorflow.ready();
      
      // Set backend with fallback logic for better compatibility
      if (activeConfig.enableGPU) {
        try {
          await tensorflow.setBackend('webgl');
          // Enhanced WebGL optimizations for real-time pose detection
          tensorflow.ENV?.set('WEBGL_PACK', true);
          tensorflow.ENV?.set('WEBGL_FORCE_F16_TEXTURES', true);
          tensorflow.ENV?.set('WEBGL_RENDER_FLOAT32_CAPABLE', true);
          tensorflow.ENV?.set('WEBGL_FLUSH_THRESHOLD', -1);
          console.log('GPU acceleration enabled for pose detection');
        } catch (gpuError) {
          console.warn('GPU initialization failed, falling back to CPU:', gpuError.message);
          await tensorflow.setBackend('cpu');
        }
      } else {
        await tensorflow.setBackend('cpu');
        console.log('CPU backend selected for pose detection');
      }
      
      // Create optimized pose detector
      const modelConfig = this.createModelConfig();
      this.detector = await poseDetectionApi.createDetector(
        poseDetectionApi.SupportedModels.MoveNet,
        modelConfig
      );
      
      // Initialize motion tracking
      this.initializeMotionTracking();
      
      this.isInitialized = true;
      this.stats.modelLoadTime = getPerformanceNow() - startTime;
      
      console.log(`Human Pose Detection Service initialized successfully:
        - Model: MoveNet ${activeConfig.modelType}
        - Backend: ${tensorflow.getBackend()}
        - Input Resolution: ${activeConfig.inputResolution.width}x${activeConfig.inputResolution.height}
        - Max Poses: ${activeConfig.maxPoses}
        - Load Time: ${this.stats.modelLoadTime.toFixed(2)}ms`);
        
    } catch (error) {
      this.isInitialized = false;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize pose detection: ${message}`);
    }
  }

  /**
   * Detect poses in a video frame with real-time optimization and motion tracking
   */
  async detectPoses(
    imageData: ImageData | HTMLVideoElement | HTMLCanvasElement
  ): Promise<PoseDetectionResult[]> {
    if (!this.isInitialized || !this.detector) {
      throw new Error('PoseDetectionService not initialized');
    }

    if (!imageData) {
      throw new Error('Invalid input: imageData is null or undefined');
    }

    const startTime = getPerformanceNow();
    
    try {
      // Adaptive frame skipping based on performance
      if (this.shouldSkipFrameAdaptive()) {
        this.stats.droppedFrames++;
        return this.getLastValidPoses();
      }

      // Run pose detection with optimized parameters
      const poses = await this.detector.estimatePoses(imageData, {
        maxPoses: this.config.maxPoses,
        flipHorizontal: false,
        scoreThreshold: this.config.validation.minPoseConfidence
      });

      // Process, validate, and enhance results with motion tracking
      const results = await this.processDetectionResults(poses);
      
      // Update motion tracking data
      this.updateMotionTracking(results);
      
      // Maintain pose history for motion analysis
      this.updatePoseHistory(results);
      
      // Update statistics and adaptive performance
      const processingTime = getPerformanceNow() - startTime;
      this.updateStats(results, processingTime);
      this.updateAdaptivePerformance(processingTime);
      
      return results;
    } catch (error) {
      console.error('Pose detection failed:', error);
      // Return last valid poses on error to maintain continuity
      return this.getLastValidPoses();
    }
  }

  /**
   * Get current detection statistics
   */
  getStats(): PoseDetectionStats {
    // Update memory usage
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      this.stats.memoryUsage = (performance as any).memory.usedJSHeapSize / 1024 / 1024;
    }
    
    return { ...this.stats };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PoseDetectionConfig>): void {
    this.validateConfig(config);
    this.config = { ...this.config, ...config };
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    if (this.detector) {
      this.detector.dispose();
      this.detector = null;
    }
    this.isInitialized = false;
    this.resetStats();
  }

  /**
   * Check if service is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.detector !== null;
  }

  /**
   * Create model configuration based on service config
   */
  private createModelConfig(): poseDetection.MoveNetModelConfig {
    const modelType = this.config.modelType === 'lightning' 
      ? poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
      : poseDetection.movenet.modelType.SINGLEPOSE_THUNDER;

    return {
      modelType,
      enableSmoothing: false, // We handle smoothing separately
      minPoseScore: this.config.validation.minPoseConfidence,
      multiPoseMaxDimension: Math.max(
        this.config.inputResolution.width,
        this.config.inputResolution.height
      )
    };
  }

  /**
   * Process raw detection results
   */
  private async processDetectionResults(
    poses: poseDetection.Pose[]
  ): Promise<PoseDetectionResult[]> {
    const results: PoseDetectionResult[] = [];
    const timestamp = Date.now();

    for (const pose of poses) {
      // Filter poses by confidence threshold
      if (pose.score < this.config.validation.minPoseConfidence) {
        continue;
      }

      // Convert keypoints to enhanced format
      const enhancedKeypoints = this.convertToEnhancedKeypoints(pose.keypoints, timestamp);
      
      // Calculate bounding box
      const boundingBox = this.calculateBoundingBox(enhancedKeypoints);
      
      // Create pose detection result
      const result: PoseDetectionResult = {
        keypoints: enhancedKeypoints,
        confidence: pose.score,
        timestamp,
        id: this.generatePoseId(),
        boundingBox,
        personId: pose.id?.toString()
      };

      results.push(result);
    }

    return results;
  }

  /**
   * Convert keypoints to enhanced format with proper confidence filtering
   */
  private convertToEnhancedKeypoints(
    keypoints: poseDetection.Keypoint[],
    timestamp: number
  ): EnhancedKeypoint[] {
    const keypointNameMap: { [key: string]: KeypointName } = {
      'nose': KeypointName.NOSE,
      'left_eye': KeypointName.LEFT_EYE,
      'right_eye': KeypointName.RIGHT_EYE,
      'left_ear': KeypointName.LEFT_EAR,
      'right_ear': KeypointName.RIGHT_EAR,
      'left_shoulder': KeypointName.LEFT_SHOULDER,
      'right_shoulder': KeypointName.RIGHT_SHOULDER,
      'left_elbow': KeypointName.LEFT_ELBOW,
      'right_elbow': KeypointName.RIGHT_ELBOW,
      'left_wrist': KeypointName.LEFT_WRIST,
      'right_wrist': KeypointName.RIGHT_WRIST,
      'left_hip': KeypointName.LEFT_HIP,
      'right_hip': KeypointName.RIGHT_HIP,
      'left_knee': KeypointName.LEFT_KNEE,
      'right_knee': KeypointName.RIGHT_KNEE,
      'left_ankle': KeypointName.LEFT_ANKLE,
      'right_ankle': KeypointName.RIGHT_ANKLE
    };

    // Use individual keypoint confidence threshold for better filtering
    const minKeypointConfidence = this.config.smoothing.minConfidence;

    return keypoints
      .filter(kp => kp.score >= minKeypointConfidence)
      .map(kp => {
        const keypointName = keypointNameMap[kp.name] || KeypointName.NOSE;
        const trackingId = this.generateKeypointTrackingId(keypointName, timestamp);
        
        return {
          x: kp.x,
          y: kp.y,
          score: kp.score,
          name: keypointName,
          visibility: this.calculateVisibility(kp.score),
          timestamp,
          trackingId
        };
      });
  }

  /**
   * Calculate enhanced bounding box for pose with padding for visual overlay
   */
  private calculateBoundingBox(keypoints: EnhancedKeypoint[]): { x: number; y: number; width: number; height: number } {
    if (keypoints.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    // Only use keypoints with good confidence for bounding box
    const validKeypoints = keypoints.filter(kp => kp.score >= 0.5);
    if (validKeypoints.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const xs = validKeypoints.map(kp => kp.x);
    const ys = validKeypoints.map(kp => kp.y);
    
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    // Add padding for better visual representation (10% of dimensions)
    const width = maxX - minX;
    const height = maxY - minY;
    const paddingX = width * 0.1;
    const paddingY = height * 0.1;
    
    return {
      x: Math.max(0, minX - paddingX),
      y: Math.max(0, minY - paddingY),
      width: width + (paddingX * 2),
      height: height + (paddingY * 2)
    };
  }

  /**
   * Generate unique pose ID
   */
  private generatePoseId(): string {
    return `pose_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Adaptive frame skipping based on performance metrics
   */
  private shouldSkipFrameAdaptive(): boolean {
    if (!this.config.performance.enableFrameSkipping) {
      return false;
    }

    this.frameCount++;
    
    // Dynamic frame skipping based on performance
    const skipInterval = this.config.performance.frameSkipInterval * this.adaptivePerformance.frameSkipMultiplier;
    
    return this.frameCount % Math.ceil(skipInterval) !== 0;
  }

  /**
   * Get last valid poses for continuity during frame skipping
   */
  private getLastValidPoses(): PoseDetectionResult[] {
    if (this.poseHistory.length === 0) {
      return [];
    }
    
    // Return the most recent poses with updated timestamps
    const lastPoses = this.poseHistory[this.poseHistory.length - 1];
    return lastPoses ? [{ ...lastPoses, timestamp: Date.now() }] : [];
  }

  /**
   * Initialize motion tracking system
   */
  private initializeMotionTracking(): void {
    this.poseHistory = [];
    this.motionData.clear();
    this.adaptivePerformance = {
      currentTargetFPS: this.config.performance.targetFPS,
      performanceScore: 1.0,
      frameSkipMultiplier: 1
    };
  }

  /**
   * Update motion tracking data for detected poses
   */
  private updateMotionTracking(results: PoseDetectionResult[]): void {
    const currentTime = Date.now();
    
    for (const pose of results) {
      for (const keypoint of pose.keypoints) {
        const key = `${pose.id}_${keypoint.name}`;
        const currentPos = { x: keypoint.x, y: keypoint.y };
        
        if (this.motionData.has(key)) {
          const motionInfo = this.motionData.get(key)!;
          const lastPos = motionInfo.lastPosition;
          
          // Calculate velocity (pixels per second)
          const distance = Math.sqrt(
            Math.pow(currentPos.x - lastPos.x, 2) + 
            Math.pow(currentPos.y - lastPos.y, 2)
          );
          const timeDelta = (currentTime - keypoint.timestamp) / 1000; // Convert to seconds
          const velocity = timeDelta > 0 ? distance / timeDelta : 0;
          
          // Calculate acceleration
          const acceleration = Math.abs(velocity - motionInfo.velocity);
          
          // Update motion data
          this.motionData.set(key, {
            velocity,
            acceleration,
            lastPosition: currentPos
          });
        } else {
          // Initialize motion data for new keypoint
          this.motionData.set(key, {
            velocity: 0,
            acceleration: 0,
            lastPosition: currentPos
          });
        }
      }
    }
  }

  /**
   * Update pose history for motion analysis
   */
  private updatePoseHistory(results: PoseDetectionResult[]): void {
    // Store pose results for history
    this.poseHistory.push(...results);
    
    // Maintain reasonable history size for performance
    const maxHistorySize = this.config.smoothing.historySize * 2;
    if (this.poseHistory.length > maxHistorySize) {
      this.poseHistory = this.poseHistory.slice(-maxHistorySize);
    }
  }

  /**
   * Update adaptive performance based on processing metrics
   */
  private updateAdaptivePerformance(processingTime: number): void {
    const targetFrameTime = 1000 / this.adaptivePerformance.currentTargetFPS;
    
    // Calculate performance score (1.0 = perfect, <1.0 = slow, >1.0 = fast)
    this.adaptivePerformance.performanceScore = targetFrameTime / processingTime;
    
    // Adjust frame skip multiplier based on performance
    if (this.adaptivePerformance.performanceScore < 0.7) {
      // Performance is poor, increase frame skipping
      this.adaptivePerformance.frameSkipMultiplier = Math.min(4, this.adaptivePerformance.frameSkipMultiplier * 1.1);
    } else if (this.adaptivePerformance.performanceScore > 1.3) {
      // Performance is good, reduce frame skipping
      this.adaptivePerformance.frameSkipMultiplier = Math.max(0.5, this.adaptivePerformance.frameSkipMultiplier * 0.9);
    }
  }

  /**
   * Generate tracking ID for keypoint temporal consistency
   */
  private generateKeypointTrackingId(keypointName: KeypointName, timestamp: number): string {
    return `${keypointName}_${timestamp % 10000}`;
  }

  /**
   * Calculate visibility score based on confidence
   */
  private calculateVisibility(confidence: number): number {
    // Enhanced visibility calculation for better visual feedback
    if (confidence >= 0.8) return 1.0;
    if (confidence >= 0.6) return 0.8;
    if (confidence >= 0.4) return 0.6;
    if (confidence >= 0.3) return 0.4;
    return 0.2;
  }

  /**
   * Update detection statistics
   */
  private updateStats(results: PoseDetectionResult[], processingTime: number): void {
    this.stats.totalPoses += results.length;
    this.processingTimes.push(processingTime);
    
    // Keep only recent processing times for accurate averaging
    if (this.processingTimes.length > 100) {
      this.processingTimes = this.processingTimes.slice(-100);
    }
    
    this.stats.avgProcessingTime = this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;
    
    // Calculate FPS
    const currentTime = getPerformanceNow();
    if (this.lastFrameTime > 0) {
      const frameDuration = currentTime - this.lastFrameTime;
      this.stats.currentFPS = 1000 / frameDuration;
    }
    this.lastFrameTime = currentTime;
    
    // Calculate average confidence
    if (results.length > 0) {
      const totalConfidence = results.reduce((sum, result) => sum + result.confidence, 0);
      this.stats.averageConfidence = totalConfidence / results.length;
    }
  }

  /**
   * Reset statistics
   */
  private resetStats(): void {
    this.stats = {
      totalPoses: 0,
      averageConfidence: 0,
      currentFPS: 0,
      avgProcessingTime: 0,
      droppedFrames: 0,
      memoryUsage: 0,
      modelLoadTime: 0
    };
    this.processingTimes = [];
    this.frameCount = 0;
    this.lastFrameTime = 0;
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: Partial<PoseDetectionConfig>): void {
    if (config.validation?.minPoseConfidence !== undefined) {
      if (config.validation.minPoseConfidence < 0 || config.validation.minPoseConfidence > 1) {
        throw new Error('minPoseConfidence must be between 0 and 1');
      }
    }
    
    if (config.smoothing?.smoothingFactor !== undefined) {
      if (config.smoothing.smoothingFactor < 0 || config.smoothing.smoothingFactor > 1) {
        throw new Error('smoothingFactor must be between 0 and 1');
      }
    }
    
    if (config.performance?.targetFPS !== undefined) {
      if (config.performance.targetFPS <= 0) {
        throw new Error('targetFPS must be greater than 0');
      }
    }
  }

  /**
   * Get history size for debugging
   */
  getHistorySize(): number {
    return this.processingTimes.length;
  }

  /**
   * Get motion tracking data for keypoints
   */
  getMotionData(): Map<string, { velocity: number; acceleration: number; lastPosition: { x: number; y: number } }> {
    return new Map(this.motionData);
  }

  /**
   * Get pose history for motion analysis
   */
  getPoseHistory(limit?: number): PoseDetectionResult[] {
    if (limit && limit > 0) {
      return this.poseHistory.slice(-limit);
    }
    return [...this.poseHistory];
  }

  /**
   * Get adaptive performance metrics
   */
  getPerformanceMetrics(): {
    currentTargetFPS: number;
    performanceScore: number;
    frameSkipMultiplier: number;
    recommendedConfig?: string;
  } {
    let recommendedConfig = '';
    
    if (this.adaptivePerformance.performanceScore < 0.5) {
      recommendedConfig = 'Consider reducing input resolution or switching to Lightning model';
    } else if (this.adaptivePerformance.performanceScore > 2.0) {
      recommendedConfig = 'Performance is excellent - consider enabling higher quality settings';
    }

    return {
      ...this.adaptivePerformance,
      recommendedConfig
    };
  }

  /**
   * Clear motion tracking data
   */
  clearMotionData(): void {
    this.motionData.clear();
    this.poseHistory = [];
  }

  /**
   * Get enhanced statistics including motion tracking metrics
   */
  getEnhancedStats(): PoseDetectionStats & {
    motionDataSize: number;
    poseHistorySize: number;
    adaptivePerformance: typeof this.adaptivePerformance;
    avgKeypointsPerPose: number;
  } {
    const baseStats = this.getStats();
    const avgKeypointsPerPose = this.poseHistory.length > 0 
      ? this.poseHistory.reduce((sum, pose) => sum + pose.keypoints.length, 0) / this.poseHistory.length 
      : 0;

    return {
      ...baseStats,
      motionDataSize: this.motionData.size,
      poseHistorySize: this.poseHistory.length,
      adaptivePerformance: { ...this.adaptivePerformance },
      avgKeypointsPerPose: Math.round(avgKeypointsPerPose * 100) / 100
    };
  }
}
