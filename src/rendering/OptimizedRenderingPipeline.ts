/**
 * Optimized rendering pipeline for real-time gait detection visualization
 * Targets 30+ FPS with adaptive quality and efficient resource management
 */

interface RenderingOptions {
  targetFPS: number;
  enableDoubleBuffering: boolean;
  enableGPUAcceleration: boolean;
  maxBufferSize: number;
  adaptiveQuality: boolean;
}

interface RenderFrame {
  id: string;
  timestamp: number;
  imageData: ImageData;
  poses: PoseData[];
  overlays: OverlayData[];
  priority: number;
}

interface PoseData {
  keypoints: Keypoint[];
  confidence: number;
  bbox: BoundingBox;
}

interface Keypoint {
  x: number;
  y: number;
  confidence: number;
  name: string;
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OverlayData {
  type: 'skeleton' | 'trajectory' | 'metrics' | 'grid';
  data: any;
  visible: boolean;
  opacity: number;
}

interface RenderingStats {
  fps: number;
  frameTime: number;
  queueSize: number;
  droppedFrames: number;
  renderCalls: number;
  memoryUsage: number;
}

class OptimizedRenderingPipeline {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private backCanvas: HTMLCanvasElement;
  private backCtx: CanvasRenderingContext2D;
  private gl?: WebGLRenderingContext;
  private options: RenderingOptions;
  private frameQueue: RenderFrame[];
  private isRendering: boolean;
  private stats: RenderingStats;
  private lastFrameTime: number;
  private frameTimeHistory: number[];
  private objectPool: Map<string, any[]>;
  private renderingLoop?: number;
  private observers: ((stats: RenderingStats) => void)[];
  private shaders: Map<string, WebGLProgram>;
  private textures: Map<string, WebGLTexture>;
  private vertexBuffers: Map<string, WebGLBuffer>;

  constructor(canvas: HTMLCanvasElement, options: Partial<RenderingOptions> = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    
    this.options = {
      targetFPS: 30,
      enableDoubleBuffering: true,
      enableGPUAcceleration: true,
      maxBufferSize: 5,
      adaptiveQuality: true,
      ...options
    };

    this.frameQueue = [];
    this.isRendering = false;
    this.lastFrameTime = 0;
    this.frameTimeHistory = [];
    this.objectPool = new Map();
    this.observers = [];
    this.shaders = new Map();
    this.textures = new Map();
    this.vertexBuffers = new Map();

    this.stats = {
      fps: 0,
      frameTime: 0,
      queueSize: 0,
      droppedFrames: 0,
      renderCalls: 0,
      memoryUsage: 0
    };

    this.setupDoubleBuffering();
    this.setupWebGL();
    this.setupObjectPools();
    this.optimizeCanvasSettings();
  }

  private setupDoubleBuffering(): void {
    if (this.options.enableDoubleBuffering) {
      this.backCanvas = document.createElement('canvas');
      this.backCanvas.width = this.canvas.width;
      this.backCanvas.height = this.canvas.height;
      this.backCtx = this.backCanvas.getContext('2d')!;
      this.optimizeCanvasContext(this.backCtx);
    }
  }

  private setupWebGL(): void {
    if (this.options.enableGPUAcceleration) {
      try {
        this.gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');
        if (this.gl) {
          this.initializeWebGLResources();
        }
      } catch (error) {
        console.warn('WebGL initialization failed:', error);
        this.options.enableGPUAcceleration = false;
      }
    }
  }

  private initializeWebGLResources(): void {
    if (!this.gl) return;

    // Create shaders for pose rendering
    this.createPoseShader();
    this.createSkeletonShader();
    this.createTrajectoryShader();
    
    // Setup vertex buffers
    this.setupVertexBuffers();
    
    // Configure WebGL settings
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    this.gl.clearColor(0, 0, 0, 0);
  }

