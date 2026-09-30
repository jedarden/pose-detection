import { useRef, useEffect, useState, useCallback } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { PerformanceMonitor } from './components/PerformanceMonitor';
import { CameraSelector } from './components/CameraSelector';
import { GaitVisualizationSystem } from './components/GaitVisualizationSystem';
import MetricsDisplay, { MotionMetrics } from './components/MetricsDisplay';
import { ApplicationCoordinator } from './services/ApplicationCoordinator';
import { GaitAnalysisService, GaitParameters } from './services/GaitAnalysisService';
import { LoggingService } from './services/LoggingService';
import {
  RuntimePerformanceManager,
  RuntimeVideoFrame
} from './performance/RuntimePerformanceManager';
import { Pose } from '@tensorflow-models/pose-detection';
import './App.css';

// Types for our integrated architecture
interface AppConfig {
  camera: {
    width: { ideal: number };
    height: { ideal: number };
    frameRate: { ideal: number };
    facingMode?: 'user' | 'environment';
    deviceId?: string;
  };
  ai: {
    modelType: 'lightning' | 'thunder';
    enableGPU: boolean;
    inputResolution: { width: number; height: number };
    validation: {
      minPoseConfidence: number;
      minKeypointConfidence: number;
    };
    smoothing: {
      smoothingFactor: number;
      minConfidence: number;
      maxDistance: number;
      enableVelocitySmoothing: boolean;
      historySize: number;
    };
    performance: {
      enableFrameSkipping: boolean;
      frameSkipInterval: number;
      targetFPS: number;
    };
    maxPoses: number;
  };
  performance: {
    videoResolution: { width: number; height: number };
    frameRate: number;
    modelType: 'lightning' | 'thunder';
    processEveryNthFrame: number;
    renderQuality: 'high' | 'medium' | 'low';
    enableGPUAcceleration: boolean;
    enableWebWorkers: boolean;
  };
}

