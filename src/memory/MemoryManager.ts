/**
 * Memory management utilities for gait detection application
 * Prevents memory leaks and optimizes garbage collection
 */

interface MemoryPool<T> {
  acquire(): T;
  release(item: T): void;
  size(): number;
  capacity(): number;
  clear(): void;
}

interface MemoryStats {
  totalAllocated: number;
  totalReleased: number;
  currentUsage: number;
  peakUsage: number;
  poolStats: Map<string, PoolStats>;
  gcStats: GCStats;
}

interface PoolStats {
  name: string;
  size: number;
  capacity: number;
  hits: number;
  misses: number;
  allocations: number;
  deallocations: number;
}

interface GCStats {
  collections: number;
  totalTime: number;
  averageTime: number;
  lastCollection: number;
}

class MemoryManager {
  private pools: Map<string, MemoryPool<any>> = new Map();
  private stats: MemoryStats;
  private gcObserver?: PerformanceObserver;
  private memoryObserver?: PerformanceObserver;
  private leakDetector: LeakDetector;
  private isMonitoring = false;
  private monitoringInterval: ReturnType<typeof setInterval> | null = null;
  private gcInterval: ReturnType<typeof setInterval> | null = null;
  private observers: ((stats: MemoryStats) => void)[] = [];

  constructor() {
    this.stats = {
      totalAllocated: 0,
      totalReleased: 0,
      currentUsage: 0,
      peakUsage: 0,
      poolStats: new Map(),
      gcStats: {
        collections: 0,
        totalTime: 0,
        averageTime: 0,
        lastCollection: 0
      }
    };

    this.leakDetector = new LeakDetector();
    this.initializeBuiltinPools();
    this.setupPerformanceObservers();
  }

