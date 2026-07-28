# Cypress Test Coverage Audit

## Summary
- **Total selectors expected by Cypress**: 48 unique data-testid selectors
- **Fully implemented**: 21 selectors (44%)
- **Not implemented**: 27 selectors (56%)

## Detailed Classification

| Expected by Cypress | Actually exists in src/ | Location | Status |
|---------------------|------------------------|----------|---------|
| apply-calibration-button | No | - | NOT_IMPLEMENTED |
| app-title | Yes | src/App.tsx:532 | IMPLEMENTED |
| cadence-value | No | - | NOT_IMPLEMENTED |
| calibration-button | No | - | NOT_IMPLEMENTED |
| calibration-dialog | No | - | NOT_IMPLEMENTED |
| calibration-status | No | - | NOT_IMPLEMENTED |
| camera-select | Yes | src/components/CameraSelector.tsx:110 | IMPLEMENTED |
| camera-selector | Yes | src/components/CameraSelector.tsx:104 | IMPLEMENTED |
| camera-status | Yes | src/App.tsx:617 | IMPLEMENTED |
| confirm-export-button | Yes | src/components/ExportDialog.tsx:218 | IMPLEMENTED |
| desktop-layout | No | - | NOT_IMPLEMENTED |
| error-message | Yes | src/App.tsx:538, src/components/ErrorDisplay.tsx:59 | IMPLEMENTED |
| export-button | Yes | src/components/ControlPanel.tsx:76 | IMPLEMENTED |
| export-dialog | No | - | NOT_IMPLEMENTED |
| export-format-csv | No | - | NOT_IMPLEMENTED |
| export-format-json | No | - | NOT_IMPLEMENTED |
| fps-counter | Yes | src/components/PerformanceMonitor.tsx:109 | IMPLEMENTED |
| gait-confidence | No | - | NOT_IMPLEMENTED |
| gait-confidence-bar | No | - | NOT_IMPLEMENTED |
| gait-detection-app | Yes | src/App.tsx:530 | IMPLEMENTED |
| include-metadata-checkbox | No | - | NOT_IMPLEMENTED |
| memory-usage | Yes | src/components/PerformanceMonitor.tsx:123 | IMPLEMENTED |
| mobile-layout | No | - | NOT_IMPLEMENTED |
| performance-monitor | Yes | src/components/PerformanceMonitor.tsx:70 | IMPLEMENTED |
| person-1-cadence | No | - | NOT_IMPLEMENTED |
| person-1-gait-params | No | - | NOT_IMPLEMENTED |
| person-2-cadence | No | - | NOT_IMPLEMENTED |
| person-2-gait-params | No | - | NOT_IMPLEMENTED |
| person-count | No | - | NOT_IMPLEMENTED |
| pixels-per-meter-input | No | - | NOT_IMPLEMENTED |
| pose-confidence | Yes | src/App.tsx:633 | IMPLEMENTED |
| pose-confidence-value | Yes | src/App.tsx:640 | IMPLEMENTED |
| processing-time | Yes | src/components/PerformanceMonitor.tsx:116 | IMPLEMENTED |
| reset-button | Yes | src/components/ControlPanel.tsx:67 | IMPLEMENTED |
| skeleton-canvas | Yes | src/App.tsx:593 | IMPLEMENTED |
| sr-announcements | No | - | NOT_IMPLEMENTED |
| start-analysis-button | Yes | src/components/ControlPanel.tsx:57 | IMPLEMENTED |
| start-camera-button | Yes | src/components/ControlPanel.tsx:37 | IMPLEMENTED |
| step-width-value | No | - | NOT_IMPLEMENTED |
| stop-camera-button | Yes | src/components/ControlPanel.tsx:47 | IMPLEMENTED |
| stride-length-value | No | - | NOT_IMPLEMENTED |
| stride-time-value | No | - | NOT_IMPLEMENTED |
| symmetry-index-value | No | - | NOT_IMPLEMENTED |
| tablet-layout | No | - | NOT_IMPLEMENTED |
| tracked-person | No | - | NOT_IMPLEMENTED |
| velocity-value | No | - | NOT_IMPLEMENTED |
| video-container | Yes | src/App.tsx:574 | IMPLEMENTED |
| video-element | Yes | src/App.tsx:582 | IMPLEMENTED |

## Additional Context

### Features in src/ not tested by Cypress
The following data-testid selectors exist in the source code but are **not expected by Cypress tests**:
- fps-value (src/components/PerformanceMonitor.tsx)
- health-bar, health-indicator, health-status (src/components/PerformanceMonitor.tsx)
- metrics-summary (src/components/PerformanceMonitor.tsx)
- model-inference-time (src/components/PerformanceMonitor.tsx)
- overlay-toggle-container, show-overlays-checkbox (src/App.tsx)
- performance-details, performance-details-toggle (src/components/PerformanceMonitor.tsx)
- performance-warning (src/components/PerformanceMonitor.tsx)
- pose-metrics (src/App.tsx)
- processing-latency (src/components/PerformanceMonitor.tsx)
- rendering-time (src/components/PerformanceMonitor.tsx)

### Gait Parameter Display Notes
The following gait parameters have backend logic (src/services/GaitAnalysisService.ts) and display components (src/components/GaitParameterDisplay.tsx) but **lack data-testid bindings**:
- velocity, strideLength, stepLength, stepWidth, strideTime, cadence
- symmetryIndex, variabilityIndex

These components exist and may display values, but Cypress cannot target them without proper test IDs.

## Recommendations

### 1. IMPLEMENTED Features (No Action Needed)
All 21 implemented features have correct data-testid bindings and are ready for testing.

### 2. NOT_IMPLEMENTED Features to Skip in Cypress
The following features should be skipped or commented out in Cypress tests until implemented:

**Calibration UI (6 selectors):**
- apply-calibration-button
- calibration-button
- calibration-dialog
- calibration-status
- cadence-value
- pixels-per-meter-input

**Multi-person Tracking (5 selectors):**
- person-1-cadence, person-1-gait-params
- person-2-cadence, person-2-gait-params
- person-count
- tracked-person

**Gait Metric Value Displays (6 selectors):**
- gait-confidence, gait-confidence-bar
- step-width-value
- stride-length-value
- stride-time-value
- symmetry-index-value
- velocity-value

**Export Dialog Features (4 selectors):**
- export-dialog
- export-format-csv
- export-format-json
- include-metadata-checkbox

**Responsive Layout (3 selectors):**
- desktop-layout
- mobile-layout
- tablet-layout

**Accessibility (1 selector):**
- sr-announcements

### 3. Add Test Coverage for Existing Untested Features
Consider adding Cypress tests for the existing features that currently have no test coverage:
- Health status indicators
- Performance details toggle
- Overlay controls
- Additional performance metrics (model-inference-time, processing-latency, rendering-time)

### 4. Add data-testid Bindings for Gait Parameters
The GaitParameterDisplay component (src/components/GaitParameterDisplay.tsx) displays gait metrics but lacks proper test IDs for automated testing. Consider adding data-testid attributes to:
- Individual metric value displays
- Gait parameter cards/sections
