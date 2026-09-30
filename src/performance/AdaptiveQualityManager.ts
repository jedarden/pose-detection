/**
 * Adaptive quality management system for gait detection
 * Automatically adjusts processing quality based on device capabilities and performance
 */

import { PerformanceMetrics, PerformanceMonitor } from './PerformanceMonitor';

interface QualityProfile {
  name: string;
  videoResolution: { width: number; height: number };
  frameRate: number;
  modelComplexity: 'minimal' | 'reduced' | 'standard' | 'high' | 'maximum';
  processingQuality: 'low' | 'medium' | 'high' | 'ultra';
  enableGPUAcceleration: boolean;
  bufferSize: number;
  maxConcurrentProcessing: number;
}

interface DeviceCapabilities {
  deviceClass: 'low-end' | 'mid-range' | 'high-end';
  memorySize: number;
  cpuCores: number;
  hasGPUAcceleration: boolean;
  batteryLevel?: number;
  isCharging?: boolean;
  networkType?: 'slow-2g' | '2g' | '3g' | '4g' | '5g' | 'wifi';
}

interface AdaptationRules {
  fpsThreshold: number;
  memoryThreshold: number;
  cpuThreshold: number;
  latencyThreshold: number;
  batteryThreshold: number;
  hysteresis: number; // Prevent rapid switching
}

class AdaptiveQualityManager {
  private currentProfile: QualityProfile;
  private availableProfiles: QualityProfile[];
  private deviceCapabilities: DeviceCapabilities;
  private adaptationRules: AdaptationRules;
  private performanceMonitor: PerformanceMonitor;
  private lastAdaptationTime: number;
  private adaptationHistory: { timestamp: number; profile: string; reason: string }[];
  private observers: ((profile: QualityProfile) => void)[];
  private unsubscribePerformance?: () => void;
  private battery?: any;
  private batteryUpdateHandler?: () => void;
  private isDisposed = false;

  constructor(performanceMonitor: PerformanceMonitor) {
    this.performanceMonitor = performanceMonitor;
    this.lastAdaptationTime = 0;
    this.adaptationHistory = [];
    this.observers = [];

    this.deviceCapabilities = this.detectDeviceCapabilities();
    this.availableProfiles = this.generateQualityProfiles();
    this.currentProfile = this.selectInitialProfile();
    
    this.adaptationRules = {
      fpsThreshold: 25,
      memoryThreshold: 400 * 1024 * 1024, // 400MB
      cpuThreshold: 70,
      latencyThreshold: 100,
      batteryThreshold: 20,
      hysteresis: 2000 // 2 seconds
    };

    this.startAdaptationLoop();
    this.monitorBatteryStatus();
  }

  private detectDeviceCapabilities(): DeviceCapabilities {
    const memory = (navigator as any).deviceMemory || 4;
    const cores = navigator.hardwareConcurrency || 4;
    const hasGPU = this.detectGPUAcceleration();
    
    let deviceClass: DeviceCapabilities['deviceClass'];
    if (memory >= 8 && cores >= 8) {
      deviceClass = 'high-end';
    } else if (memory >= 4 && cores >= 4) {
      deviceClass = 'mid-range';
    } else {
      deviceClass = 'low-end';
    }

    return {
      deviceClass,
      memorySize: memory * 1024 * 1024 * 1024, // Convert to bytes
      cpuCores: cores,
      hasGPUAcceleration: hasGPU,
      networkType: this.detectNetworkType()
    };
  }

  private detectGPUAcceleration(): boolean {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return gl !== null;
  }

  private detectNetworkType(): DeviceCapabilities['networkType'] {
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (connection) {
      const effectiveType = connection.effectiveType;
      if (effectiveType) {
        return effectiveType;
      }
    }
    return 'wifi'; // Default assumption
  }

  private generateQualityProfiles(): QualityProfile[] {
    return [
      {
        name: 'ultra',
        videoResolution: { width: 1920, height: 1080 },
        frameRate: 60,
        modelComplexity: 'maximum',
        processingQuality: 'ultra',
        enableGPUAcceleration: true,
        bufferSize: 5,
        maxConcurrentProcessing: 4
      },
      {
        name: 'high',
        videoResolution: { width: 1280, height: 720 },
        frameRate: 30,
        modelComplexity: 'high',
        processingQuality: 'high',
        enableGPUAcceleration: true,
        bufferSize: 3,
        maxConcurrentProcessing: 2
      },
      {
        name: 'medium',
        videoResolution: { width: 854, height: 480 },
        frameRate: 30,
        modelComplexity: 'standard',
        processingQuality: 'medium',
        enableGPUAcceleration: true,
        bufferSize: 2,
        maxConcurrentProcessing: 1
      },
      {
        name: 'low',
        videoResolution: { width: 640, height: 360 },
        frameRate: 24,
        modelComplexity: 'reduced',
        processingQuality: 'low',
        enableGPUAcceleration: false,
        bufferSize: 1,
        maxConcurrentProcessing: 1
      },
      {
        name: 'minimal',
        videoResolution: { width: 480, height: 270 },
        frameRate: 15,
        modelComplexity: 'minimal',
        processingQuality: 'low',
        enableGPUAcceleration: false,
        bufferSize: 1,
        maxConcurrentProcessing: 1
      }
    ];
  }

