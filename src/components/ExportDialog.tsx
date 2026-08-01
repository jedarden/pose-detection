/**
 * Export Dialog Component - Data export configuration interface
 * Allows users to configure and trigger data exports
 */

import React, { useState } from 'react';
import { ExportOptions } from '../types';
import './ExportDialog.css';

interface ExportDialogProps {
  onExport: (options: ExportOptions) => void;
  onCancel: () => void;
  className?: string;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  onExport,
  onCancel,
  className
}) => {
  const [options, setOptions] = useState<ExportOptions>({
    format: 'json',
    includeRawData: false,
    includeSummaryStats: true,
    compression: false
  });

  const [dateRange, setDateRange] = useState({
    enabled: false,
    start: '',
    end: ''
  });

  const handleExport = () => {
    const exportOptions: ExportOptions = {
      ...options,
      dateRange: dateRange.enabled ? {
        start: new Date(dateRange.start),
        end: new Date(dateRange.end)
      } : undefined
    };
    
    onExport(exportOptions);
  };

  const updateOption = (key: keyof ExportOptions, value: any) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  const getFormatDescription = (format: string): string => {
    switch (format) {
      case 'json':
        return 'JavaScript Object Notation - structured data format';
      case 'csv':
        return 'Comma Separated Values - spreadsheet compatible';
      case 'pdf':
        return 'Portable Document Format - formatted report';
      default:
        return '';
    }
  };

  const getEstimatedSize = (): string => {
    // Mock estimation based on options
    let baseSize = 50; // KB
    
    if (options.includeRawData) baseSize *= 10;
    if (options.includeSummaryStats) baseSize += 20;
    if (options.format === 'pdf') baseSize *= 2;
    if (options.compression) baseSize *= 0.3;
    
    if (baseSize < 1024) {
      return `~${Math.round(baseSize)} KB`;
    } else {
      return `~${(baseSize / 1024).toFixed(1)} MB`;
    }
  };

  return (
    <div className="export-overlay">
      <div className={`export-dialog ${className || ''}`}>
        <div className="export-header">
          <h3>Export Gait Analysis Data</h3>
          <button className="close-button" onClick={onCancel}>✕</button>
        </div>

        <div className="export-content">
          {/* Format Selection */}
          <div className="export-section">
            <h4>Export Format</h4>
            <div className="format-options">
              {['json', 'csv', 'pdf'].map(format => (
                <label key={format} className="format-option">
                  <input
                    type="radio"
                    name="format"
                    value={format}
                    checked={options.format === format}
                    onChange={(e) => updateOption('format', e.target.value)}
                  />
                  <div className="format-info">
                    <span className="format-name">{format.toUpperCase()}</span>
                    <span className="format-description">
                      {getFormatDescription(format)}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Data Options */}
          <div className="export-section">
            <h4>Data Options</h4>
            <div className="data-options">
              <label className="option-item">
                <input
                  type="checkbox"
                  checked={options.includeRawData}
                  onChange={(e) => updateOption('includeRawData', e.target.checked)}
                />
                <div className="option-info">
                  <span className="option-name">Include Raw Data</span>
                  <span className="option-description">
                    All pose keypoints and frame-by-frame measurements
                  </span>
                </div>
              </label>

              <label className="option-item">
                <input
                  type="checkbox"
                  checked={options.includeSummaryStats}
                  onChange={(e) => updateOption('includeSummaryStats', e.target.checked)}
                />
                <div className="option-info">
                  <span className="option-name">Include Summary Statistics</span>
                  <span className="option-description">
                    Aggregated metrics and analysis summaries
                  </span>
                </div>
              </label>

              <label className="option-item">
                <input
                  type="checkbox"
                  checked={options.compression}
                  onChange={(e) => updateOption('compression', e.target.checked)}
                />
                <div className="option-info">
                  <span className="option-name">Enable Compression</span>
                  <span className="option-description">
                    Reduce file size with ZIP compression
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Date Range */}
          <div className="export-section">
            <h4>Date Range</h4>
            <label className="option-item">
              <input
                type="checkbox"
                checked={dateRange.enabled}
                onChange={(e) => setDateRange(prev => ({ ...prev, enabled: e.target.checked }))}
              />
              <span>Filter by date range</span>
            </label>
            
            {dateRange.enabled && (
              <div className="date-range-inputs">
                <div className="date-input">
                  <label>Start Date:</label>
                  <input
                    type="datetime-local"
                    value={dateRange.start}
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  />
                </div>
                <div className="date-input">
                  <label>End Date:</label>
                  <input
                    type="datetime-local"
                    value={dateRange.end}
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Export Summary */}
          <div className="export-summary">
            <div className="summary-item">
              <span className="summary-label">Format:</span>
              <span className="summary-value">{options.format.toUpperCase()}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Estimated Size:</span>
              <span className="summary-value">{getEstimatedSize()}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Compression:</span>
              <span className="summary-value">{options.compression ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>
        </div>

        <div className="export-footer">
          <button className="cancel-button" onClick={onCancel} data-testid="cancel-button">
            Cancel
          </button>
          <button
            className="export-button"
            onClick={handleExport}
            data-testid="confirm-export-button"
          >
            💾 Export Data
          </button>
        </div>
      </div>
    </div>
  );
};