/**
 * Video Display Component - Shows live video feed with pose overlay
 * Renders the camera feed and pose detection visualization
 */

import React, { useRef, useEffect, useState } from 'react';
import { ApplicationCoordinator } from '../services/ApplicationCoordinator';
import { PoseAnalysis } from '../types';
import './VideoDisplay.css';

interface VideoDisplayProps {
  isActive: boolean;
  coordinator: ApplicationCoordinator;
  className?: string;
}

export const VideoDisplay: React.FC<VideoDisplayProps> = ({
  isActive,
  coordinator,
  className
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentPose, setCurrentPose] = useState<PoseAnalysis | null>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);

  // Setup video stream
  useEffect(() => {
    const setupVideo = async () => {
      if (isActive && videoRef.current) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 }
            }
          });
          
          setVideoStream(stream);
          videoRef.current.srcObject = stream;
        } catch (error) {
          console.error('Failed to setup video:', error);
        }
      } else if (!isActive && videoStream) {
        // Cleanup video stream
        videoStream.getTracks().forEach(track => track.stop());
        setVideoStream(null);
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      }
    };

    setupVideo();

    return () => {
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isActive, videoStream]);

  // Listen for pose updates
  useEffect(() => {
    const handlePoseDetected = (analysis: PoseAnalysis) => {
      setCurrentPose(analysis);
    };

    coordinator.on('poseDetected', handlePoseDetected);

    return () => {
      coordinator.off('poseDetected', handlePoseDetected);
    };
  }, [coordinator]);

  // Draw pose overlay
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    if (!canvas || !video || !currentPose) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match video
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw pose skeleton
    drawPoseSkeleton(ctx, currentPose);
  }, [currentPose]);

  const drawPoseSkeleton = (ctx: CanvasRenderingContext2D, poseAnalysis: PoseAnalysis) => {
    const { keypoints } = poseAnalysis;
    
    // Draw connections between keypoints
    const connections = [
      // Head
      [0, 1], [0, 2], [1, 3], [2, 4],
      // Arms
      [5, 7], [7, 9], [6, 8], [8, 10],
      // Torso
      [5, 6], [5, 11], [6, 12], [11, 12],
      // Legs
      [11, 13], [13, 15], [12, 14], [14, 16]
    ];

    // Draw connections
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
    ctx.lineWidth = 2;

    connections.forEach(([startIdx, endIdx]) => {
      const startPoint = keypoints[startIdx];
      const endPoint = keypoints[endIdx];
      
      if (startPoint && endPoint && startPoint.score > 0.5 && endPoint.score > 0.5) {
        ctx.beginPath();
        ctx.moveTo(startPoint.x, startPoint.y);
        ctx.lineTo(endPoint.x, endPoint.y);
        ctx.stroke();
      }
    });

    // Draw keypoints
    keypoints.forEach((keypoint, index) => {
      if (keypoint.score > 0.5) {
        const { x, y, score } = keypoint;
        
        // Color based on confidence
        const alpha = score;
        ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`;
        
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
        
        // Draw confidence score
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.font = '10px Arial';
        ctx.fillText(score.toFixed(2), x + 5, y - 5);
      }
    });
  };

  return (
    <div className={`video-display ${className || ''}`}>
      <div className="video-container">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="video-element"
          data-testid="video-element"
        />
        
        <canvas
          ref={canvasRef}
          className="pose-overlay"
          data-testid="pose-overlay"
        />
        
        {!isActive && (
          <div className="video-placeholder">
            <div className="placeholder-content">
              <div className="camera-icon">📹</div>
              <p>Camera feed will appear here when analysis starts</p>
            </div>
          </div>
        )}
        
        {isActive && !videoStream && (
          <div className="video-loading">
            <div className="loading-spinner"></div>
            <p>Initializing camera...</p>
          </div>
        )}
      </div>
      
      <div className="video-info">
        <div className="info-row">
          <span className="info-label">Status:</span>
          <span className="info-value">
            {isActive ? (videoStream ? 'Active' : 'Initializing') : 'Inactive'}
          </span>
        </div>
        
        {currentPose && (
          <div className="info-row">
            <span className="info-label">Pose Confidence:</span>
            <span className="info-value">
              {(currentPose.confidence * 100).toFixed(1)}%
            </span>
          </div>
        )}
        
        <div className="info-row">
          <span className="info-label">Resolution:</span>
          <span className="info-value">
            {videoRef.current?.videoWidth || 0} × {videoRef.current?.videoHeight || 0}
          </span>
        </div>
      </div>
    </div>
  );
};