  private initializeBuiltinPools(): void {
    // ImageData pool for video frames
    this.createPool('imageData', () => new ImageData(640, 480), 10);
    
    // Float32Array pool for pose data
    this.createPool('poseData', () => new Float32Array(51), 20); // 17 keypoints * 3 (x,y,confidence)
    
    // Uint8Array pool for frame processing
    this.createPool('frameBuffer', () => new Uint8Array(640 * 480 * 4), 5);
    
    // Object pool for pose results
    this.createPool('poseResult', () => ({
      keypoints: [],
      confidence: 0,
      timestamp: 0
    }), 15);
    
    // Array pool for trajectories
    this.createPool('trajectory', () => [], 10);
    
    // Canvas pool for rendering
    this.createPool('canvas', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      return canvas;
    }, 3);
  }

  private setupPerformanceObservers(): void {
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        // Monitor garbage collection
        this.gcObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'measure' && entry.name.includes('gc')) {
              this.stats.gcStats.collections++;
              this.stats.gcStats.totalTime += entry.duration;
              this.stats.gcStats.averageTime = this.stats.gcStats.totalTime / this.stats.gcStats.collections;
              this.stats.gcStats.lastCollection = entry.startTime;
            }
          }
        });
        
        this.gcObserver.observe({ entryTypes: ['measure'] });
        
        // Monitor memory usage
        this.memoryObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'navigation' || entry.entryType === 'resource') {
              this.updateMemoryStats();
            }
          }
        });
        
        this.memoryObserver.observe({ entryTypes: ['navigation', 'resource'] });
      } catch (error) {
        console.warn('Performance observers not available:', error);
      }
    }
  }

  private updateMemoryStats(): void {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.stats.currentUsage = memory.usedJSHeapSize;
      this.stats.peakUsage = Math.max(this.stats.peakUsage, memory.usedJSHeapSize);
    }
  }

  public createPool<T>(
    name: string,
    factory: () => T,
    initialSize: number = 10,
    maxSize: number = 50,
    resetFn?: (item: T) => void
  ): void {
    const pool = new ObjectPool<T>(factory, initialSize, maxSize, resetFn);
    this.pools.set(name, pool);
    
    this.stats.poolStats.set(name, {
      name,
      size: pool.size(),
      capacity: pool.capacity(),
      hits: 0,
      misses: 0,
      allocations: 0,
      deallocations: 0
    });
  }

  public acquire<T>(poolName: string): T {
    const pool = this.pools.get(poolName);
    if (!pool) {
      throw new Error(`Pool '${poolName}' not found`);
    }

    const poolStats = this.stats.poolStats.get(poolName)!;
    
    try {
      const item = pool.acquire();
      poolStats.hits++;
      poolStats.allocations++;
      this.stats.totalAllocated++;
      
      // Track for leak detection
      this.leakDetector.track(item, poolName);
      
      return item;
    } catch (error) {
      poolStats.misses++;
      throw error;
    }
  }

  public release<T>(poolName: string, item: T): void {
    const pool = this.pools.get(poolName);
    if (!pool) {
      console.warn(`Pool '${poolName}' not found for release`);
      return;
    }

    const poolStats = this.stats.poolStats.get(poolName)!;
    
    try {
      pool.release(item);
      poolStats.deallocations++;
      this.stats.totalReleased++;
      
      // Untrack from leak detection
      this.leakDetector.untrack(item);
    } catch (error) {
      console.error(`Error releasing item to pool '${poolName}':`, error);
    }
  }

  public getPool<T>(poolName: string): MemoryPool<T> | undefined {
    return this.pools.get(poolName);
  }

  public clearPool(poolName: string): void {
    const pool = this.pools.get(poolName);
    if (pool) {
      pool.clear();
      const poolStats = this.stats.poolStats.get(poolName)!;
      poolStats.size = 0;
    }
  }

  public clearAllPools(): void {
    for (const [name, pool] of this.pools) {
      pool.clear();
      const poolStats = this.stats.poolStats.get(name)!;
      poolStats.size = 0;
    }
  }

  public startMonitoring(): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    
    // Update stats periodically
    this.monitoringInterval = setInterval(() => {
      this.updateMemoryStats();
      this.updatePoolStats();
      this.checkForLeaks();
      this.notifyObservers();
    }, 1000);
    
    // Force garbage collection periodically (if available)
    if (typeof gc !== 'undefined') {
      this.gcInterval = setInterval(() => {
        performance.mark('gc-start');
        gc();
        performance.mark('gc-end');
        performance.measure('gc-duration', 'gc-start', 'gc-end');
      }, 10000);
    }
  }

  public stopMonitoring(): void {
    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = null;
    }
  }

  private updatePoolStats(): void {
    for (const [name, pool] of this.pools) {
      const poolStats = this.stats.poolStats.get(name)!;
      poolStats.size = pool.size();
      poolStats.capacity = pool.capacity();
    }
  }

  private checkForLeaks(): void {
    const leaks = this.leakDetector.detectLeaks();
    if (leaks.length > 0) {
      console.warn(`Memory leaks detected:`, leaks);
    }
  }

  private notifyObservers(): void {
    this.observers.forEach(observer => {
      try {
        observer(this.stats);
      } catch (error) {
        console.error('Memory observer error:', error);
      }
    });
  }

  public subscribe(observer: (stats: MemoryStats) => void): () => void {
    this.observers.push(observer);
    return () => {
      const index = this.observers.indexOf(observer);
      if (index > -1) {
        this.observers.splice(index, 1);
      }
    };
  }

  public getStats(): MemoryStats {
    this.updateMemoryStats();
    this.updatePoolStats();
    return { ...this.stats };
  }

  public getMemoryUsage(): number {
    if ('memory' in performance) {
      return (performance as any).memory.usedJSHeapSize;
    }
    return 0;
  }

  public forceGC(): void {
    if (typeof gc !== 'undefined') {
      gc();
    } else {
      // Trigger garbage collection by creating pressure
      const pressure = [];
      for (let i = 0; i < 1000; i++) {
        pressure.push(new ArrayBuffer(1024));
      }
      pressure.length = 0;
    }
  }

  public optimizeMemory(): void {
    // Clear unused pools
    for (const [name, pool] of this.pools) {
      const poolStats = this.stats.poolStats.get(name)!;
      if (poolStats.hits === 0 && poolStats.size > 0) {
        pool.clear();
        console.log(`Cleared unused pool: ${name}`);
      }
    }
    
    // Force garbage collection
    this.forceGC();
    
    // Clear leak detector
    this.leakDetector.clear();
  }

  public generateReport(): string {
    const stats = this.getStats();
    const report = [];
    
    report.push('=== Memory Usage Report ===');
    report.push(`Current Usage: ${(stats.currentUsage / 1024 / 1024).toFixed(2)} MB`);
    report.push(`Peak Usage: ${(stats.peakUsage / 1024 / 1024).toFixed(2)} MB`);
    report.push(`Total Allocated: ${stats.totalAllocated}`);
    report.push(`Total Released: ${stats.totalReleased}`);
    report.push(`Outstanding: ${stats.totalAllocated - stats.totalReleased}`);
    
    report.push('\n=== Pool Statistics ===');
    for (const [name, poolStats] of stats.poolStats) {
      report.push(`${name}:`);
      report.push(`  Size: ${poolStats.size}/${poolStats.capacity}`);
      report.push(`  Hits: ${poolStats.hits}, Misses: ${poolStats.misses}`);
      report.push(`  Hit Rate: ${(poolStats.hits / (poolStats.hits + poolStats.misses) * 100).toFixed(1)}%`);
      report.push(`  Allocations: ${poolStats.allocations}`);
      report.push(`  Deallocations: ${poolStats.deallocations}`);
    }
    
    report.push('\n=== Garbage Collection ===');
    report.push(`Collections: ${stats.gcStats.collections}`);
    report.push(`Total Time: ${stats.gcStats.totalTime.toFixed(2)}ms`);
    report.push(`Average Time: ${stats.gcStats.averageTime.toFixed(2)}ms`);
    report.push(`Last Collection: ${stats.gcStats.lastCollection.toFixed(2)}ms ago`);
    
    return report.join('\n');
  }

  public dispose(): void {
    this.stopMonitoring();
    this.clearAllPools();
    this.pools.clear();
    this.observers = [];
    
    if (this.gcObserver) {
      this.gcObserver.disconnect();
    }
    
    if (this.memoryObserver) {
      this.memoryObserver.disconnect();
    }
    
    this.leakDetector.dispose();
  }
}