  private selectInitialProfile(): QualityProfile {
    switch (this.deviceCapabilities.deviceClass) {
      case 'high-end':
        return this.availableProfiles.find(p => p.name === 'high') || this.availableProfiles[1];
      case 'mid-range':
        return this.availableProfiles.find(p => p.name === 'medium') || this.availableProfiles[2];
      case 'low-end':
        return this.availableProfiles.find(p => p.name === 'low') || this.availableProfiles[3];
      default:
        return this.availableProfiles[2]; // Default to medium
    }
  }

  private startAdaptationLoop(): void {
    // Subscribe to performance metrics
    this.unsubscribePerformance = this.performanceMonitor.subscribe((metrics) => {
      this.adaptQuality(metrics);
    });
  }

  private async monitorBatteryStatus(): Promise<void> {
    if ('getBattery' in navigator) {
      try {
        const battery = await (navigator as any).getBattery();
        if (this.isDisposed) return;
        
        const updateBatteryInfo = () => {
          if (this.isDisposed) return;
          this.deviceCapabilities.batteryLevel = battery.level * 100;
          this.deviceCapabilities.isCharging = battery.charging;
          this.adaptForBatteryStatus();
        };
        
        updateBatteryInfo();
        this.battery = battery;
        this.batteryUpdateHandler = updateBatteryInfo;
        battery.addEventListener('levelchange', updateBatteryInfo);
        battery.addEventListener('chargingchange', updateBatteryInfo);
      } catch (error) {
        console.warn('Battery API not available:', error);
      }
    }
  }

  private adaptQuality(metrics: PerformanceMetrics): void {
    const now = performance.now();
    
    // Prevent rapid switching (hysteresis)
    if (now - this.lastAdaptationTime < this.adaptationRules.hysteresis) {
      return;
    }

    const shouldDowngrade = this.shouldDowngradeQuality(metrics);
    const shouldUpgrade = this.shouldUpgradeQuality(metrics);

    if (shouldDowngrade) {
      this.downgradeQuality(metrics);
    } else if (shouldUpgrade) {
      this.upgradeQuality(metrics);
    }
  }

  private shouldDowngradeQuality(metrics: PerformanceMetrics): boolean {
    return (
      metrics.fps < this.adaptationRules.fpsThreshold ||
      metrics.memoryUsage > this.adaptationRules.memoryThreshold ||
      metrics.cpuUsage > this.adaptationRules.cpuThreshold ||
      metrics.processingLatency > this.adaptationRules.latencyThreshold ||
      metrics.droppedFrames > 10 // More than 10 dropped frames
    );
  }

  private shouldUpgradeQuality(metrics: PerformanceMetrics): boolean {
    return (
      metrics.fps > this.adaptationRules.fpsThreshold + 10 &&
      metrics.memoryUsage < this.adaptationRules.memoryThreshold * 0.7 &&
      metrics.cpuUsage < this.adaptationRules.cpuThreshold * 0.7 &&
      metrics.processingLatency < this.adaptationRules.latencyThreshold * 0.7 &&
      metrics.droppedFrames < 2
    );
  }

  private downgradeQuality(metrics: PerformanceMetrics): void {
    const currentIndex = this.availableProfiles.findIndex(p => p.name === this.currentProfile.name);
    
    if (currentIndex < this.availableProfiles.length - 1) {
      const newProfile = this.availableProfiles[currentIndex + 1];
      this.switchProfile(newProfile, this.getDowngradeReason(metrics));
    }
  }

  private upgradeQuality(metrics: PerformanceMetrics): void {
    const currentIndex = this.availableProfiles.findIndex(p => p.name === this.currentProfile.name);
    
    if (currentIndex > 0) {
      const newProfile = this.availableProfiles[currentIndex - 1];
      this.switchProfile(newProfile, 'Performance improved, upgrading quality');
    }
  }

  private getDowngradeReason(metrics: PerformanceMetrics): string {
    const reasons = [];
    
    if (metrics.fps < this.adaptationRules.fpsThreshold) {
      reasons.push(`Low FPS: ${metrics.fps.toFixed(1)}`);
    }
    
    if (metrics.memoryUsage > this.adaptationRules.memoryThreshold) {
      reasons.push(`High memory: ${(metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB`);
    }
    
    if (metrics.cpuUsage > this.adaptationRules.cpuThreshold) {
      reasons.push(`High CPU: ${metrics.cpuUsage.toFixed(1)}%`);
    }
    
    if (metrics.processingLatency > this.adaptationRules.latencyThreshold) {
      reasons.push(`High latency: ${metrics.processingLatency.toFixed(1)}ms`);
    }
    
    if (metrics.droppedFrames > 10) {
      reasons.push(`Dropped frames: ${metrics.droppedFrames}`);
    }
    
    return reasons.join(', ');
  }

