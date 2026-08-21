/**
 * Application Coordinator - Main service that manages the lifecycle and coordination
 * of all services in the gait detection application
 */

import { EventEmitter } from 'events';
import { 
  ApplicationState, 
  AppConfig, 
  AppError, 
  ServiceStatus, 
  ModuleStatus,
  PerformanceMetrics,
  Notification
} from '../types';
import { CameraService } from './CameraService';
import { PoseDetectionService } from './PoseDetectionService';
import { GaitAnalysisService } from './GaitAnalysisService';
import { PerformanceMonitorService } from './PerformanceMonitorService';
import { AdaptiveQualityService } from './AdaptiveQualityService';
import { ErrorHandlingService } from './ErrorHandlingService';
import { NotificationService } from './NotificationService';
import { DataExportService } from './DataExportService';
import { EventBusService } from './EventBusService';
import { ConfigurationService } from './ConfigurationService';
import { LoggingService } from './LoggingService';

export class ApplicationCoordinator extends EventEmitter {
  private state: ApplicationState;
  private config: AppConfig;
  private services: Map<string, any> = new Map();
  private serviceStatuses: Map<string, ServiceStatus> = new Map();
  private initializationPromise: Promise<void> | null = null;
  private shutdownPromise: Promise<void> | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private performanceInterval: NodeJS.Timeout | null = null;
  private recoveryInProgress = new Set<string>();

  // Core Services
  private cameraService: CameraService;
  private poseDetectionService: PoseDetectionService;
  private gaitAnalysisService: GaitAnalysisService;
  private performanceMonitorService: PerformanceMonitorService;
  private adaptiveQualityService: AdaptiveQualityService;
  private errorHandlingService: ErrorHandlingService;
  private notificationService: NotificationService;
  private dataExportService: DataExportService;
  private eventBusService: EventBusService;
  private configurationService: ConfigurationService;
  private loggingService: LoggingService;

  constructor(config: AppConfig) {
    super();
    this.config = config;
    this.state = {
      isInitialized: false,
      isRunning: false,
      currentMode: 'idle',
      error: null,
      performance: {
        frameRate: 0,
        averageProcessingTime: 0,
        memoryUsage: 0,
        droppedFrames: 0,
        modelInferenceTime: 0,
        renderingTime: 0,
        overallHealth: 'poor'
      }
    };

    this.initializeServices();
    this.setupEventHandlers();
  }

  private initializeServices(): void {
    // Initialize core services
    this.loggingService = new LoggingService();
    this.eventBusService = new EventBusService();
    this.configurationService = new ConfigurationService(this.config);
    this.errorHandlingService = new ErrorHandlingService(this.eventBusService);
    this.notificationService = new NotificationService(this.eventBusService);
    this.performanceMonitorService = new PerformanceMonitorService();
    this.adaptiveQualityService = new AdaptiveQualityService(this.config.performance);
    
    // Initialize application services
    this.cameraService = new CameraService(this.config.camera);
    this.poseDetectionService = new PoseDetectionService(this.config.ai);
    this.gaitAnalysisService = new GaitAnalysisService();
    this.dataExportService = new DataExportService();

    // Register services
    this.services.set('logging', this.loggingService);
    this.services.set('eventBus', this.eventBusService);
    this.services.set('configuration', this.configurationService);
    this.services.set('errorHandling', this.errorHandlingService);
    this.services.set('notification', this.notificationService);
    this.services.set('performanceMonitor', this.performanceMonitorService);
    this.services.set('adaptiveQuality', this.adaptiveQualityService);
    this.services.set('camera', this.cameraService);
    this.services.set('poseDetection', this.poseDetectionService);
    this.services.set('gaitAnalysis', this.gaitAnalysisService);
    this.services.set('dataExport', this.dataExportService);

    this.loggingService.info('ApplicationCoordinator: Services initialized');
  }

