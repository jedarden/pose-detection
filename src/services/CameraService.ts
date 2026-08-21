/**
 * Camera Service - Handles video capture and camera device management
 * Provides robust camera access with error handling and device switching
 */

import { EventEmitter } from 'events';
import { CameraDevice, VideoConstraints, VideoFrame } from '../types';

export class CameraService extends EventEmitter {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private isCapturing = false;
  private frameInterval: NodeJS.Timeout | null = null;
  private currentDevice: CameraDevice | null = null;
  private config: any;

  constructor(config: any) {
    super();
    this.config = config;
  }

  public async initialize(): Promise<void> {
    this.setupCanvas();
    this.emit('initialized');
  }

  private setupCanvas(): void {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
  }

  public async start(): Promise<void> {
    if (this.isCapturing) return;
    
    try {
      await this.initializeCamera();
      this.startFrameCapture();
      this.isCapturing = true;
      this.emit('started');
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    this.isCapturing = false;
    this.stopFrameCapture();
    this.stopCamera();
    this.emit('stopped');
  }

  private async initializeCamera(): Promise<void> {
    const constraints = this.config.defaultConstraints;
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    this.video = document.createElement('video');
    this.video.srcObject = this.stream;
    this.video.autoplay = true;
    this.video.muted = true;
    
    const updateCanvasDimensions = () => {
      if (this.video!.videoWidth > 0 && this.video!.videoHeight > 0) {
        this.canvas!.width = this.video!.videoWidth;
        this.canvas!.height = this.video!.videoHeight;
      }
    };

    this.video.onloadedmetadata = updateCanvasDimensions;
    this.video.onerror = (error) => this.emit('error', error);
    updateCanvasDimensions();
  }

  private startFrameCapture(): void {
    const captureFrame = () => {
      if (!this.isCapturing || !this.video || !this.canvas || !this.ctx) return;
      
      this.ctx.drawImage(this.video, 0, 0);
      const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      
      const frame: VideoFrame = {
        data: imageData,
        timestamp: Date.now(),
        width: this.canvas.width,
        height: this.canvas.height
      };
      
      this.emit('frameReady', frame);
    };
    
    this.frameInterval = setInterval(captureFrame, 1000 / 30); // 30 FPS
  }

  private stopFrameCapture(): void {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }
  }

  private stopCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
  }

  public async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  public async reset(): Promise<void> {
    await this.stop();
    this.emit('reset');
  }

  public getStatus(): any {
    return {
      isCapturing: this.isCapturing,
      hasStream: !!this.stream,
      hasVideo: !!this.video
    };
  }
}
