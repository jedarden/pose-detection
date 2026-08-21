import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { PerformanceMonitor } from './components/PerformanceMonitor';
import { CameraSelector } from './components/CameraSelector';
import { ApplicationCoordinator } from './services/ApplicationCoordinator';
import { GaitAnalysisService, GaitParameters } from './services/GaitAnalysisService';
import { LoggingService } from './services/LoggingService';
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
  const coordinatorRef = useRef<ApplicationCoordinator | null>(null);
  const gaitAnalysisRef = useRef<GaitAnalysisService | null>(null);

  // State
  const [isRunning, setIsRunning] = useState(false);
  const [canStart, setCanStart] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string | undefined>(undefined);
  const [showOverlays, setShowOverlays] = useState(true);

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
  const animationFrameRef = useRef<number | null>(null);

  // Initialize coordinator and services
  useEffect(() => {
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

        const coordinator = new ApplicationCoordinator(config);
        coordinatorRef.current = coordinator;

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
        coordinator.on('started', () => setIsRunning(true));
        coordinator.on('stopped', () => setIsRunning(false));

        // Initialize coordinator
        await coordinator.initialize();

        setIsInitialized(true);
        setCanStart(true);
        logger.info('ApplicationCoordinator initialized successfully', undefined, 'App');

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize coordinator';
        setError(errorMessage);
        logger.error('Coordinator initialization error', err, 'App');
      }
    };

    initializeCoordinator();

    return () => {
      // Cleanup
      if (coordinatorRef.current) {
        coordinatorRef.current.removeAllListeners();
        coordinatorRef.current.shutdown().catch((err) => logger.error('Coordinator cleanup error', err, 'App'));
      }
    };
  }, [selectedCameraId]);

  // Handle pose detection events
  const handlePoseDetected = useCallback((analysis: any) => {
    if (analysis && analysis.pose) {
      setCurrentPose(analysis.pose);

      // Feed pose data to gait analysis service
      if (gaitAnalysisRef.current) {
        gaitAnalysisRef.current.addPose(analysis.pose, analysis.timestamp || Date.now());
      }
    }
  }, []);

  // Handle gait parameters updates
  const handleGaitParametersUpdated = useCallback((parameters: GaitParameters) => {
    setGaitParameters(parameters);
  }, []);

  // Handle errors
  const handleError = useCallback((error: any) => {
    setError(error.message || 'Unknown error occurred');
    logger.error('Application error', error, 'App');
  }, []);

  // Handle performance updates
  const handlePerformanceUpdated = useCallback((metrics: any) => {
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

  // Manual frame processing for canvas rendering
  const processFrame = useCallback(async () => {
    if (!isRunning || !videoRef.current || !canvasRef.current || !coordinatorRef.current) {
      return;
    }

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw LIVE indicator
      ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
      ctx.fillRect(canvas.width - 50, 5, 40, 20);
      ctx.fillStyle = 'white';
      ctx.font = '12px Arial';
      ctx.fillText('LIVE', canvas.width - 45, 18);

      // Draw current pose if available
      if (currentPose) {
        drawPoseSkeleton(ctx, currentPose);

        // Draw gait parameters overlay if enabled
        if (showOverlays) {
          drawGaitParametersOverlay(ctx, gaitParameters);
        }
      } else {
        // No pose detected message
        if (showOverlays) {
          ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
          ctx.fillRect(10, 10, 200, 60);
          ctx.fillStyle = '#ffffff';
          ctx.font = '12px Arial';
          ctx.fillText('No person detected', 20, 30);
          ctx.fillText('Move into camera view', 20, 50);
        }
      }

      // Draw performance overlay if enabled
      if (showOverlays) {
        drawPerformanceOverlay(ctx, performanceMetrics, canvas.width);
      }

    } catch (err) {
      const frameErrorMessage = err instanceof Error ? err.message : 'Unknown processing error';
      logger.error('Frame processing error', { message: frameErrorMessage, error: err }, 'App');
    }

    // Continue animation loop
    if (isRunning) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
    }
  }, [isRunning, currentPose, gaitParameters, performanceMetrics, showOverlays]);

  // Draw pose skeleton on canvas
  const drawPoseSkeleton = (ctx: CanvasRenderingContext2D, pose: Pose) => {
    const { keypoints } = pose;

    // Draw skeleton connections
    const connections = [
      [5, 6], [5, 7], [7, 9], [6, 8], [8, 10], // Arms
      [5, 11], [6, 12], [11, 12], // Torso
      [11, 13], [13, 15], [12, 14], [14, 16] // Legs
    ];

    ctx.strokeStyle = '#00ff00';
    ctx.fillStyle = '#ff0000';
    ctx.lineWidth = 2;

    connections.forEach(([from, to]) => {
      if (keypoints[from] && keypoints[to] &&
          keypoints[from].score > 0.3 && keypoints[to].score > 0.3) {
        ctx.beginPath();
        ctx.moveTo(keypoints[from].x, keypoints[from].y);
        ctx.lineTo(keypoints[to].x, keypoints[to].y);
        ctx.stroke();
      }
    });

    // Draw keypoints with confidence-based colors
    keypoints.forEach((kp, idx) => {
      if (kp.score > 0.3) {
        if (kp.score > 0.7) {
          ctx.fillStyle = '#00ff00'; // Green for high confidence
        } else if (kp.score > 0.5) {
          ctx.fillStyle = '#ffff00'; // Yellow for medium confidence
        } else {
          ctx.fillStyle = '#ff8800'; // Orange for lower confidence
        }

        ctx.beginPath();
        ctx.arc(kp.x, kp.y, 4 + (kp.score * 2), 0, 2 * Math.PI);
        ctx.fill();

        // Highlight critical keypoints
        if (idx === 0 || idx === 5 || idx === 6 || idx === 11 || idx === 12) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(kp.x, kp.y, 8, 0, 2 * Math.PI);
          ctx.stroke();
        }
      }
    });
  };

  // Draw gait parameters overlay
  const drawGaitParametersOverlay = (ctx: CanvasRenderingContext2D, params: GaitParameters) => {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(10, 10, 280, 180);

    ctx.fillStyle = '#ffffff';
    ctx.font = '12px Arial';

    let y = 30;
    const lineHeight = 18;

    ctx.fillText('Gait Analysis Parameters', 20, y);
    y += lineHeight + 5;

    ctx.fillText(`Cadence: ${params.cadence.toFixed(1)} steps/min`, 20, y); y += lineHeight;
    ctx.fillText(`Stride Length: ${params.strideLength.toFixed(2)} m`, 20, y); y += lineHeight;
    ctx.fillText(`Velocity: ${params.velocity.toFixed(2)} m/s`, 20, y); y += lineHeight;
    ctx.fillText(`Symmetry Index: ${params.symmetryIndex.toFixed(1)}%`, 20, y); y += lineHeight;
    ctx.fillText(`Left Phase: ${params.gaitPhase.left}`, 20, y); y += lineHeight;
    ctx.fillText(`Right Phase: ${params.gaitPhase.right}`, 20, y); y += lineHeight;
    ctx.fillText(`Confidence: ${(params.confidence * 100).toFixed(1)}%`, 20, y);
  };

  // Draw performance overlay
  const drawPerformanceOverlay = (ctx: CanvasRenderingContext2D, metrics: any, canvasWidth: number) => {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(canvasWidth - 220, 10, 210, 80);
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px Arial';
    ctx.fillText(`FPS: ${metrics.frameRate.toFixed(1)}`, canvasWidth - 210, 25);
    ctx.fillText(`Processing: ${metrics.averageProcessingTime.toFixed(1)}ms`, canvasWidth - 210, 40);
    ctx.fillText(`Memory: ${metrics.memoryUsage.toFixed(1)}MB`, canvasWidth - 210, 55);
    ctx.fillText(`Health: ${metrics.overallHealth}`, canvasWidth - 210, 70);
  };

  // Start frame processing loop when running
  useEffect(() => {
    if (isRunning) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRunning, processFrame]);

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

        // Also set actual canvas dimensions
        canvasRef.current.width = videoWidth;
        canvasRef.current.height = videoHeight;
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

        {/* Gait Analysis Parameters Display */}
        <div className="gait-parameters" data-testid="gait-parameters" style={{
          marginTop: '20px',
          padding: '20px',
          backgroundColor: '#f0f8ff',
          borderRadius: '8px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '15px'
        }}>
          <h3 style={{ gridColumn: '1 / -1', margin: '0 0 10px 0' }}>Real-time Gait Analysis</h3>

          <div className="parameter-card" data-testid="gait-cadence" style={{
            backgroundColor: 'white',
            padding: '15px',
            borderRadius: '4px',
            border: '1px solid #ddd'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>Cadence</h4>
            <p style={{ margin: '0', fontSize: '18px', fontWeight: 'bold' }} data-testid="gait-cadence-value">
              {gaitParameters.cadence.toFixed(1)} steps/min
            </p>
          </div>

          <div className="parameter-card" data-testid="gait-stride-length" style={{
            backgroundColor: 'white',
            padding: '15px',
            borderRadius: '4px',
            border: '1px solid #ddd'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>Stride Length</h4>
            <p style={{ margin: '0', fontSize: '18px', fontWeight: 'bold' }}>
              {gaitParameters.strideLength.toFixed(2)} m
            </p>
          </div>

          <div className="parameter-card" data-testid="gait-velocity" style={{
            backgroundColor: 'white',
            padding: '15px',
            borderRadius: '4px',
            border: '1px solid #ddd'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>Velocity</h4>
            <p style={{ margin: '0', fontSize: '18px', fontWeight: 'bold' }}>
              {gaitParameters.velocity.toFixed(2)} m/s
            </p>
          </div>

          <div className="parameter-card" data-testid="gait-symmetry" style={{
            backgroundColor: 'white',
            padding: '15px',
            borderRadius: '4px',
            border: '1px solid #ddd'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>Symmetry Index</h4>
            <p style={{ margin: '0', fontSize: '18px', fontWeight: 'bold' }}>
              {gaitParameters.symmetryIndex.toFixed(1)}%
            </p>
          </div>

          <div className="parameter-card" data-testid="gait-phase-left" style={{
            backgroundColor: 'white',
            padding: '15px',
            borderRadius: '4px',
            border: '1px solid #ddd'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>Left Phase</h4>
            <p style={{ margin: '0', fontSize: '16px', fontWeight: 'bold' }}>
              {gaitParameters.gaitPhase.left}
            </p>
          </div>

          <div className="parameter-card" data-testid="gait-phase-right" style={{
            backgroundColor: 'white',
            padding: '15px',
            borderRadius: '4px',
            border: '1px solid #ddd'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>Right Phase</h4>
            <p style={{ margin: '0', fontSize: '16px', fontWeight: 'bold' }}>
              {gaitParameters.gaitPhase.right}
            </p>
          </div>

          <div className="parameter-card" data-testid="pose-confidence" style={{
            backgroundColor: 'white',
            padding: '15px',
            borderRadius: '4px',
            border: '1px solid #ddd'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>Analysis Confidence</h4>
            <p style={{ margin: '0', fontSize: '18px', fontWeight: 'bold' }} data-testid="pose-confidence-value">
              {(gaitParameters.confidence * 100).toFixed(1)}%
            </p>
          </div>
        </div>

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