  private adaptForBatteryStatus(): void {
    if (!this.deviceCapabilities.batteryLevel || !this.deviceCapabilities.isCharging) {
      return;
    }

    const batteryLevel = this.deviceCapabilities.batteryLevel;
    const isCharging = this.deviceCapabilities.isCharging;

    if (!isCharging && batteryLevel < this.adaptationRules.batteryThreshold) {
      // Force low power mode
      const lowPowerProfile = this.availableProfiles.find(p => p.name === 'low') || this.availableProfiles[3];
      this.switchProfile(lowPowerProfile, `Low battery: ${batteryLevel.toFixed(1)}%`);
    }
  }

  private switchProfile(newProfile: QualityProfile, reason: string): void {
    const oldProfile = this.currentProfile;
    this.currentProfile = newProfile;
    this.lastAdaptationTime = performance.now();
    
    // Record adaptation history
    this.adaptationHistory.push({
      timestamp: Date.now(),
      profile: newProfile.name,
      reason
    });
    
    // Keep only last 50 adaptations
    if (this.adaptationHistory.length > 50) {
      this.adaptationHistory.shift();
    }
    
    console.log(`Quality adapted: ${oldProfile.name} → ${newProfile.name} (${reason})`);
    
    // Notify observers
    this.notifyObservers(newProfile);
  }

  private notifyObservers(profile: QualityProfile): void {
    this.observers.forEach(observer => {
      try {
        observer(profile);
      } catch (error) {
        console.error('Quality observer error:', error);
      }
    });
  }

  public subscribe(observer: (profile: QualityProfile) => void): () => void {
    this.observers.push(observer);
    return () => {
      const index = this.observers.indexOf(observer);
      if (index > -1) {
        this.observers.splice(index, 1);
      }
    };
  }

  public getCurrentProfile(): QualityProfile {
    return { ...this.currentProfile };
  }

  public getAvailableProfiles(): QualityProfile[] {
    return [...this.availableProfiles];
  }

  public getDeviceCapabilities(): DeviceCapabilities {
    return { ...this.deviceCapabilities };
  }

  public getAdaptationHistory(): { timestamp: number; profile: string; reason: string }[] {
    return [...this.adaptationHistory];
  }

  public setProfile(profileName: string): boolean {
    const profile = this.availableProfiles.find(p => p.name === profileName);
    if (profile) {
      this.switchProfile(profile, 'Manual selection');
      return true;
    }
    return false;
  }

  public updateAdaptationRules(rules: Partial<AdaptationRules>): void {
    this.adaptationRules = { ...this.adaptationRules, ...rules };
  }

  public getAdaptationRules(): AdaptationRules {
    return { ...this.adaptationRules };
  }

  public createCustomProfile(profile: QualityProfile): void {
    this.availableProfiles.push(profile);
  }

  public removeCustomProfile(profileName: string): boolean {
    const index = this.availableProfiles.findIndex(p => p.name === profileName);
    if (index > -1 && index > 4) { // Don't remove built-in profiles
      this.availableProfiles.splice(index, 1);
      return true;
    }
    return false;
  }

  public getOptimizedSettings(): {
    videoConstraints: MediaTrackConstraints;
    processingOptions: any;
  } {
    const profile = this.currentProfile;
    
    return {
      videoConstraints: {
        width: { ideal: profile.videoResolution.width },
        height: { ideal: profile.videoResolution.height },
        frameRate: { ideal: profile.frameRate }
      },
      processingOptions: {
        modelComplexity: profile.modelComplexity,
        processingQuality: profile.processingQuality,
        enableGPUAcceleration: profile.enableGPUAcceleration && this.deviceCapabilities.hasGPUAcceleration,
        bufferSize: profile.bufferSize,
        maxConcurrentProcessing: profile.maxConcurrentProcessing
      }
    };
  }

  public dispose(): void {
    this.isDisposed = true;
    this.unsubscribePerformance?.();
    this.unsubscribePerformance = undefined;

    if (this.battery) {
      if (this.batteryUpdateHandler) {
        this.battery.removeEventListener('levelchange', this.batteryUpdateHandler);
        this.battery.removeEventListener('chargingchange', this.batteryUpdateHandler);
      }
      this.battery = undefined;
      this.batteryUpdateHandler = undefined;
    }

    this.observers = [];
    this.adaptationHistory = [];
  }
}

export { AdaptiveQualityManager, type QualityProfile, type DeviceCapabilities, type AdaptationRules };
