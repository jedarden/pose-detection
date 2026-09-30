/**
 * GaitVisualizationSystem - Main integration class for gait detection
 * Coordinates all visualization components and manages the processing pipeline
 * Implements the complete system architecture from the research
 */

import { SkeletonRenderer } from './SkeletonRenderer';
import { GaitTrajectoryRenderer } from './GaitTrajectoryRenderer';
import { GaitParameterDisplay } from './GaitParameterDisplay';
import { QualityIndicators } from './QualityIndicators';
import { AnimationController } from './AnimationController';
import { Pose as TensorFlowPose } from '@tensorflow-models/pose-detection';
import { GaitParameters as ServiceGaitParameters } from '../services/GaitAnalysisService';

import { 
  VisualizationSettings, 
  Pose as VisualizationPose,
  GaitParameters, 
  QualityMetrics, 
  PerformanceMetrics,
  ModelConfig,
  CameraCalibration,
  GaitAnalysisResult
} from '../types/gait';

// Mock pose detection for development
interface MockPoseDetector {
  estimatePoses(video: HTMLVideoElement): Promise<VisualizationPose[]>;
}

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

export class GaitVisualizationSystem {
  private canvas: HTMLCanvasElement;
  private qualityContainer: HTMLElement;
  private parametersContainer: HTMLElement;
  private video: HTMLVideoElement;
  
  // Core components
  private skeletonRenderer: SkeletonRenderer;
  private trajectoryRenderer: GaitTrajectoryRenderer;
  private parameterDisplay: GaitParameterDisplay;
  private qualityIndicators: QualityIndicators;
  private animationController: AnimationController;
  
  // Processing components
  private poseDetector: MockPoseDetector | null = null;
  private stream: MediaStream | null = null;
  
  // State management
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private settings: VisualizationSettings;
  private frameCount: number = 0;
  private lastFrameTime: number = 0;
  
  // Performance tracking
  private performanceMetrics: PerformanceMetrics = {
    frameRate: 0,
    averageRenderTime: 0,
    memoryUsage: 0,
    droppedFrames: 0,
    processingLatency: 0
  };

  constructor(
    canvas: HTMLCanvasElement, 
    qualityContainer: HTMLElement, 
    parametersContainer: HTMLElement
  ) {
    this.canvas = canvas;
    this.qualityContainer = qualityContainer;
    this.parametersContainer = parametersContainer;
    
    // Create video element
    this.video = document.createElement('video');
    this.video.autoplay = true;
    this.video.muted = true;
    this.video.playsInline = true;
    
    // Initialize with default settings
    this.settings = {
      skeletonOpacity: 0.8,
      trajectoryOpacity: 0.6,
      showConfidence: true,
      showParameters: true,
      skeletonStyle: 'anatomical',
      colorScheme: 'default',
      showTrajectory: true,
      trajectoryLength: 100
    };
    
    // Initialize components
    this.initializeComponents();
  }

  private initializeComponents(): void {
    // Initialize renderers
    this.skeletonRenderer = new SkeletonRenderer(this.canvas, this.settings);
    this.trajectoryRenderer = new GaitTrajectoryRenderer(this.canvas, this.settings);
    
    // Initialize parameter display
    this.parameterDisplay = new GaitParameterDisplay(
      {
        container: this.parametersContainer,
        showTrends: true,
        showStatistics: true,
        updateInterval: 100,
        historyLength: 100
      },
      this.settings
    );
    
    // Initialize quality indicators
    this.qualityIndicators = new QualityIndicators(
      {
        container: this.qualityContainer,
        showDetailedMetrics: true,
        showPerformanceMetrics: true,
        updateInterval: 500,
        alertThresholds: {
          overallQuality: 0.6,
          trackingStability: 0.7,
          keypointVisibility: 0.8,
          frameRate: 20,
          memoryUsage: 200
        }
      },
      this.settings
    );
    
    // Initialize animation controller
    this.animationController = new AnimationController({
      targetFPS: 30,
      enableAdaptiveFrameRate: true,
      enableObjectPooling: true,
      maxAnimationObjects: 100,
      performanceThreshold: 0.8
    });
  }

