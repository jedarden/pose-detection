/**
 * Performance Monitor Component - Displays real-time performance metrics
 * Shows FPS, processing time, memory usage, and system health indicators
 */

import React, { useEffect, useState } from 'react';

interface PerformanceMetrics {
  frameRate: number;
  averageProcessingTime: number;
  memoryUsage: number;
  droppedFrames: number;
  processingLatency: number;
  modelInferenceTime: number;
  renderingTime: number;
  overallHealth: 'excellent' | 'good' | 'fair' | 'poor';
}

interface PerformanceMonitorProps {
  metrics: PerformanceMetrics;
  coordinator?: any;
  className?: string;
}

export const PerformanceMonitor: React.FC<PerformanceMonitorProps> = ({
  metrics,
  coordinator,
  className
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [historicalData, setHistoricalData] = useState<PerformanceMetrics[]>([]);

  useEffect(() => {
    // Update historical data for trends
    setHistoricalData(prev => {
      const updated = [...prev, metrics];
      // Keep only last 10 readings
      return updated.slice(-10);
    });
  }, [metrics]);

  const getHealthColor = (health: string): string => {
    switch (health) {
      case 'excellent': return 'text-green-600';
      case 'good': return 'text-blue-600';
      case 'fair': return 'text-yellow-600';
      case 'poor': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getMetricStatus = (value: number, type: string): string => {
    switch (type) {
      case 'fps':
        return value > 25 ? 'text-green-600' : value > 15 ? 'text-yellow-600' : 'text-red-600';
      case 'processingTime':
        return value < 25 ? 'text-green-600' : value < 50 ? 'text-yellow-600' : 'text-red-600';
      case 'memory':
        return value < 200 ? 'text-green-600' : value < 400 ? 'text-yellow-600' : 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const formatValue = (value: number, unit: string, decimals: number): string => {
    return `${value.toFixed(decimals)}${unit}`;
  };

  return (
    <div className={`performance-monitor bg-gray-100 p-4 rounded-lg ${className || ''}`} data-testid="performance-monitor">
      <div className="monitor-header flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold">Performance Monitor</h3>
        <button
          className="details-toggle text-blue-600 hover:text-blue-800"
          onClick={() => setShowDetails(!showDetails)}
          title={showDetails ? 'Hide details' : 'Show details'}
          data-testid="performance-details-toggle"
        >
          {showDetails ? '▼' : '▶'}
        </button>
      </div>

      {/* Overall Health Indicator */}
      <div className="health-indicator mb-4" data-testid="health-indicator">
        <div className="health-status flex justify-between items-center mb-2">
          <span className="health-label font-medium">System Health:</span>
          <span className={`health-value font-bold ${getHealthColor(metrics.overallHealth)}`} data-testid="health-status">
            {metrics.overallHealth.charAt(0).toUpperCase() + metrics.overallHealth.slice(1)}
          </span>
        </div>
        <div className="health-bar bg-gray-200 rounded-full h-2" data-testid="health-bar">
          <div
            className={`health-fill rounded-full h-2 transition-all duration-300 ${
              metrics.overallHealth === 'excellent' ? 'bg-green-500' :
              metrics.overallHealth === 'good' ? 'bg-blue-500' :
              metrics.overallHealth === 'fair' ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{
              width: metrics.overallHealth === 'excellent' ? '100%' :
                     metrics.overallHealth === 'good' ? '75%' :
                     metrics.overallHealth === 'fair' ? '50%' : '25%'
            }}
          />
        </div>
      </div>

      {/* Key Metrics */}
      <div className="metrics-summary grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="metrics-summary">
        <div className="metric-item text-center p-2 bg-white rounded" data-testid="fps-display">
          <span className="metric-label block text-sm text-gray-600">FPS:</span>
          <span className={`metric-value block text-lg font-bold ${getMetricStatus(metrics.frameRate, 'fps')}`} data-testid="fps-value">
            {formatValue(metrics.frameRate, '', 1)}
          </span>
        </div>

        <div className="metric-item text-center p-2 bg-white rounded" data-testid="processing-time">
          <span className="metric-label block text-sm text-gray-600">Processing:</span>
          <span className={`metric-value block text-lg font-bold ${getMetricStatus(metrics.averageProcessingTime, 'processingTime')}`}>
            {formatValue(metrics.averageProcessingTime, 'ms', 1)}
          </span>
        </div>

        <div className="metric-item text-center p-2 bg-white rounded" data-testid="memory-usage">
          <span className="metric-label block text-sm text-gray-600">Memory:</span>
          <span className={`metric-value block text-lg font-bold ${getMetricStatus(metrics.memoryUsage, 'memory')}`}>
            {formatValue(metrics.memoryUsage, 'MB', 0)}
          </span>
        </div>

        <div className="metric-item text-center p-2 bg-white rounded">
          <span className="metric-label block text-sm text-gray-600">Dropped:</span>
          <span className="metric-value block text-lg font-bold text-gray-800">
            {metrics.droppedFrames}
          </span>
        </div>
      </div>

      {/* Detailed Information */}
      {showDetails && (
        <div className="performance-details mt-4 p-4 bg-white rounded" data-testid="performance-details">
          {/* Detailed Metrics */}
          <div className="details-section mb-4">
            <h4 className="text-md font-semibold mb-2">Detailed Metrics</h4>
            <div className="detailed-metrics space-y-2">
              <div className="detail-row flex justify-between">
                <span className="detail-label text-gray-600">Model Inference:</span>
                <span className="detail-value font-medium" data-testid="model-inference-time">
                  {formatValue(metrics.modelInferenceTime, 'ms', 1)}
                </span>
              </div>

              <div className="detail-row flex justify-between">
                <span className="detail-label text-gray-600">Rendering Time:</span>
                <span className="detail-value font-medium" data-testid="rendering-time">
                  {formatValue(metrics.renderingTime, 'ms', 1)}
                </span>
              </div>

              <div className="detail-row flex justify-between">
                <span className="detail-label text-gray-600">Processing Latency:</span>
                <span className="detail-value font-medium" data-testid="processing-latency">
                  {formatValue(metrics.processingLatency, 'ms', 1)}
                </span>
              </div>
            </div>
          </div>

          {/* Performance Trends */}
          <div className="details-section">
            <h4 className="text-md font-semibold mb-2">Recent Trend</h4>
            <div className="trend-indicators space-y-2">
              <div className="trend-item flex justify-between">
                <span className="trend-label text-gray-600">FPS Trend:</span>
                <span className="trend-value">
                  {historicalData.length >= 2 ?
                    (historicalData[historicalData.length - 1].frameRate >
                     historicalData[historicalData.length - 2].frameRate ? '📈' : '📉')
                    : '➡️'}
                </span>
              </div>

              <div className="trend-item flex justify-between">
                <span className="trend-label text-gray-600">Memory Trend:</span>
                <span className="trend-value">
                  {historicalData.length >= 2 ?
                    (historicalData[historicalData.length - 1].memoryUsage <
                     historicalData[historicalData.length - 2].memoryUsage ? '📈' : '📉')
                    : '➡️'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Performance Warnings */}
      {(metrics.frameRate < 15 || metrics.memoryUsage > 512 || metrics.droppedFrames > 5) && (
        <div className="performance-warning mt-4 p-3 bg-red-100 border border-red-300 rounded flex items-center" data-testid="performance-warning">
          <span className="warning-icon mr-2">⚠️</span>
          <span className="warning-text text-red-700">
            Performance issues detected. System may be under stress.
          </span>
        </div>
      )}
    </div>
  );
};