  private setupEventHandlers(): void {
    // Error handling
    this.errorHandlingService.on('error', (error: AppError) => {
      this.handleError(error);
    });

    // Performance monitoring
    this.performanceMonitorService.on('metrics', (metrics: PerformanceMetrics) => {
      this.updatePerformanceMetrics(metrics);
    });

    // Adaptive quality adjustments
    this.adaptiveQualityService.on('qualityChanged', (settings) => {
      this.loggingService.info('ApplicationCoordinator: Quality settings adjusted', settings);
      this.eventBusService.emit('qualityChanged', settings);
    });

    // Camera events
    this.cameraService.on('frameReady', (frame) => {
      this.processFrame(frame);
    });

    this.cameraService.on('error', (error) => {
      const permissionDenied = error?.name === 'NotAllowedError' ||
        error?.name === 'PermissionDeniedError';

      this.errorHandlingService.handleError({
        id: `camera-${Date.now()}`,
        type: 'camera',
        severity: 'high',
        message: error.message,
        details: error,
        timestamp: Date.now(),
        recoverable: !permissionDenied
      });
    });

    // Global error handling
    window.addEventListener('error', (event) => {
      this.errorHandlingService.handleError({
        id: `global-${Date.now()}`,
        type: 'user',
        severity: 'medium',
        message: event.message,
        details: event,
        timestamp: Date.now(),
        recoverable: false
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.errorHandlingService.handleError({
        id: `promise-${Date.now()}`,
        type: 'user',
        severity: 'medium',
        message: event.reason?.message || 'Unhandled promise rejection',
        details: event.reason,
        timestamp: Date.now(),
        recoverable: false
      });
    });
  }

  public async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.performInitialization();
    return this.initializationPromise;
  }

  private async performInitialization(): Promise<void> {
    try {
      this.loggingService.info('ApplicationCoordinator: Starting initialization');
      
      // Initialize services in dependency order
      await this.initializeService('logging');
      await this.initializeService('eventBus');
      await this.initializeService('configuration');
      await this.initializeService('errorHandling');
      await this.initializeService('notification');
      await this.initializeService('performanceMonitor');
      await this.initializeService('adaptiveQuality');
      await this.initializeService('camera');
      await this.initializeService('poseDetection');
      await this.initializeService('gaitAnalysis');
      await this.initializeService('dataExport');

      // Start monitoring
      this.startHeartbeat();
      this.startPerformanceMonitoring();

      this.state.isInitialized = true;
      this.loggingService.info('ApplicationCoordinator: Initialization complete');
      
      this.notificationService.showNotification({
        id: 'init-complete',
        type: 'success',
        title: 'Initialization Complete',
        message: 'All services are ready',
        timestamp: Date.now(),
        dismissible: true,
        autoHide: true,
        duration: 5000
      });

      this.emit('initialized');
    } catch (error) {
      this.loggingService.error('ApplicationCoordinator: Initialization failed', error);
      this.handleInitializationError(error);
      throw error;
    }
  }

  private async initializeService(serviceName: string): Promise<void> {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service ${serviceName} not found`);
    }

    try {
      this.loggingService.info(`ApplicationCoordinator: Initializing ${serviceName}`);
      
      if (service.initialize) {
        await service.initialize();
      }

      this.serviceStatuses.set(serviceName, {
        name: serviceName,
        isRunning: true,
        health: 'healthy',
        lastHeartbeat: Date.now(),
        metrics: {}
      });

      this.loggingService.info(`ApplicationCoordinator: ${serviceName} initialized successfully`);
    } catch (error) {
      this.loggingService.error(`ApplicationCoordinator: Failed to initialize ${serviceName}`, error);
      
      this.serviceStatuses.set(serviceName, {
        name: serviceName,
        isRunning: false,
        health: 'unhealthy',
        lastHeartbeat: Date.now(),
        metrics: { error: error.message }
      });

      throw error;
    }
  }

  public async start(): Promise<void> {
    if (!this.state.isInitialized) {
      throw new Error('Application not initialized');
    }

    if (this.state.isRunning) {
      this.loggingService.warn('ApplicationCoordinator: Already running');
      return;
    }

    try {
      this.loggingService.info('ApplicationCoordinator: Starting application');
      
      // Start camera
      await this.cameraService.start();
      
      this.state.isRunning = true;
      this.state.currentMode = 'analysis';
      this.state.error = null;

      this.loggingService.info('ApplicationCoordinator: Application started successfully');
      
      this.notificationService.showNotification({
        id: 'app-started',
        type: 'success',
        title: 'Analysis Started',
        message: 'Gait detection is now active',
        timestamp: Date.now(),
        dismissible: true,
        autoHide: true,
        duration: 3000
      });

      this.emit('started');
    } catch (error) {
      this.loggingService.error('ApplicationCoordinator: Failed to start application', error);
      this.handleError({
        id: `start-${Date.now()}`,
        type: 'user',
        severity: 'high',
        message: error instanceof Error ? error.message : 'Failed to start application',
        details: error,
        timestamp: Date.now(),
        recoverable: false
      });
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.state.isRunning) {
      this.loggingService.warn('ApplicationCoordinator: Not running');
      return;
    }

    try {
      this.loggingService.info('ApplicationCoordinator: Stopping application');
      
      // Stop the camera; pose detection and gait analysis are stateless
      // processing services and do not have separate start/stop lifecycles.
      await this.cameraService.stop();

      this.state.isRunning = false;
      this.state.currentMode = 'idle';

      this.loggingService.info('ApplicationCoordinator: Application stopped successfully');
      
      this.notificationService.showNotification({
        id: 'app-stopped',
        type: 'info',
        title: 'Analysis Stopped',
        message: 'Gait detection has been stopped',
        timestamp: Date.now(),
        dismissible: true,
        autoHide: true,
        duration: 3000
      });

      this.emit('stopped');
    } catch (error) {
      this.loggingService.error('ApplicationCoordinator: Failed to stop application', error);
      this.handleError({
        id: `stop-${Date.now()}`,
        type: 'user',
        severity: 'medium',
        message: 'Failed to stop application cleanly',
        details: error,
        timestamp: Date.now(),
        recoverable: true
      });
    }
  }

  public async shutdown(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = this.performShutdown();
    return this.shutdownPromise;
  }

  private async performShutdown(): Promise<void> {
    try {
      this.loggingService.info('ApplicationCoordinator: Starting shutdown');
      
      // Stop application if running
      if (this.state.isRunning) {
        await this.stop();
      }

      // Stop monitoring
      this.stopHeartbeat();
      this.stopPerformanceMonitoring();

      // Shutdown services in reverse order
      const serviceNames = Array.from(this.services.keys()).reverse();
      for (const serviceName of serviceNames) {
        await this.shutdownService(serviceName);
      }

      this.state.isInitialized = false;
      this.loggingService.info('ApplicationCoordinator: Shutdown complete');
      
      this.emit('shutdown');
    } catch (error) {
      this.loggingService.error('ApplicationCoordinator: Shutdown failed', error);
      throw error;
    }
  }

  private async shutdownService(serviceName: string): Promise<void> {
    const service = this.services.get(serviceName);
    if (!service) return;

    try {
      this.loggingService.info(`ApplicationCoordinator: Shutting down ${serviceName}`);
      
      if (service.shutdown) {
        await service.shutdown();
      } else if (service.dispose) {
        await service.dispose();
      }

      this.serviceStatuses.delete(serviceName);
      this.loggingService.info(`ApplicationCoordinator: ${serviceName} shutdown successfully`);
    } catch (error) {
      this.loggingService.error(`ApplicationCoordinator: Failed to shutdown ${serviceName}`, error);
    }
  }

  private async processFrame(frame: any): Promise<void> {
    if (!this.state.isRunning) return;

    try {
      this.performanceMonitorService.startFrameProcessing();
      
      // Process frame through the pose detection pipeline.
      const detections = await this.poseDetectionService.detectPoses(frame.data);

      // Forward detections in the shape consumed by the app and gait service.
      detections.forEach((detection) => {
        const analysis = {
          pose: {
            keypoints: detection.keypoints,
            score: detection.confidence
          },
          timestamp: detection.timestamp
        };

        this.gaitAnalysisService.addPose(analysis.pose, analysis.timestamp);
        this.eventBusService.emit('poseDetected', analysis);
        this.emit('poseDetected', analysis);
        this.emit(
          'gaitParametersUpdated',
          this.gaitAnalysisService.calculateGaitParameters()
        );
      });
      
      // Update performance metrics
      this.performanceMonitorService.endFrameProcessing();
      
      // Emit frame processed event
      this.eventBusService.emit('frameProcessed', { frame, detections });
      
    } catch (error) {
      this.loggingService.error('ApplicationCoordinator: Frame processing failed', error);
      this.handleError({
        id: `frame-${Date.now()}`,
        type: 'ai',
        severity: 'low',
        message: 'Frame processing failed',
        details: error,
        timestamp: Date.now(),
        recoverable: true
      });
    }
  }

  private handleError(error: AppError): void {
    this.loggingService.error('ApplicationCoordinator: Error occurred', error);
    
    // Update state
    if (error.severity === 'critical') {
      this.state.error = error.message;
    }

    // Emit error event
    this.emit('error', error);

    // Show notification for user errors
    if (error.type === 'user' || error.severity === 'high') {
      this.notificationService.showNotification({
        id: error.id,
        type: 'error',
        title: 'Error Occurred',
        message: error.message,
        timestamp: error.timestamp,
        dismissible: true,
        autoHide: false
      });
    }

    // Attempt recovery for recoverable errors
    if (error.recoverable && !this.recoveryInProgress.has(error.type)) {
      this.attemptRecovery(error);
    }
  }

  private async attemptRecovery(error: AppError): Promise<void> {
    if (this.recoveryInProgress.has(error.type)) return;

    this.recoveryInProgress.add(error.type);
    try {
      this.loggingService.info('ApplicationCoordinator: Attempting recovery', error);
      
      switch (error.type) {
        case 'camera':
          await this.recoverCameraService();
          break;
        case 'ai':
          await this.recoverAIService();
          break;
        case 'performance':
          await this.recoverPerformance();
          break;
        default:
          this.loggingService.warn('ApplicationCoordinator: No recovery strategy for error type', error.type);
      }
    } catch (recoveryError) {
      this.loggingService.error('ApplicationCoordinator: Recovery failed', recoveryError);
    } finally {
      this.recoveryInProgress.delete(error.type);
    }
  }

  private async recoverCameraService(): Promise<void> {
    try {
      await this.cameraService.restart();
      this.loggingService.info('ApplicationCoordinator: Camera service recovered');
    } catch (error) {
      this.loggingService.error('ApplicationCoordinator: Camera recovery failed', error);
    }
  }

  private async recoverAIService(): Promise<void> {
    try {
      await this.poseDetectionService.restart();
      this.loggingService.info('ApplicationCoordinator: AI service recovered');
    } catch (error) {
      this.loggingService.error('ApplicationCoordinator: AI recovery failed', error);
    }
  }

  private async recoverPerformance(): Promise<void> {
    try {
      const recommendations = this.performanceMonitorService.getOptimizationRecommendations();
      this.adaptiveQualityService.applyRecommendations(recommendations);
      this.loggingService.info('ApplicationCoordinator: Performance recovery applied');
    } catch (error) {
      this.loggingService.error('ApplicationCoordinator: Performance recovery failed', error);
    }
  }

  private handleInitializationError(error: any): void {
    this.state.error = `Initialization failed: ${error.message}`;
    this.state.isInitialized = false;
    
    this.notificationService.showNotification({
      id: 'init-error',
      type: 'error',
      title: 'Initialization Failed',
      message: error.message,
      timestamp: Date.now(),
      dismissible: true,
      autoHide: false
    });
  }

  private updatePerformanceMetrics(metrics: PerformanceMetrics): void {
    this.state.performance = { ...metrics };
    
    // Update adaptive quality service
    this.adaptiveQualityService.updatePerformanceMetrics(
      metrics.frameRate, 
      metrics.averageProcessingTime
    );
    
    // Emit performance update
    this.emit('performanceUpdated', metrics);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.updateServiceStatuses();
    }, 5000); // Every 5 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private startPerformanceMonitoring(): void {
    this.performanceInterval = setInterval(() => {
      const metrics = this.performanceMonitorService.getMetrics();
      this.updatePerformanceMetrics(metrics);
    }, 1000); // Every second
  }

  private stopPerformanceMonitoring(): void {
    if (this.performanceInterval) {
      clearInterval(this.performanceInterval);
      this.performanceInterval = null;
    }
  }

  private updateServiceStatuses(): void {
    this.serviceStatuses.forEach((status, serviceName) => {
      const service = this.services.get(serviceName);
      if (service && service.getStatus) {
        const serviceStatus = service.getStatus();
        this.serviceStatuses.set(serviceName, {
          ...status,
          ...serviceStatus,
          lastHeartbeat: Date.now()
        });
      }
    });
  }

  // Public API methods
  public getState(): ApplicationState {
    return { ...this.state };
  }

  public getConfig(): AppConfig {
    return { ...this.config };
  }

  public getServiceStatus(serviceName: string): ServiceStatus | undefined {
    return this.serviceStatuses.get(serviceName);
  }

  public getAllServiceStatuses(): ServiceStatus[] {
    return Array.from(this.serviceStatuses.values());
  }

  public getService<T>(serviceName: string): T | undefined {
    return this.services.get(serviceName);
  }

  public async updateConfig(updates: Partial<AppConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };
    await this.configurationService.updateConfig(updates);
    this.emit('configUpdated', this.config);
  }

  public async reset(): Promise<void> {
    this.loggingService.info('ApplicationCoordinator: Resetting application');
    
    if (this.state.isRunning) {
      await this.stop();
    }

    // Reset all services
    await this.gaitAnalysisService.reset();
    await this.cameraService.reset();
    this.performanceMonitorService.reset();
    this.adaptiveQualityService.reset();

    // Clear state
    this.state.error = null;
    this.state.currentMode = 'idle';

    this.loggingService.info('ApplicationCoordinator: Reset complete');
    this.emit('reset');
  }

  public async exportData(options: any): Promise<Blob> {
    const gaitData = await this.gaitAnalysisService.exportData();
    return this.dataExportService.exportData(gaitData, options);
  }

  public isInitialized(): boolean {
    return this.state.isInitialized;
  }

  public isRunning(): boolean {
    return this.state.isRunning;
  }

  public getCurrentMode(): string {
    return this.state.currentMode;
  }

  public getError(): string | null {
    return this.state.error;
  }

  public getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.state.performance };
  }
}