  private createPoseShader(): void {
    if (!this.gl) return;

    const vertexShaderSource = `
      attribute vec2 a_position;
      attribute float a_confidence;
      uniform vec2 u_resolution;
      uniform float u_pointSize;
      varying float v_confidence;
      
      void main() {
        vec2 zeroToOne = a_position / u_resolution;
        vec2 zeroToTwo = zeroToOne * 2.0;
        vec2 clipSpace = zeroToTwo - 1.0;
        
        gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
        gl_PointSize = u_pointSize;
        v_confidence = a_confidence;
      }
    `;

    const fragmentShaderSource = `
      precision mediump float;
      varying float v_confidence;
      
      void main() {
        vec2 center = gl_PointCoord - 0.5;
        float dist = length(center);
        
        if (dist > 0.5) {
          discard;
        }
        
        float alpha = v_confidence * (1.0 - dist * 2.0);
        gl_FragColor = vec4(1.0, 0.0, 0.0, alpha);
      }
    `;

    const program = this.createShaderProgram(vertexShaderSource, fragmentShaderSource);
    if (program) {
      this.shaders.set('pose', program);
    }
  }

  private createSkeletonShader(): void {
    if (!this.gl) return;

    const vertexShaderSource = `
      attribute vec2 a_position;
      uniform vec2 u_resolution;
      uniform float u_lineWidth;
      
      void main() {
        vec2 zeroToOne = a_position / u_resolution;
        vec2 zeroToTwo = zeroToOne * 2.0;
        vec2 clipSpace = zeroToTwo - 1.0;
        
        gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
      }
    `;

    const fragmentShaderSource = `
      precision mediump float;
      uniform vec3 u_color;
      uniform float u_opacity;
      
      void main() {
        gl_FragColor = vec4(u_color, u_opacity);
      }
    `;

    const program = this.createShaderProgram(vertexShaderSource, fragmentShaderSource);
    if (program) {
      this.shaders.set('skeleton', program);
    }
  }

  private createTrajectoryShader(): void {
    if (!this.gl) return;

    const vertexShaderSource = `
      attribute vec2 a_position;
      attribute float a_alpha;
      uniform vec2 u_resolution;
      varying float v_alpha;
      
      void main() {
        vec2 zeroToOne = a_position / u_resolution;
        vec2 zeroToTwo = zeroToOne * 2.0;
        vec2 clipSpace = zeroToTwo - 1.0;
        
        gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
        v_alpha = a_alpha;
      }
    `;

    const fragmentShaderSource = `
      precision mediump float;
      varying float v_alpha;
      uniform vec3 u_color;
      
      void main() {
        gl_FragColor = vec4(u_color, v_alpha);
      }
    `;

    const program = this.createShaderProgram(vertexShaderSource, fragmentShaderSource);
    if (program) {
      this.shaders.set('trajectory', program);
    }
  }

  private createShaderProgram(vertexSource: string, fragmentSource: string): WebGLProgram | null {
    if (!this.gl) return null;

    const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentSource);

    if (!vertexShader || !fragmentShader) return null;

    const program = this.gl.createProgram();
    if (!program) return null;

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      console.error('Shader program linking failed:', this.gl.getProgramInfoLog(program));
      return null;
    }

