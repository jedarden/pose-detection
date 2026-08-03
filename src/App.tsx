import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { PoseDetectionService } from './services/PoseDetectionService';
import { PerformanceMonitor } from './components/PerformanceMonitor';
import { PoseDetectionDiagnostic } from './components/PoseDetectionDiagnostic';
import { SimplePoseTest } from './components/SimplePoseTest';
import { CameraSelector } from './components/CameraSelector';
import './App.css';

// Extend window for debug frame counting
declare global {
  interface Window {
    frameCount?: number;
  }
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [canStart, setCanStart] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isRunningRef = useRef(false);
  const [selectedCameraId, setSelectedCameraId] = useState<string | undefined>(undefined);
  const [showOverlays, setShowOverlays] = useState(true);
  const showOverlaysRef = useRef(true);

  // Service instances
  const poseDetectionService = useRef<PoseDetectionService | null>(null);

  // Tracking refs for real metrics
  const previousKeypointsRef = useRef<any[] | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);
  const poseStartTimeRef = useRef<number | null>(null);
  
  // State for pose tracking metrics
  const [poseMetrics, setPoseMetrics] = useState({
    detectionConfidence: 0,
    keypointCount: 0,
    visibleKeypoints: 0,
    poseStability: 0,
    trackingQuality: 0,
    movementIntensity: 0,
    poseDuration: 0,
    averageKeypointConfidence: 0
  });
  
  // State for detected pose keypoints
  const [currentPose, setCurrentPose] = useState(null);
  
  // State for performance metrics
  const [performanceMetrics, setPerformanceMetrics] = useState({
    frameRate: 0,
    averageProcessingTime: 0,
    memoryUsage: 0,
    droppedFrames: 0,
    processingLatency: 0,
    modelInferenceTime: 0,
    renderingTime: 0,
    overallHealth: 'good'
  });

  // Function to update canvas dimensions and position
  const updateCanvasLayout = useCallback(() => {
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
    }
  }, []);

  // Handle window resize
  useEffect(() => {
    window.addEventListener('resize', updateCanvasLayout);
    return () => window.removeEventListener('resize', updateCanvasLayout);
  }, [updateCanvasLayout]);

  // Initialize camera and services when component mounts or camera changes
  useEffect(() => {
    const initializeServices = async () => {
      try {
        console.log('Starting service initialization...');
        
        // Initialize pose detection service only if not already initialized
        if (!poseDetectionService.current) {
          console.log('Creating new PoseDetectionService instance...');
          poseDetectionService.current = new PoseDetectionService();
          
          // Configure pose detection
          try {
            console.log('Initializing pose detection service...');
            await poseDetectionService.current.initialize({
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
            });
            
            console.log('Pose detection service initialized successfully');
            console.log('Service ready state:', poseDetectionService.current.isReady());
          } catch (serviceError) {
            console.error('Failed to initialize pose detection service:', serviceError);
            throw serviceError;
          }
        }
        
        if (!videoRef.current) return;
        
        // Request camera access with specific device ID if selected
        const videoConstraints: MediaTrackConstraints = {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 }
        };
        
        if (selectedCameraId) {
          videoConstraints.deviceId = { exact: selectedCameraId };
        }
        
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints
        });
        
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        
        // Wait for video to load
        videoRef.current.onloadedmetadata = () => {
          // Set canvas dimensions to match actual video dimensions
          if (canvasRef.current && videoRef.current) {
            const videoWidth = videoRef.current.videoWidth;
            const videoHeight = videoRef.current.videoHeight;
            
            canvasRef.current.width = videoWidth;
            canvasRef.current.height = videoHeight;
            
            // Update canvas layout to match video display
            updateCanvasLayout();
            
            console.log('Canvas resized to match video:', videoWidth, 'x', videoHeight);
          }
          
          setIsInitialized(true);
          setCanStart(true);
          console.log('Camera initialized successfully');
        };
        
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize system';
        setError(errorMessage);
        console.error('Initialization error:', err);
      }
    };

    initializeServices();

    return () => {
      console.log('Cleanup: stopping animation frame and stream...');
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      // Don't dispose the pose detection service when changing cameras
      // It can be reused and doesn't need to reload the model
    };
  }, [selectedCameraId]); // Re-initialize when camera changes

  // Cleanup pose detection service only on component unmount
  useEffect(() => {
    return () => {
      console.log('Component unmounting: disposing pose detection service...');
      if (poseDetectionService.current) {
        poseDetectionService.current.dispose();
        poseDetectionService.current = null;
      }
    };
  }, []); // Empty dependency array - only run on unmount

  // Real-time pose detection and motion tracking
  const processFrame = async () => {
    console.log('processFrame called - video:', !!videoRef.current, 'canvas:', !!canvasRef.current);
    
    if (!videoRef.current || !canvasRef.current) {
      console.log('processFrame early return - missing video or canvas');
      return;
    }
    if (!poseDetectionService.current) {
      console.log('processFrame early return - no pose detection service');
      return;
    }

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw test indicator to verify canvas is working
      ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
      ctx.fillRect(canvas.width - 50, 5, 40, 20);
      ctx.fillStyle = 'white';
      ctx.font = '12px Arial';
      ctx.fillText('LIVE', canvas.width - 45, 18);

      // Debug logging
      const frameNumber = window.frameCount = (window.frameCount || 0) + 1;
      if (frameNumber % 30 === 0) { // Log every 30 frames to avoid spam
        console.log(`Frame ${frameNumber} - Video ready state:`, videoRef.current.readyState);
        console.log('Video dimensions:', videoRef.current.videoWidth, 'x', videoRef.current.videoHeight);
      }

      // Run pose detection
      const poses = await poseDetectionService.current.detectPoses(videoRef.current);
      if (frameNumber % 30 === 0) {
        console.log('Detected poses:', poses.length, poses);
      }
      
      if (poses.length > 0) {
        const pose = poses[0];
        const timestamp = Date.now();
        
        // Update current pose state
        setCurrentPose(pose);
        
        // Calculate pose tracking metrics
        const visibleKeypoints = pose.keypoints.filter(kp => kp.score > 0.3).length;
        const totalKeypoints = pose.keypoints.length;
        const averageConfidence = pose.keypoints.reduce((sum, kp) => sum + kp.score, 0) / totalKeypoints;
        
        // Calculate pose stability (based on confidence variance)
        const confidenceVariance = pose.keypoints.reduce((sum, kp) => {
          const diff = kp.score - averageConfidence;
          return sum + (diff * diff);
        }, 0) / totalKeypoints;
        const stability = Math.max(0, 1 - confidenceVariance);

        // Calculate movement intensity from frame-to-frame keypoint position changes
        let movementIntensity = 0;
        if (previousKeypointsRef.current && previousKeypointsRef.current.length === totalKeypoints) {
          let totalMovement = 0;
          let movementCount = 0;
          for (let i = 0; i < pose.keypoints.length; i++) {
            const currentKp = pose.keypoints[i];
            const prevKp = previousKeypointsRef.current[i];
            if (currentKp.score > 0.3 && prevKp.score > 0.3) {
              const dx = currentKp.x - prevKp.x;
              const dy = currentKp.y - prevKp.y;
              const distance = Math.sqrt(dx * dx + dy * dy);
              totalMovement += distance;
              movementCount++;
            }
          }
          // Normalize movement intensity: scale to 0-1 range, with typical movement in 0-100 pixel range
          movementIntensity = movementCount > 0 ? Math.min(1, totalMovement / movementCount / 100) : 0;
        }
        previousKeypointsRef.current = [...pose.keypoints];

        // Calculate real pose duration from actual pose detection start time
        if (!poseStartTimeRef.current) {
          poseStartTimeRef.current = timestamp;
        }
        const poseDuration = (timestamp - poseStartTimeRef.current) / 1000;

        setPoseMetrics({
          detectionConfidence: pose.confidence,
          keypointCount: totalKeypoints,
          visibleKeypoints: visibleKeypoints,
          poseStability: stability,
          trackingQuality: (averageConfidence + stability) / 2,
          movementIntensity: movementIntensity,
          poseDuration: poseDuration,
          averageKeypointConfidence: averageConfidence
        });
        
        // Draw pose visualization
        ctx.strokeStyle = '#00ff00';
        ctx.fillStyle = '#ff0000';
        ctx.lineWidth = 2;

        // Draw skeleton connections
        const connections = [
          [5, 6], [5, 7], [7, 9], [6, 8], [8, 10], // Arms
          [5, 11], [6, 12], [11, 12], // Torso
          [11, 13], [13, 15], [12, 14], [14, 16] // Legs
        ];

        // Mark that pose skeleton is being drawn
        if (canvas.getAttribute('data-posing-skeleton') !== 'true') {
          canvas.setAttribute('data-posing-skeleton', 'true');
        }

        connections.forEach(([from, to]) => {
          if (pose.keypoints[from] && pose.keypoints[to] &&
              pose.keypoints[from].score > 0.3 && pose.keypoints[to].score > 0.3) {
            ctx.beginPath();
            ctx.moveTo(pose.keypoints[from].x, pose.keypoints[from].y);
            ctx.lineTo(pose.keypoints[to].x, pose.keypoints[to].y);
            ctx.stroke();
          }
        });
        
        // Draw keypoints with confidence-based colors
        pose.keypoints.forEach((kp, idx) => {
          if (kp.score > 0.3) {
            // Color based on confidence: red for low, yellow for medium, green for high
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
            
            // Highlight critical keypoints (head, shoulders, hips)
            if (idx === 0 || idx === 5 || idx === 6 || idx === 11 || idx === 12) {
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(kp.x, kp.y, 8, 0, 2 * Math.PI);
              ctx.stroke();
            }
          }
        });
        
        // Draw pose information overlay if enabled
        if (showOverlaysRef.current) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
          ctx.fillRect(10, 10, 320, 160);
          
          ctx.fillStyle = '#ffffff';
          ctx.font = '12px Arial';
          ctx.fillText(`Pose Confidence: ${(pose.confidence * 100).toFixed(1)}%`, 20, 30);
          ctx.fillText(`Visible Keypoints: ${visibleKeypoints}/${totalKeypoints}`, 20, 50);
          ctx.fillText(`Avg Keypoint Confidence: ${(averageConfidence * 100).toFixed(1)}%`, 20, 70);
          ctx.fillText(`Pose Stability: ${(stability * 100).toFixed(1)}%`, 20, 90);
          ctx.fillText(`Tracking Quality: ${((averageConfidence + stability) / 2 * 100).toFixed(1)}%`, 20, 110);
          ctx.fillText(`Movement Intensity: ${(movementIntensity * 100).toFixed(1)}%`, 20, 130);
          ctx.fillText(`Detection ID: ${pose.id || 'N/A'}`, 20, 150);
        }
      } else {
        // No pose detected
        setCurrentPose(null);
        previousKeypointsRef.current = null;
        poseStartTimeRef.current = null;
        setPoseMetrics({
          detectionConfidence: 0,
          keypointCount: 0,
          visibleKeypoints: 0,
          poseStability: 0,
          trackingQuality: 0,
          movementIntensity: 0,
          poseDuration: 0,
          averageKeypointConfidence: 0
        });
        
        if (showOverlaysRef.current) {
          ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
          ctx.fillRect(10, 10, 200, 60);
          ctx.fillStyle = '#ffffff';
          ctx.font = '12px Arial';
          ctx.fillText('No person detected', 20, 30);
          ctx.fillText('Move into camera view', 20, 50);
        }
      }
      
      // Get detection stats and update performance metrics
      const stats = poseDetectionService.current.getStats();
      setPerformanceMetrics({
        frameRate: stats.currentFPS,
        averageProcessingTime: stats.avgProcessingTime,
        memoryUsage: stats.memoryUsage,
        droppedFrames: stats.droppedFrames || 0,
        processingLatency: stats.avgProcessingTime,
        modelInferenceTime: stats.avgProcessingTime * 0.7, // Estimate
        renderingTime: stats.avgProcessingTime * 0.3, // Estimate
        overallHealth: stats.currentFPS > 25 ? 'excellent' : 
                      stats.currentFPS > 15 ? 'good' : 
                      stats.currentFPS > 10 ? 'fair' : 'poor'
      });
      
      // Draw performance overlay if enabled
      if (showOverlaysRef.current) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(canvas.width - 220, 10, 210, 80);
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px Arial';
        ctx.fillText(`FPS: ${stats.currentFPS.toFixed(1)}`, canvas.width - 210, 25);
        ctx.fillText(`Processing: ${stats.avgProcessingTime.toFixed(1)}ms`, canvas.width - 210, 40);
        ctx.fillText(`Memory: ${stats.memoryUsage.toFixed(1)}MB`, canvas.width - 210, 55);
        ctx.fillText(`Poses Detected: ${stats.totalPoses || 0}`, canvas.width - 210, 70);
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown processing error';
      console.error('Frame processing error:', err);
      setError(`Processing error: ${errorMessage}`);
    }
    
    // Continue animation loop only if still running
    if (isRunningRef.current) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
    }
  };

  const handleStart = async () => {
    console.log('handleStart called - isInitialized:', isInitialized);
    if (!isInitialized) {
      setError('Camera not initialized');
      return;
    }

    try {
      setIsRunning(true);
      isRunningRef.current = true;
      setCanStart(false);
      setError(null);

      // Initialize session tracking
      sessionStartTimeRef.current = Date.now();
      previousKeypointsRef.current = null;
      poseStartTimeRef.current = null;

      console.log('Starting pose detection and motion tracking...');
      console.log('PoseDetectionService ready:', poseDetectionService.current?.isReady());

      // Start the animation loop
      console.log('Starting animation frame loop...');
      animationFrameRef.current = requestAnimationFrame(processFrame);
      console.log('Animation frame ID:', animationFrameRef.current);
    } catch (err) {
      setError('Failed to start detection');
      console.error('Start error:', err);
    }
  };

  const handleStop = () => {
    setIsRunning(false);
    isRunningRef.current = false;
    setCanStart(true);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    console.log('Stopping pose detection...');
  };

  const handleReset = () => {
    handleStop();

    // Reset all tracking state
    sessionStartTimeRef.current = null;
    previousKeypointsRef.current = null;
    poseStartTimeRef.current = null;

    // Clear canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }

    console.log('Resetting pose detection system...');
  };

  const handleCameraSelect = (deviceId: string) => {
    console.log('Camera selected:', deviceId);
    
    // Stop current detection if running
    if (isRunning) {
      handleStop();
    }
    
    // Stop current stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Set new camera ID - will trigger re-initialization
    setSelectedCameraId(deviceId);
  };

  const handleExport = () => {
    const sessionEndTime = Date.now();
    const sessionDuration = sessionStartTimeRef.current
      ? sessionEndTime - sessionStartTimeRef.current
      : 0;

    const exportData = {
      timestamp: new Date().toISOString(),
      poseTrackingMetrics: {
        ...poseMetrics
      },
      currentPose: currentPose ? {
        keypoints: currentPose.keypoints,
        confidence: currentPose.confidence,
        boundingBox: currentPose.boundingBox,
        id: currentPose.id
      } : null,
      performanceMetrics: {
        ...performanceMetrics
      },
      session: {
        duration: sessionDuration,
        startTime: sessionStartTimeRef.current ? new Date(sessionStartTimeRef.current).toISOString() : null,
        endTime: new Date(sessionEndTime).toISOString(),
        framesProcessed: poseDetectionService.current ? poseDetectionService.current.getStats().totalPoses : 0,
        averageProcessingTime: poseDetectionService.current ? poseDetectionService.current.getStats().avgProcessingTime : 0,
        currentFPS: poseDetectionService.current ? poseDetectionService.current.getStats().currentFPS : 0,
        memoryUsage: poseDetectionService.current ? poseDetectionService.current.getStats().memoryUsage : 0
      }
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `pose-tracking-data-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    console.log('Exporting pose detection and tracking data...');
  };

  return (
    <div className="App" data-testid="gait-detection-app">
      <header className="App-header">
        <h1 data-testid="app-title">Human Pose Detection & Motion Tracking</h1>
        <p>Real-time computer vision for human pose estimation and movement analysis</p>
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
              onChange={(e) => {
                console.log('Overlay toggle changed:', e.target.checked);
                setShowOverlays(e.target.checked);
                showOverlaysRef.current = e.target.checked;
              }}
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
            data-testid="canvas-overlay"
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
        
        {/* Pose Detection Metrics */}
        <div className="pose-metrics" data-testid="pose-metrics" style={{
          marginTop: '20px',
          padding: '20px',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '15px'
        }}>
          <h3 style={{ gridColumn: '1 / -1', margin: '0 0 10px 0' }}>Real-time Pose Detection Metrics</h3>
          
          <div className="parameter-card" data-testid="pose-confidence" style={{
            backgroundColor: 'white',
            padding: '15px',
            borderRadius: '4px',
            border: '1px solid #ddd'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>Detection Confidence</h4>
            <p style={{ margin: '0', fontSize: '18px', fontWeight: 'bold' }} data-testid="pose-confidence-value">
              {(poseMetrics.detectionConfidence * 100).toFixed(1)}%
            </p>
          </div>
          
          <div className="parameter-card" style={{ 
            backgroundColor: 'white', 
            padding: '15px', 
            borderRadius: '4px',
            border: '1px solid #ddd'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>Visible Keypoints</h4>
            <p style={{ margin: '0', fontSize: '18px', fontWeight: 'bold' }}>
              {poseMetrics.visibleKeypoints}/{poseMetrics.keypointCount}
            </p>
          </div>
          
          <div className="parameter-card" style={{ 
            backgroundColor: 'white', 
            padding: '15px', 
            borderRadius: '4px',
            border: '1px solid #ddd'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>Pose Stability</h4>
            <p style={{ margin: '0', fontSize: '18px', fontWeight: 'bold' }}>
              {(poseMetrics.poseStability * 100).toFixed(1)}%
            </p>
          </div>
          
          <div className="parameter-card" style={{ 
            backgroundColor: 'white', 
            padding: '15px', 
            borderRadius: '4px',
            border: '1px solid #ddd'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>Tracking Quality</h4>
            <p style={{ margin: '0', fontSize: '18px', fontWeight: 'bold' }}>
              {(poseMetrics.trackingQuality * 100).toFixed(1)}%
            </p>
          </div>
          
          <div className="parameter-card" style={{ 
            backgroundColor: 'white', 
            padding: '15px', 
            borderRadius: '4px',
            border: '1px solid #ddd'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>Movement Intensity</h4>
            <p style={{ margin: '0', fontSize: '18px', fontWeight: 'bold' }}>
              {(poseMetrics.movementIntensity * 100).toFixed(1)}%
            </p>
          </div>
          
          <div className="parameter-card" style={{ 
            backgroundColor: 'white', 
            padding: '15px', 
            borderRadius: '4px',
            border: '1px solid #ddd'
          }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>Avg Keypoint Confidence</h4>
            <p style={{ margin: '0', fontSize: '18px', fontWeight: 'bold' }}>
              {(poseMetrics.averageKeypointConfidence * 100).toFixed(1)}%
            </p>
          </div>
        </div>
        
        {/* Keypoint Information */}
        {currentPose && (
          <div className="keypoint-info" style={{ 
            marginTop: '20px', 
            padding: '20px', 
            backgroundColor: '#f0f8ff', 
            borderRadius: '8px'
          }}>
            <h3 style={{ margin: '0 0 15px 0' }}>Detected Keypoints</h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '10px',
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              {currentPose.keypoints.map((kp, idx) => (
                <div key={idx} style={{ 
                  padding: '8px', 
                  backgroundColor: kp.score > 0.3 ? '#e8f5e8' : '#f5f5f5',
                  borderRadius: '4px',
                  fontSize: '12px'
                }}>
                  <strong>{kp.name}</strong><br/>
                  Confidence: {(kp.score * 100).toFixed(1)}%<br/>
                  Position: ({kp.x.toFixed(0)}, {kp.y.toFixed(0)})
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Performance Monitor */}
        <div style={{ marginTop: '20px' }}>
          <PerformanceMonitor 
            metrics={performanceMetrics}
            coordinator={null} // Would need ApplicationCoordinator in full implementation
            className="pose-performance-monitor"
          />
        </div>
        
        {/* Diagnostic Component - Temporary for debugging */}
        {import.meta.env.DEV && (
          <div style={{ marginTop: '20px' }}>
            <PoseDetectionDiagnostic />
          </div>
        )}

        {/* Simple Pose Test - Temporary for debugging */}
        {import.meta.env.DEV && (
          <div style={{ marginTop: '20px' }}>
            <SimplePoseTest />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;