  /**
   * Initialize the system with camera access and pose detection
   */
  async initialize(settings: VisualizationSettings): Promise<void> {
    try {
      this.settings = settings;
      this.updateAllSettings(settings);
      
      // Setup camera stream
      await this.setupCameraStream();
      
      // Initialize pose detection (mock for now)
      await this.initializePoseDetection();
      
      // Setup canvas
      this.setupCanvas();
      
      console.log('Gait visualization system initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize gait visualization system:', error);
      throw error;
    }
  }

  private async setupCameraStream(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }
      });
      
      this.video.srcObject = this.stream;
      
      // Wait for video to be ready
      await new Promise<void>((resolve) => {
        if (this.video.readyState >= 1) {
          resolve();
          return;
        }

        const handleLoadedMetadata = () => {
          this.video.removeEventListener('loadedmetadata', handleLoadedMetadata);
          resolve();
        };
        this.video.addEventListener('loadedmetadata', handleLoadedMetadata);
      });
      
    } catch (error) {
      throw new Error(`Failed to access camera: ${error.message}`);
    }
  }

  private async initializePoseDetection(): Promise<void> {
    // Mock pose detector for development
    this.poseDetector = {
      estimatePoses: async (video: HTMLVideoElement): Promise<VisualizationPose[]> => {
        // Generate mock pose data for demonstration
        return this.generateMockPose();
      }
    };
  }

  private generateMockPose(): VisualizationPose[] {
    const time = Date.now();
    const oscillation = Math.sin(time * 0.005) * 20;
    const walkCycle = Math.sin(time * 0.01) * 10;
    
    const keypoints = [
      { x: 320, y: 100, score: 0.9, name: 'nose' },
      { x: 315, y: 95, score: 0.8, name: 'left_eye' },
      { x: 325, y: 95, score: 0.8, name: 'right_eye' },
      { x: 310, y: 105, score: 0.7, name: 'left_ear' },
      { x: 330, y: 105, score: 0.7, name: 'right_ear' },
      { x: 300, y: 150, score: 0.9, name: 'left_shoulder' },
      { x: 340, y: 150, score: 0.9, name: 'right_shoulder' },
      { x: 280, y: 200, score: 0.8, name: 'left_elbow' },
      { x: 360, y: 200, score: 0.8, name: 'right_elbow' },
      { x: 260, y: 250, score: 0.7, name: 'left_wrist' },
      { x: 380, y: 250, score: 0.7, name: 'right_wrist' },
      { x: 310, y: 300, score: 0.9, name: 'left_hip' },
      { x: 330, y: 300, score: 0.9, name: 'right_hip' },
      { x: 305 + walkCycle, y: 400, score: 0.8, name: 'left_knee' },
      { x: 335 - walkCycle, y: 400, score: 0.8, name: 'right_knee' },
      { x: 300 + oscillation, y: 500, score: 0.7, name: 'left_ankle' },
      { x: 340 - oscillation, y: 500, score: 0.7, name: 'right_ankle' }
    ];
    
    return [{
      keypoints,
      score: 0.85,
      timestamp: time
    }];
  }

  private setupCanvas(): void {
    // Set canvas size based on video
    this.canvas.width = this.video.videoWidth || 640;
    this.canvas.height = this.video.videoHeight || 480;
    
    // Resize renderers
    this.skeletonRenderer.resize(this.canvas.width, this.canvas.height);
  }

  /**
   * Start the visualization system
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.isPaused = false;
    
    // Start animation controller
    this.animationController.start();
    
    // Start processing loop
    this.processFrame();
    
    console.log('Gait visualization system started');
  }

  /**
   * Stop the visualization system
   */
  stop(): void {
    this.isRunning = false;
    this.animationController.stop();
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    console.log('Gait visualization system stopped');
  }

  /**
   * Pause the visualization system
   */
  pause(): void {
    this.isPaused = true;
    this.animationController.pause();
  }

  /**
   * Resume the visualization system
   */
  resume(): void {
    this.isPaused = false;
    this.animationController.resume();
  }

  /**
   * Main processing loop
   */
  private async processFrame(): Promise<void> {
    if (!this.isRunning || this.isPaused) {
      if (this.isRunning) {
        requestAnimationFrame(() => this.processFrame());
      }
      return;
    }

    const frameStartTime = performance.now();
    
    try {
      // Estimate poses
      const poses = await this.poseDetector?.estimatePoses(this.video) || [];
      
      // Update trajectory tracking
      if (poses.length > 0) {
        this.trajectoryRenderer.updateTrajectory('person1', poses);
      }
      
      // Render visualization
      this.render(poses);
      
      // Update gait parameters
      this.updateGaitParameters(poses);
      
      // Update quality metrics
      this.updateQualityMetrics(poses);
      
      // Update performance metrics
      this.updatePerformanceMetrics(frameStartTime);
      
    } catch (error) {
      console.error('Error in processing frame:', error);
    }
    
    // Schedule next frame
    requestAnimationFrame(() => this.processFrame());
  }

  /**
   * Render a pose supplied by the production coordinator.
   *
   * The standalone demo loop above is retained for consumers that use this
   * class directly, but the production app already owns camera access and
   * pose detection. This adapter lets that app use the same skeleton and
   * trajectory renderers without opening a second camera or generating mock
   * analysis data.
   */
  public renderPose(pose: TensorFlowPose | null, visible = true): void {
    if (!visible || !pose) {
      this.skeletonRenderer.clear();
      this.trajectoryRenderer.clearTrajectories();
      return;
    }

    const visualizationPose = this.toVisualizationPose(pose);
    const poses = [visualizationPose];

    this.trajectoryRenderer.updateTrajectory('production', poses);
    this.skeletonRenderer.drawSkeleton(poses);
    if (this.settings.showTrajectory) {
      this.trajectoryRenderer.drawTrajectories();
    }

    const qualityMetrics = this.qualityIndicators.calculateQualityMetrics(poses);
    this.qualityIndicators.updateQualityMetrics(qualityMetrics);
    this.qualityIndicators.updatePerformanceMetrics(this.performanceMetrics);
  }

  /**
   * Forward real service output to the legacy parameter renderer. The React
   * metrics panel is the primary production surface, while this keeps the
   * class's export and embedded parameter view synchronized as well.
   */
  public updateAnalysisParameters(parameters: ServiceGaitParameters): void {
    const averageStepLength = (parameters.leftStepLength + parameters.rightStepLength) / 2;
    const visualizationParameters: GaitParameters = {
      strideTime: parameters.strideTime,
      stepTime: parameters.strideTime / 2,
      stanceTime: parameters.stanceTime,
      swingTime: parameters.swingTime,
      doubleSupport: parameters.doubleSupport / 100,
      cadence: parameters.cadence,
      strideLength: parameters.strideLength,
      stepLength: averageStepLength,
      stepWidth: parameters.stepWidth,
      footAngle: 0,
      velocity: parameters.velocity,
      symmetryIndex: parameters.symmetryIndex,
      variabilityIndex: 0,
      confidence: parameters.confidence
    };
    const quality: QualityMetrics = {
      overallQuality: parameters.confidence,
      trackingStability: parameters.confidence,
      keypointVisibility: parameters.confidence,
      temporalConsistency: parameters.gaitPhase.confidence,
      calibrationAccuracy: 1
    };

    this.parameterDisplay.updateParameters(visualizationParameters, quality);
  }

  private toVisualizationPose(pose: TensorFlowPose): VisualizationPose {
    return {
      keypoints: pose.keypoints.map((keypoint, index) => ({
        x: keypoint.x,
        y: keypoint.y,
        z: keypoint.z,
        score: keypoint.score ?? 0,
        name: keypoint.name ?? KEYPOINT_NAMES[index] ?? `keypoint-${index}`
      })),
      score: pose.score ?? 0,
      timestamp: Date.now()
    };
  }

  private render(poses: VisualizationPose[]): void {
    // Clear canvas
    this.skeletonRenderer.clear();
    
    // Draw video frame
    if (this.video.readyState >= 2) {
      const ctx = this.skeletonRenderer.getContext();
      ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    }
    
    // Draw skeleton overlay
    this.skeletonRenderer.drawSkeleton(poses);
    
    // Draw trajectories
    if (this.settings.showTrajectory) {
      this.trajectoryRenderer.drawTrajectories();
    }
  }

  private updateGaitParameters(poses: VisualizationPose[]): void {
    if (poses.length === 0) return;
    
    // Mock gait parameters for demonstration
    const mockParameters: GaitParameters = {
      strideTime: 1.1 + Math.random() * 0.2,
      stepTime: 0.55 + Math.random() * 0.1,
      stanceTime: 0.66 + Math.random() * 0.08,
      swingTime: 0.44 + Math.random() * 0.08,
      doubleSupport: 0.12 + Math.random() * 0.04,
      cadence: 110 + Math.random() * 20,
      strideLength: 1.35 + Math.random() * 0.3,
      stepLength: 0.67 + Math.random() * 0.15,
      stepWidth: 0.10 + Math.random() * 0.04,
      footAngle: 6 + Math.random() * 2,
      velocity: 1.3 + Math.random() * 0.4,
      symmetryIndex: Math.random() * 8,
      variabilityIndex: Math.random() * 6,
      confidence: 0.8 + Math.random() * 0.2
    };
    
    const mockQuality: QualityMetrics = {
      overallQuality: 0.8 + Math.random() * 0.2,
      trackingStability: 0.7 + Math.random() * 0.3,
      keypointVisibility: 0.85 + Math.random() * 0.15,
      temporalConsistency: 0.9 + Math.random() * 0.1,
      calibrationAccuracy: 0.95
    };
    
    this.parameterDisplay.updateParameters(mockParameters, mockQuality);
  }

  private updateQualityMetrics(poses: VisualizationPose[]): void {
    const qualityMetrics = this.qualityIndicators.calculateQualityMetrics(poses);
    this.qualityIndicators.updateQualityMetrics(qualityMetrics);
    this.qualityIndicators.updatePerformanceMetrics(this.performanceMetrics);
  }

  private updatePerformanceMetrics(frameStartTime: number): void {
    const frameTime = performance.now() - frameStartTime;
    const currentTime = performance.now();
    
    // Update frame rate
    if (this.lastFrameTime) {
      const deltaTime = currentTime - this.lastFrameTime;
      this.performanceMetrics.frameRate = 1000 / deltaTime;
    }
    
    // Update average render time
    this.performanceMetrics.averageRenderTime = 
      (this.performanceMetrics.averageRenderTime + frameTime) / 2;
    
    // Update processing latency
    this.performanceMetrics.processingLatency = frameTime;
    
    // Update memory usage
    if (performance.memory) {
      this.performanceMetrics.memoryUsage = performance.memory.usedJSHeapSize / 1024 / 1024;
    }
    
    this.lastFrameTime = currentTime;
    this.frameCount++;
  }

  /**
   * Update visualization settings
   */
  updateSettings(newSettings: Partial<VisualizationSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    this.updateAllSettings(this.settings);
  }

  private updateAllSettings(settings: VisualizationSettings): void {
    this.skeletonRenderer.updateSettings(settings);
    this.trajectoryRenderer.updateSettings(settings);
    this.parameterDisplay.updateSettings(settings);
    this.qualityIndicators.updateSettings(settings);
  }

  /**
   * Handle window resize
   */
  handleResize(): void {
    // Resize canvas to fit container
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    
    // Update renderers
    this.skeletonRenderer.resize(this.canvas.width, this.canvas.height);
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Get current gait analysis results
   */
  getAnalysisResults(): GaitAnalysisResult | null {
    // This would return actual analysis results in a real implementation
    return null;
  }

  /**
   * Export current visualization frame
   */
  exportFrame(): string {
    return this.canvas.toDataURL('image/png');
  }

  /**
   * Export trajectory data
   */
  exportTrajectoryData(): Map<string, any> {
    return this.trajectoryRenderer.exportTrajectoryData();
  }

  /**
   * Export parameter statistics
   */
  exportParameterData(): any {
    return this.parameterDisplay.exportData();
  }

  /**
   * Export quality metrics
   */
  exportQualityData(): any {
    return this.qualityIndicators.exportQualityData();
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stop();
    
    // Dispose all components
    this.skeletonRenderer.dispose();
    this.trajectoryRenderer.dispose();
    this.parameterDisplay.dispose();
    this.qualityIndicators.dispose();
    this.animationController.dispose();
    
    // Clean up video
    if (this.video.srcObject) {
      this.video.srcObject = null;
    }
    
    console.log('Gait visualization system disposed');
  }
}