function App() {
  // Initialize logger
  const logger = useRef<LoggingService>(new LoggingService()).current;

  // Initialize logger on mount
  useEffect(() => {
    logger.initialize().catch((err) => {
      // Silently handle logger initialization failure - don't block the app
      console.error('Failed to initialize logger:', err);
    });
  }, [logger]);

  //Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const visualizationCanvasRef = useRef<HTMLCanvasElement>(null);
  const visualizationQualityRef = useRef<HTMLDivElement>(null);
  const visualizationParametersRef = useRef<HTMLDivElement>(null);
  const coordinatorRef = useRef<ApplicationCoordinator | null>(null);
  const gaitAnalysisRef = useRef<GaitAnalysisService | null>(null);
  const gaitVisualizationRef = useRef<GaitVisualizationSystem | null>(null);
  const runtimePerformanceRef = useRef<RuntimePerformanceManager | null>(null);
  const latestPoseRef = useRef<Pose | null>(null);
  const latestPerformanceMetricsRef = useRef<Record<string, unknown>>({});
  const previousKeypointsRef = useRef<Pose['keypoints'] | null>(null);
  const poseStartTimeRef = useRef<number | null>(null);

  // State
  const [isRunning, setIsRunning] = useState(false);
  const [canStart, setCanStart] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string | undefined>(undefined);
  const [showOverlays, setShowOverlays] = useState(true);
  const showOverlaysRef = useRef(showOverlays);

  // Tracking data
  const [currentPose, setCurrentPose] = useState<Pose | null>(null);
  const [gaitParameters, setGaitParameters] = useState<GaitParameters>({
    cadence: 0,
    strideLength: 0,
    strideTime: 0,
    stepWidth: 0,
    velocity: 0,
    symmetryIndex: 0,
    confidence: 0,
    leftStepLength: 0,
    rightStepLength: 0,
    gaitPhase: {
      left: 'mid-stance',
      right: 'mid-stance',
      leftProgress: 0,
      rightProgress: 0,
      confidence: 0
    },
    stanceTime: 0,
    swingTime: 0,
    doubleSupport: 0
  });

  const [motionMetrics, setMotionMetrics] = useState<MotionMetrics>({
    detectionConfidence: 0,
    keypointCount: 0,
    visibleKeypoints: 0,
    trackingQuality: 0,
    movementIntensity: 0,
    poseDuration: 0,
    averageKeypointConfidence: 0
  });

  // Performance metrics
  const [performanceMetrics, setPerformanceMetrics] = useState({
    frameRate: 0,
    averageProcessingTime: 0,
    memoryUsage: 0,
    droppedFrames: 0,
    processingLatency: 0,
    modelInferenceTime: 0,
    renderingTime: 0,
    overallHealth: 'good' as const
  });

  // Session tracking
  const sessionStartTimeRef = useRef<number | null>(null);

  // Initialize coordinator and services
  useEffect(() => {
    let cancelled = false;
    let coordinator: ApplicationCoordinator | null = null;
    let runtimeManager: RuntimePerformanceManager | null = null;

    const initializeCoordinator = async () => {
      try {
        logger.info('Initializing ApplicationCoordinator...', undefined, 'App');

        const config: AppConfig = {
          camera: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 }
          },
          ai: {
            modelType: 'lightning',
            enableGPU: true,
            inputResolution: { width: 640, height: 480 },
            validation: {
              minPoseConfidence: 0.25,
              minKeypointConfidence: 0.3
            },
            smoothing: {
              smoothingFactor: 0.2,
              minConfidence: 0.3,
              maxDistance: 50,
              enableVelocitySmoothing: true,
              historySize: 5
            },
            performance: {
              enableFrameSkipping: true,
              frameSkipInterval: 2,
              targetFPS: 30
            },
            maxPoses: 1
          },
          performance: {
            videoResolution: { width: 640, height: 480 },
            frameRate: 30,
            modelType: 'lightning',
            processEveryNthFrame: 1,
            renderQuality: 'medium',
            enableGPUAcceleration: true,
            enableWebWorkers: false
          }
        };

        // Add camera device ID if selected
        if (selectedCameraId) {
          config.camera.deviceId = selectedCameraId;
        }

        coordinator = new ApplicationCoordinator(config);
        coordinatorRef.current = coordinator;

        const configuredRuntimeManager = canvasRef.current
          ? new RuntimePerformanceManager(canvasRef.current, {
              targetFPS: config.performance.frameRate,
              enableGPUAcceleration: config.performance.enableGPUAcceleration,
              onQualityChange: (profile) => {
                const cameraService = coordinator!.getService<{
                  applyConstraints?: (constraints: MediaTrackConstraints) => Promise<void>;
                }>('camera');
                const update = cameraService?.applyConstraints?.({
                  width: { ideal: profile.videoResolution.width },
                  height: { ideal: profile.videoResolution.height },
                  frameRate: { ideal: profile.frameRate }
                });
                update?.catch((error) => {
                  logger.warn('Unable to apply adaptive camera constraints', error, 'App');
                });
              }
            })
          : null;

        runtimeManager = configuredRuntimeManager;
        runtimePerformanceRef.current = runtimeManager;
        runtimeManager?.subscribe(handleRuntimePerformanceUpdated);

        // Get references to services
        const gaitService = coordinator.getService<GaitAnalysisService>('gaitAnalysis');
        if (gaitService) {
          gaitAnalysisRef.current = gaitService;
        }

        // Setup event listeners
        coordinator.on('poseDetected', handlePoseDetected);
        coordinator.on('gaitParametersUpdated', handleGaitParametersUpdated);
        coordinator.on('error', handleError);
        coordinator.on('performanceUpdated', handlePerformanceUpdated);
        coordinator.on('frameReady', processFrame);
        coordinator.on('started', () => {
          runtimeManager?.start();
          setIsRunning(true);
        });
        coordinator.on('stopped', () => {
          runtimeManager?.stop();
          setIsRunning(false);
        });

        // Initialize coordinator
        await coordinator.initialize();

        if (cancelled) return;

        setIsInitialized(true);
        setCanStart(true);
        logger.info('ApplicationCoordinator initialized successfully', undefined, 'App');

      } catch (err) {
        if (cancelled) return;
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize coordinator';
        setError(errorMessage);
        logger.error('Coordinator initialization error', err, 'App');
      }
    };

    initializeCoordinator();

    return () => {
      // Cleanup
      cancelled = true;
      runtimeManager?.dispose();
      coordinator?.removeAllListeners();
      coordinator?.shutdown().catch((err) => logger.error('Coordinator cleanup error', err, 'App'));
      if (coordinatorRef.current === coordinator) coordinatorRef.current = null;
      if (runtimePerformanceRef.current === runtimeManager) runtimePerformanceRef.current = null;
    };
  }, [selectedCameraId]);

  // Use the production coordinator's pose stream with the shared visualization
  // renderers. GaitVisualizationSystem is deliberately not initialized here:
  // camera access and pose detection are already owned by the coordinator.
  useEffect(() => {
    if (!isInitialized || !visualizationCanvasRef.current ||
        !visualizationQualityRef.current || !visualizationParametersRef.current) {
      return;
    }

    const visualizationSystem = new GaitVisualizationSystem(
      visualizationCanvasRef.current,
      visualizationQualityRef.current,
      visualizationParametersRef.current
    );
    gaitVisualizationRef.current = visualizationSystem;

    return () => {
      visualizationSystem.dispose();
      if (gaitVisualizationRef.current === visualizationSystem) {
        gaitVisualizationRef.current = null;
      }
    };
  }, [isInitialized]);

  // Handle pose detection events
  const handlePoseDetected = useCallback((analysis: any) => {
    if (analysis && analysis.pose) {
      const pose = analysis.pose as Pose;
      const timestamp = typeof analysis.timestamp === 'number' ? analysis.timestamp : Date.now();
      const keypoints = pose.keypoints;
      const visibleKeypoints = keypoints.filter((keypoint) => (keypoint.score ?? 0) > 0.5).length;
      const totalConfidence = keypoints.reduce(
        (sum, keypoint) => sum + (keypoint.score ?? 0),
        0
      );
      const averageKeypointConfidence = keypoints.length > 0
        ? totalConfidence / keypoints.length
        : 0;

      if (poseStartTimeRef.current === null) {
        poseStartTimeRef.current = timestamp;
      }
      if (poseStartTimeRef.current === null) return;

      let movementIntensity = 0;
      if (previousKeypointsRef.current) {
        const comparableKeypoints = keypoints.slice(0, previousKeypointsRef.current.length);
        const totalDisplacement = comparableKeypoints.reduce((sum, keypoint, index) => {
          const previousKeypoint = previousKeypointsRef.current![index];
          const dx = keypoint.x - previousKeypoint.x;
          const dy = keypoint.y - previousKeypoint.y;
          return sum + Math.sqrt(dx * dx + dy * dy);
        }, 0);
        const averageDisplacement = comparableKeypoints.length > 0
          ? totalDisplacement / comparableKeypoints.length
          : 0;
        movementIntensity = Math.min(1, averageDisplacement / 50);
      }

      const poseDuration = (timestamp - poseStartTimeRef.current) / 1000;
      const trackingQuality = Math.max(
        0,
        Math.min(1, averageKeypointConfidence * (1 - movementIntensity * 0.5))
      );

      latestPoseRef.current = analysis.pose;
      setCurrentPose(pose);
      previousKeypointsRef.current = [...pose.keypoints];
      setMotionMetrics({
        detectionConfidence: pose.score ?? 0,
        keypointCount: keypoints.length,
        visibleKeypoints,
        trackingQuality,
        movementIntensity,
        poseDuration,
        averageKeypointConfidence
      });
    }
  }, []);

  useEffect(() => {
    gaitVisualizationRef.current?.renderPose(
      latestPoseRef.current,
      showOverlays
    );
  }, [showOverlays]);

  // Handle gait parameters updates
  const handleGaitParametersUpdated = useCallback((parameters: GaitParameters) => {
    setGaitParameters(parameters);
    gaitVisualizationRef.current?.updateAnalysisParameters(parameters);
  }, []);

  // Handle errors
  const handleError = useCallback((error: any) => {
    setError(error.message || 'Unknown error occurred');
    logger.error('Application error', error, 'App');
  }, []);

  // Handle performance updates
  const handlePerformanceUpdated = useCallback((metrics: any) => {
    latestPerformanceMetricsRef.current = metrics;
    setPerformanceMetrics({
      frameRate: metrics.frameRate || 0,
      averageProcessingTime: metrics.averageProcessingTime || 0,
      memoryUsage: metrics.memoryUsage || 0,
      droppedFrames: metrics.droppedFrames || 0,
      processingLatency: metrics.processingLatency || 0,
      modelInferenceTime: metrics.modelInferenceTime || 0,
      renderingTime: metrics.renderingTime || 0,
      overallHealth: metrics.overallHealth || 'good'
    });
  }, []);

  const handleRuntimePerformanceUpdated = useCallback((metrics: any) => {
    latestPerformanceMetricsRef.current = metrics;
    setPerformanceMetrics((previous) => ({
      ...previous,
      frameRate: metrics.frameRate,
      averageProcessingTime: metrics.averageProcessingTime,
      memoryUsage: metrics.memoryUsage,
      droppedFrames: metrics.droppedFrames,
      processingLatency: metrics.processingLatency,
      modelInferenceTime: metrics.modelInferenceTime,
      renderingTime: metrics.renderingTime,
      overallHealth: metrics.overallHealth
    }));
  }, []);

  const processFrame = useCallback((frame: RuntimeVideoFrame) => {
    try {
      runtimePerformanceRef.current?.renderFrame(
        frame,
        latestPoseRef.current,
        latestPerformanceMetricsRef.current,
        false
      );
      gaitVisualizationRef.current?.renderPose(
        latestPoseRef.current,
        showOverlaysRef.current
      );
    } catch (err) {
      const frameErrorMessage = err instanceof Error ? err.message : 'Unknown processing error';
      logger.error('Frame processing error', { message: frameErrorMessage, error: err }, 'App');
    }
  }, []);

  showOverlaysRef.current = showOverlays;

  // Handle start button
  const handleStart = async () => {
    if (!isInitialized || !coordinatorRef.current) {
      setError('System not initialized');
      return;
    }

    try {
      sessionStartTimeRef.current = Date.now();
      await coordinatorRef.current.start();
      setIsRunning(true);
      setCanStart(false);
      setError(null);
    } catch (err) {
      const startErrorMessage = typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Failed to start analysis';
      setError(startErrorMessage);
      logger.error('Start error', err, 'App');
    }
  };

  // Handle stop button
  const handleStop = async () => {
    if (!coordinatorRef.current) return;

    try {
      await coordinatorRef.current.stop();
      setIsRunning(false);
      setCanStart(true);
    } catch (err) {
      const stopErrorMessage = err instanceof Error ? err.message : 'Failed to stop analysis';
      setError(stopErrorMessage);
      logger.error('Stop error', err, 'App');
    }
  };

  // Handle reset button
  const handleReset = async () => {
    if (!coordinatorRef.current) return;

    try {
      await handleStop();

      if (gaitAnalysisRef.current) {
        gaitAnalysisRef.current.reset();
      }

      // Reset gait parameters
      setGaitParameters({
        cadence: 0,
        strideLength: 0,
        strideTime: 0,
        stepWidth: 0,
        velocity: 0,
        symmetryIndex: 0,
        confidence: 0,
        leftStepLength: 0,
        rightStepLength: 0,
        gaitPhase: {
          left: 'mid-stance',
          right: 'mid-stance',
          leftProgress: 0,
          rightProgress: 0,
          confidence: 0
        },
        stanceTime: 0,
        swingTime: 0,
        doubleSupport: 0
      });

      setCurrentPose(null);
      gaitVisualizationRef.current?.renderPose(null, false);
      previousKeypointsRef.current = null;
      poseStartTimeRef.current = null;
      setMotionMetrics({
        detectionConfidence: 0,
        keypointCount: 0,
        visibleKeypoints: 0,
        trackingQuality: 0,
        movementIntensity: 0,
        poseDuration: 0,
        averageKeypointConfidence: 0
      });
      sessionStartTimeRef.current = null;

      // Clear canvas
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
    } catch (err) {
      const resetErrorMessage = err instanceof Error ? err.message : 'Failed to reset system';
      setError(resetErrorMessage);
      logger.error('Reset error', err, 'App');
    }
  };

  // Handle camera selection
  const handleCameraSelect = (deviceId: string) => {
    logger.info('Camera selected', { deviceId }, 'App');

    // Stop current detection if running
    if (isRunning) {
      handleStop();
    }

    setSelectedCameraId(deviceId);
  };

  // Handle export
  const handleExport = () => {
    if (!coordinatorRef.current) return;

    const sessionEndTime = Date.now();
    const sessionDuration = sessionStartTimeRef.current
      ? sessionEndTime - sessionStartTimeRef.current
      : 0;

    const exportData = {
      timestamp: new Date().toISOString(),
      gaitAnalysis: {
        parameters: gaitParameters,
        timestamp: Date.now()
      },
      motionMetrics,
      currentPose: currentPose ? {
        keypoints: currentPose.keypoints,
        confidence: currentPose.score
      } : null,
      performanceMetrics: {
        ...performanceMetrics
      },
      session: {
        duration: sessionDuration,
        startTime: sessionStartTimeRef.current ? new Date(sessionStartTimeRef.current).toISOString() : null,
        endTime: new Date(sessionEndTime).toISOString()
      }
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

    const exportFileDefaultName = `gait-analysis-${new Date().toISOString().split('T')[0]}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();

    logger.info('Exporting gait analysis data', { filename: exportFileDefaultName }, 'App');
  };

  // Update canvas layout
  useEffect(() => {
    const updateCanvasLayout = () => {
      if (canvasRef.current && videoRef.current && videoRef.current.videoWidth > 0) {
        const videoWidth = videoRef.current.videoWidth;
        const videoHeight = videoRef.current.videoHeight;
        const containerWidth = videoRef.current.clientWidth;
        const containerHeight = videoRef.current.clientHeight;

        const videoAspect = videoWidth / videoHeight;
        const containerAspect = containerWidth / containerHeight;

        let scale, offsetX, offsetY;

        if (videoAspect > containerAspect) {
          scale = containerWidth / videoWidth;
          offsetX = 0;
          offsetY = (containerHeight - videoHeight * scale) / 2;
        } else {
          scale = containerHeight / videoHeight;
          offsetX = (containerWidth - videoWidth * scale) / 2;
          offsetY = 0;
        }

        canvasRef.current.style.width = `${videoWidth * scale}px`;
        canvasRef.current.style.height = `${videoHeight * scale}px`;
        canvasRef.current.style.position = 'absolute';
        canvasRef.current.style.left = `${offsetX}px`;
        canvasRef.current.style.top = `${offsetY}px`;

        if (visualizationCanvasRef.current) {
          visualizationCanvasRef.current.style.width = `${videoWidth * scale}px`;
          visualizationCanvasRef.current.style.height = `${videoHeight * scale}px`;
          visualizationCanvasRef.current.style.position = 'absolute';
          visualizationCanvasRef.current.style.left = `${offsetX}px`;
          visualizationCanvasRef.current.style.top = `${offsetY}px`;
        }

        // Also set actual canvas dimensions
        canvasRef.current.width = videoWidth;
        canvasRef.current.height = videoHeight;
        if (visualizationCanvasRef.current) {
          visualizationCanvasRef.current.width = videoWidth;
          visualizationCanvasRef.current.height = videoHeight;
        }
      }
    };

    updateCanvasLayout();

    const handleResize = () => updateCanvasLayout();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isInitialized]);

  return (
    <div className="App" data-testid="gait-detection-app">
      <header className="App-header">
        <h1 data-testid="app-title">Human Pose Detection & Gait Analysis</h1>
        <p>Real-time computer vision for human pose estimation and gait analysis</p>
      </header>

      <main className="App-main">
        {error && (
          <div className="error-message" data-testid="error-message" style={{
            background: '#ffebee',
            color: '#c62828',
            padding: '10px',
            borderRadius: '4px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>Error: {error}</span>
            <button
              onClick={() => setError(null)}
              data-testid="error-dismiss-button"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#c62828',
                cursor: 'pointer',
                fontSize: '18px',
                fontWeight: 'bold',
                padding: '0 5px'
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Camera Selector */}
        <CameraSelector
          onCameraSelect={handleCameraSelect}
          currentDeviceId={selectedCameraId}
          className="camera-selector-container"
        />

        {/* Overlay Toggle */}
        <div style={{ marginBottom: '10px' }} data-testid="overlay-toggle-container">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
            <input
              type="checkbox"
              checked={showOverlays}
              onChange={(e) => setShowOverlays(e.target.checked)}
              style={{ width: '16px', height: '16px' }}
              data-testid="show-overlays-checkbox"
            />
            <span style={{ fontWeight: 'bold' }}>Show Detection Overlays</span>
          </label>
        </div>

        <div className="video-container" data-testid="video-container" style={{ position: 'relative', display: 'inline-block' }}>
          <video
            ref={videoRef}
            width="640"
            height="480"
            autoPlay
            muted
            playsInline
            data-testid="video-element"
            style={{
              border: '2px solid #ccc',
              borderRadius: '8px',
              display: 'block'
            }}
          />
          <canvas
            ref={canvasRef}
            width="640"
            height="480"
            data-testid="skeleton-canvas"
            style={{
              position: 'absolute',
              top: '2px',
              left: '2px',
              pointerEvents: 'none',
              border: '2px solid rgba(255, 0, 0, 0.3)',
              borderRadius: '8px',
              backgroundColor: 'rgba(0, 0, 0, 0.1)',
              width: 'calc(100% - 4px)',
              height: 'calc(100% - 4px)'
            }}
          />
          <canvas
            ref={visualizationCanvasRef}
            width="640"
            height="480"
            data-testid="gait-visualization-canvas"
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '2px',
              left: '2px',
              zIndex: 2,
              pointerEvents: 'none',
              width: 'calc(100% - 4px)',
              height: 'calc(100% - 4px)'
            }}
          />
        </div>

        <ControlPanel
          onStart={handleStart}
          onStop={handleStop}
          onReset={handleReset}
          onExport={handleExport}
          isRunning={isRunning}
          canStart={canStart && isInitialized}
        />

        <div className="status" data-testid="camera-status">
          Status: {isRunning ? 'Running' : isInitialized ? 'Ready' : 'Initializing...'}
        </div>

        <MetricsDisplay
          gaitParameters={gaitParameters}
          motionMetrics={motionMetrics}
        />

        {/* GaitVisualizationSystem owns these DOM surfaces and updates them
            from the same production pose stream as the canvas overlay. */}
        <div ref={visualizationQualityRef} data-testid="gait-quality-container" style={{ display: 'none' }} />
        <div ref={visualizationParametersRef} data-testid="gait-visualization-parameters" style={{ display: 'none' }} />

        {/* Performance Monitor */}
        <div style={{ marginTop: '20px' }}>
          <PerformanceMonitor
            metrics={performanceMetrics}
            coordinator={null}
            className="gait-performance-monitor"
          />
        </div>
      </main>
    </div>
  );
}

export default App;