    return program;
  }

  private createShader(type: number, source: string): WebGLShader | null {
    if (!this.gl) return null;

    const shader = this.gl.createShader(type);
    if (!shader) return null;

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('Shader compilation failed:', this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  private setupVertexBuffers(): void {
    if (!this.gl) return;

    // Position buffer for poses
    const positionBuffer = this.gl.createBuffer();
    if (positionBuffer) {
      this.vertexBuffers.set('position', positionBuffer);
    }

    // Confidence buffer for poses
    const confidenceBuffer = this.gl.createBuffer();
    if (confidenceBuffer) {
      this.vertexBuffers.set('confidence', confidenceBuffer);
    }

    // Line buffer for skeleton
    const lineBuffer = this.gl.createBuffer();
    if (lineBuffer) {
      this.vertexBuffers.set('line', lineBuffer);
    }
  }

  private setupObjectPools(): void {
    // Pre-allocate commonly used objects
    this.objectPool.set('imageData', []);
    this.objectPool.set('renderFrames', []);
    this.objectPool.set('poses', []);
    this.objectPool.set('overlays', []);
    
    // Pre-populate pools
    for (let i = 0; i < 10; i++) {
      this.objectPool.get('poses')?.push({
        keypoints: [],
        confidence: 0,
        bbox: { x: 0, y: 0, width: 0, height: 0 }
      });
      
      this.objectPool.get('overlays')?.push({
        type: 'skeleton',
        data: {},
        visible: true,
        opacity: 1.0
      });
    }
  }

  private optimizeCanvasSettings(): void {
    this.optimizeCanvasContext(this.ctx);
  }

  private optimizeCanvasContext(ctx: CanvasRenderingContext2D): void {
    // Optimize canvas rendering settings
    ctx.imageSmoothingEnabled = false;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Set composite operation for better performance
    ctx.globalCompositeOperation = 'source-over';
  }

  private getObjectFromPool<T>(poolName: string): T | null {
    const pool = this.objectPool.get(poolName);
    return pool && pool.length > 0 ? pool.pop() : null;
  }

  private returnObjectToPool(poolName: string, obj: any): void {
    const pool = this.objectPool.get(poolName);
    if (pool) {
      pool.push(obj);
    }
  }

  public queueFrame(frame: RenderFrame): void {
    // Add frame to queue
    this.frameQueue.push(frame);
    
    // Sort by priority (higher priority first)
    this.frameQueue.sort((a, b) => b.priority - a.priority);
    
    // Limit queue size
    if (this.frameQueue.length > this.options.maxBufferSize) {
      const dropped = this.frameQueue.splice(this.options.maxBufferSize);
      this.stats.droppedFrames += dropped.length;
    }
    
    this.stats.queueSize = this.frameQueue.length;
    
    // Start rendering if not already running
    if (!this.isRendering) {
      this.startRendering();
    }
  }

  private startRendering(): void {
    if (this.isRendering) return;
    
    this.isRendering = true;
    this.renderLoop();
  }

  private renderLoop(): void {
    if (!this.isRendering) return;
    
    const now = performance.now();
    const targetFrameTime = 1000 / this.options.targetFPS;
    
    if (now - this.lastFrameTime >= targetFrameTime) {
      this.renderNextFrame();
      this.updateStats(now);
      this.lastFrameTime = now;
    }
    
    this.renderingLoop = requestAnimationFrame(() => this.renderLoop());
  }

  private renderNextFrame(): void {
    if (this.frameQueue.length === 0) {
      this.isRendering = false;
      return;
    }
    
    const frame = this.frameQueue.shift()!;
    this.renderFrame(frame);
    
    // Return frame to pool if possible
    this.returnObjectToPool('renderFrames', frame);
    
    this.stats.renderCalls++;
    this.stats.queueSize = this.frameQueue.length;
  }

  private renderFrame(frame: RenderFrame): void {
    const startTime = performance.now();
    
    // Clear canvas
    this.clearCanvas();
    
    // Render base image
    this.renderBaseImage(frame.imageData);
    
    // Render overlays
    frame.overlays.forEach(overlay => {
      if (overlay.visible) {
        this.renderOverlay(overlay, frame.poses);
      }
    });
    
    // Swap buffers if double buffering is enabled
    if (this.options.enableDoubleBuffering) {
      this.swapBuffers();
    }
    
    const endTime = performance.now();
    this.frameTimeHistory.push(endTime - startTime);
    
    // Keep only recent frame times
    if (this.frameTimeHistory.length > 60) {
      this.frameTimeHistory.shift();
    }
  }

  private clearCanvas(): void {
    const ctx = this.options.enableDoubleBuffering ? this.backCtx : this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    if (this.gl) {
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }
  }

  private renderBaseImage(imageData: ImageData): void {
    const ctx = this.options.enableDoubleBuffering ? this.backCtx : this.ctx;
    ctx.putImageData(imageData, 0, 0);
  }

  private renderOverlay(overlay: OverlayData, poses: PoseData[]): void {
    const ctx = this.options.enableDoubleBuffering ? this.backCtx : this.ctx;
    
    ctx.save();
    ctx.globalAlpha = overlay.opacity;
    
    switch (overlay.type) {
      case 'skeleton':
        this.renderSkeleton(ctx, poses);
        break;
      case 'trajectory':
        this.renderTrajectory(ctx, overlay.data);
        break;
      case 'metrics':
        this.renderMetrics(ctx, overlay.data);
        break;
      case 'grid':
        this.renderGrid(ctx, overlay.data);
        break;
    }
    
    ctx.restore();
  }

  private renderSkeleton(ctx: CanvasRenderingContext2D, poses: PoseData[]): void {
    if (this.gl && this.options.enableGPUAcceleration) {
      this.renderSkeletonWebGL(poses);
    } else {
      this.renderSkeletonCanvas(ctx, poses);
    }
  }

  private renderSkeletonCanvas(ctx: CanvasRenderingContext2D, poses: PoseData[]): void {
    poses.forEach(pose => {
      // Render connections
      this.renderConnections(ctx, pose.keypoints);
      
      // Render keypoints
      this.renderKeypoints(ctx, pose.keypoints);
    });
  }

  private renderSkeletonWebGL(poses: PoseData[]): void {
    if (!this.gl) return;
    
    const program = this.shaders.get('pose');
    if (!program) return;
    
    this.gl.useProgram(program);
    
    // Set uniforms
    const resolutionLocation = this.gl.getUniformLocation(program, 'u_resolution');
    this.gl.uniform2f(resolutionLocation, this.canvas.width, this.canvas.height);
    
    const pointSizeLocation = this.gl.getUniformLocation(program, 'u_pointSize');
    this.gl.uniform1f(pointSizeLocation, 8.0);
    
    poses.forEach(pose => {
      this.renderPoseWebGL(pose);
    });
  }

  private renderPoseWebGL(pose: PoseData): void {
    if (!this.gl) return;
    
    const positions = new Float32Array(pose.keypoints.length * 2);
    const confidences = new Float32Array(pose.keypoints.length);
    
    pose.keypoints.forEach((keypoint, index) => {
      positions[index * 2] = keypoint.x;
      positions[index * 2 + 1] = keypoint.y;
      confidences[index] = keypoint.confidence;
    });
    
    // Upload position data
    const positionBuffer = this.vertexBuffers.get('position');
    if (positionBuffer) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.DYNAMIC_DRAW);
      
      const positionLocation = this.gl.getAttribLocation(this.shaders.get('pose')!, 'a_position');
      this.gl.enableVertexAttribArray(positionLocation);
      this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 0, 0);
    }
    
    // Upload confidence data
    const confidenceBuffer = this.vertexBuffers.get('confidence');
    if (confidenceBuffer) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, confidenceBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, confidences, this.gl.DYNAMIC_DRAW);
      
      const confidenceLocation = this.gl.getAttribLocation(this.shaders.get('pose')!, 'a_confidence');
      this.gl.enableVertexAttribArray(confidenceLocation);
      this.gl.vertexAttribPointer(confidenceLocation, 1, this.gl.FLOAT, false, 0, 0);
    }
    
    // Draw points
    this.gl.drawArrays(this.gl.POINTS, 0, pose.keypoints.length);
  }

  private renderConnections(ctx: CanvasRenderingContext2D, keypoints: Keypoint[]): void {
    const connections = [
      ['left_shoulder', 'right_shoulder'],
      ['left_shoulder', 'left_elbow'],
      ['left_elbow', 'left_wrist'],
      ['right_shoulder', 'right_elbow'],
      ['right_elbow', 'right_wrist'],
      ['left_hip', 'right_hip'],
      ['left_shoulder', 'left_hip'],
      ['right_shoulder', 'right_hip'],
      ['left_hip', 'left_knee'],
      ['left_knee', 'left_ankle'],
      ['right_hip', 'right_knee'],
      ['right_knee', 'right_ankle']
    ];
    
    ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
    ctx.lineWidth = 2;
    
    connections.forEach(([from, to]) => {
      const fromPoint = keypoints.find(k => k.name === from);
      const toPoint = keypoints.find(k => k.name === to);
      
      if (fromPoint && toPoint && fromPoint.confidence > 0.5 && toPoint.confidence > 0.5) {
        ctx.beginPath();
        ctx.moveTo(fromPoint.x, fromPoint.y);
        ctx.lineTo(toPoint.x, toPoint.y);
        ctx.stroke();
      }
    });
  }

  private renderKeypoints(ctx: CanvasRenderingContext2D, keypoints: Keypoint[]): void {
    keypoints.forEach(keypoint => {
      if (keypoint.confidence > 0.5) {
        const alpha = Math.min(keypoint.confidence, 1.0);
        ctx.fillStyle = `rgba(255, 0, 0, ${alpha})`;
        
        ctx.beginPath();
        ctx.arc(keypoint.x, keypoint.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
  }

  private renderTrajectory(ctx: CanvasRenderingContext2D, trajectoryData: any): void {
    if (!trajectoryData.points || trajectoryData.points.length < 2) return;
    
    ctx.strokeStyle = trajectoryData.color || 'rgba(0, 0, 255, 0.8)';
    ctx.lineWidth = trajectoryData.width || 2;
    
    ctx.beginPath();
    ctx.moveTo(trajectoryData.points[0].x, trajectoryData.points[0].y);
    
    for (let i = 1; i < trajectoryData.points.length; i++) {
      const alpha = i / trajectoryData.points.length;
      ctx.globalAlpha = alpha;
      ctx.lineTo(trajectoryData.points[i].x, trajectoryData.points[i].y);
    }
    
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  }

  private renderMetrics(ctx: CanvasRenderingContext2D, metricsData: any): void {
    ctx.font = '16px Arial';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.textAlign = 'left';
    
    const metrics = metricsData.metrics || {};
    let y = 30;
    
    Object.entries(metrics).forEach(([key, value]) => {
      ctx.fillText(`${key}: ${value}`, 10, y);
      y += 20;
    });
  }

  private renderGrid(ctx: CanvasRenderingContext2D, gridData: any): void {
    const { spacing = 50, color = 'rgba(255, 255, 255, 0.2)' } = gridData;
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    
    // Vertical lines
    for (let x = 0; x < this.canvas.width; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.canvas.height);
      ctx.stroke();
    }
    
    // Horizontal lines
    for (let y = 0; y < this.canvas.height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.canvas.width, y);
      ctx.stroke();
    }
  }

  private swapBuffers(): void {
    if (this.backCanvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(this.backCanvas, 0, 0);
    }
  }

  private updateStats(now: number): void {
    // Calculate FPS
    if (this.frameTimeHistory.length > 0) {
      const avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length;
      this.stats.frameTime = avgFrameTime;
      this.stats.fps = 1000 / avgFrameTime;
    }
    
    // Update memory usage
    if ('memory' in performance) {
      this.stats.memoryUsage = (performance as any).memory.usedJSHeapSize;
    }
    
    // Notify observers
    this.notifyObservers();
  }

  private notifyObservers(): void {
    this.observers.forEach(observer => {
      try {
        observer(this.stats);
      } catch (error) {
        console.error('Rendering observer error:', error);
      }
    });
  }

  public subscribe(observer: (stats: RenderingStats) => void): () => void {
    this.observers.push(observer);
    return () => {
      const index = this.observers.indexOf(observer);
      if (index > -1) {
        this.observers.splice(index, 1);
      }
    };
  }

  public getStats(): RenderingStats {
    return { ...this.stats };
  }

  public updateOptions(options: Partial<RenderingOptions>): void {
    this.options = { ...this.options, ...options };
    
    // Restart rendering if target FPS changed
    if (options.targetFPS && this.isRendering) {
      this.stop();
      this.start();
    }
  }

  public start(): void {
    if (!this.isRendering) {
      this.startRendering();
    }
  }

  public stop(): void {
    this.isRendering = false;
    if (this.renderingLoop) {
      cancelAnimationFrame(this.renderingLoop);
      this.renderingLoop = undefined;
    }
  }

  public clear(): void {
    this.frameQueue = [];
    this.stats.queueSize = 0;
    this.clearCanvas();
  }

  public resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    
    if (this.backCanvas) {
      this.backCanvas.width = width;
      this.backCanvas.height = height;
    }
    
    if (this.gl) {
      this.gl.viewport(0, 0, width, height);
    }
  }

  public dispose(): void {
    this.stop();
    this.observers = [];
    this.frameQueue = [];
    this.objectPool.clear();
    
    // Clean up WebGL resources
    if (this.gl) {
      this.shaders.forEach(shader => {
        this.gl!.deleteProgram(shader);
      });
      this.textures.forEach(texture => {
        this.gl!.deleteTexture(texture);
      });
      this.vertexBuffers.forEach(buffer => {
        this.gl!.deleteBuffer(buffer);
      });
    }
  }
}

export { OptimizedRenderingPipeline, type RenderingOptions, type RenderFrame, type RenderingStats };