class ObjectPool<T> implements MemoryPool<T> {
  private items: T[] = [];
  private factory: () => T;
  private resetFn?: (item: T) => void;
  private maxSize: number;
  private created = 0;

  constructor(
    factory: () => T,
    initialSize: number = 10,
    maxSize: number = 50,
    resetFn?: (item: T) => void
  ) {
    this.factory = factory;
    this.maxSize = maxSize;
    this.resetFn = resetFn;
    
    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      this.items.push(this.factory());
      this.created++;
    }
  }

  public acquire(): T {
    if (this.items.length > 0) {
      return this.items.pop()!;
    }
    
    // Create new item if pool is empty
    this.created++;
    return this.factory();
  }

  public release(item: T): void {
    if (this.items.length >= this.maxSize) {
      return; // Pool is full, let item be garbage collected
    }
    
    // Reset item if reset function provided
    if (this.resetFn) {
      try {
        this.resetFn(item);
      } catch (error) {
        console.error('Error resetting pooled item:', error);
        return;
      }
    }
    
    this.items.push(item);
  }

  public size(): number {
    return this.items.length;
  }

  public capacity(): number {
    return this.maxSize;
  }

  public clear(): void {
    this.items = [];
  }
}

class LeakDetector {
  private trackedObjects: WeakMap<object, string> = new WeakMap();
  private allocationTimes: Map<object, number> = new Map();
  private maxAge = 60000; // 1 minute

  public track(obj: object, poolName: string): void {
    this.trackedObjects.set(obj, poolName);
    this.allocationTimes.set(obj, Date.now());
  }

  public untrack(obj: object): void {
    this.allocationTimes.delete(obj);
    // WeakMap entries will be automatically cleaned up
  }

  public detectLeaks(): { poolName: string; age: number }[] {
    const leaks: { poolName: string; age: number }[] = [];
    const now = Date.now();
    
    for (const [obj, allocTime] of this.allocationTimes) {
      const age = now - allocTime;
      if (age > this.maxAge) {
        const poolName = this.trackedObjects.get(obj) || 'unknown';
        leaks.push({ poolName, age });
      }
    }
    
    return leaks;
  }

  public clear(): void {
    this.allocationTimes.clear();
    // WeakMap doesn't need to be cleared
  }

  public dispose(): void {
    this.clear();
  }
}

// Utility functions for common memory operations
export class MemoryUtils {
  public static createImageDataPool(width: number, height: number, size: number = 10): ObjectPool<ImageData> {
    return new ObjectPool<ImageData>(
      () => new ImageData(width, height),
      size,
      size * 2,
      (imageData) => {
        // Clear image data
        imageData.data.fill(0);
      }
    );
  }

  public static createArrayPool<T extends TypedArray>(ArrayConstructor: new (length: number) => T, length: number, size: number = 10): ObjectPool<T> {
    return new ObjectPool<T>(
      () => new ArrayConstructor(length),
      size,
      size * 2,
      (array) => {
        // Clear array
        array.fill(0);
      }
    );
  }

  public static createCanvasPool(width: number, height: number, size: number = 3): ObjectPool<HTMLCanvasElement> {
    return new ObjectPool<HTMLCanvasElement>(
      () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
      },
      size,
      size * 2,
      (canvas) => {
        // Clear canvas
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    );
  }

  public static estimateObjectSize(obj: any): number {
    let size = 0;
    
    if (obj instanceof ImageData) {
      size = obj.data.length;
    } else if (obj instanceof ArrayBuffer) {
      size = obj.byteLength;
    } else if (obj instanceof TypedArray) {
      size = obj.byteLength;
    } else if (obj instanceof Array) {
      size = obj.length * 8; // Rough estimate
    } else if (typeof obj === 'object' && obj !== null) {
      size = JSON.stringify(obj).length * 2; // Rough estimate
    }
    
    return size;
  }
}

type TypedArray = Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;

export { MemoryManager, ObjectPool, LeakDetector, type MemoryStats, type PoolStats };
