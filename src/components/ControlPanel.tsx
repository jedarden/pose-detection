/**
 * Control Panel Component - Main controls for starting/stopping the application
 * Provides user interface for controlling the gait detection system
 */

import React from 'react';

export interface ControlPanelProps {
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onExport: () => void;
  isRunning: boolean;
  canStart: boolean;
  className?: string;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  onStart,
  onStop,
  onReset,
  onExport,
  isRunning,
  canStart,
  className,
  ...props
}) => {
  return (
    <div className={`control-panel ${className || ''}`} {...props}>
      <h3>Controls</h3>
      
      <div className="control-buttons">
        <button
          className="start-button primary"
          onClick={onStart}
          disabled={!canStart}
          data-testid="start-camera-button"
          title={canStart ? 'Start gait detection' : 'Cannot start - check system status'}
        >
          ▶️ Start Analysis
        </button>

        <button
          className="stop-button secondary"
          onClick={onStop}
          disabled={!isRunning}
          data-testid="stop-camera-button"
          title="Stop gait detection"
        >
          ⏹️ Stop Analysis
        </button>

        <button
          className="reset-button tertiary"
          onClick={onReset}
          data-testid="reset-button"
          title="Reset all data and return to initial state"
        >
          🔄 Reset
        </button>

        <button
          className="export-button secondary"
          onClick={onExport}
          data-testid="export-button"
          title="Export analysis results"
        >
          📊 Export Data
        </button>
      </div>
    </div>
  );
};
