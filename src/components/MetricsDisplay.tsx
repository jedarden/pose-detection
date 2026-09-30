import { GaitParameters } from '../services/GaitAnalysisService';

export interface MotionMetrics {
  detectionConfidence: number;
  keypointCount: number;
  visibleKeypoints: number;
  trackingQuality: number;
  movementIntensity: number;
  poseDuration: number;
  averageKeypointConfidence: number;
}

interface MetricsDisplayProps {
  gaitParameters: GaitParameters;
  motionMetrics: MotionMetrics;
}

const formatNumber = (value: number, digits: number): string =>
  Number.isFinite(value) ? value.toFixed(digits) : '0.00';

const MetricCard = ({
  label,
  value,
  testId,
  cardTestId
}: {
  label: string;
  value: string;
  testId: string;
  cardTestId?: string;
}) => (
  <div className="metric-card" style={{
    backgroundColor: 'white',
    padding: '15px',
    borderRadius: '4px',
    border: '1px solid #ddd'
  }} data-testid={cardTestId}>
    <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>{label}</h4>
    <p style={{ margin: '0', fontSize: '18px', fontWeight: 'bold' }} data-testid={testId}>
      {value}
    </p>
  </div>
);

/**
 * Displays the values produced by the live gait and pose analysis pipeline.
 * Keeping this component presentational makes updates from coordinator
 * events immediately visible without introducing a second analysis source.
 */
export function MetricsDisplay({ gaitParameters, motionMetrics }: MetricsDisplayProps) {
  return (
    <section className="metrics-display gait-parameters" data-testid="gait-parameters" style={{
      marginTop: '20px',
      padding: '20px',
      backgroundColor: '#f0f8ff',
      borderRadius: '8px'
    }}>
      <div data-testid="metrics-display">
        <h3 style={{ margin: '0 0 15px 0' }}>Real-time Gait and Motion Metrics</h3>

      <div className="gait-metrics" data-testid="gait-metrics" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '15px'
      }}>
        <MetricCard
          label="Cadence"
          value={`${formatNumber(gaitParameters.cadence, 1)} steps/min`}
          testId="gait-cadence-value"
          cardTestId="gait-cadence"
        />
        <MetricCard
          label="Stride Length"
          value={`${formatNumber(gaitParameters.strideLength, 2)} m`}
          testId="gait-stride-length-value"
          cardTestId="gait-stride-length"
        />
        <MetricCard
          label="Velocity"
          value={`${formatNumber(gaitParameters.velocity, 2)} m/s`}
          testId="gait-velocity-value"
          cardTestId="gait-velocity"
        />
        <MetricCard
          label="Symmetry Index"
          value={`${formatNumber(gaitParameters.symmetryIndex, 1)}%`}
          testId="gait-symmetry-value"
          cardTestId="gait-symmetry"
        />
        <MetricCard
          label="Left Phase"
          value={gaitParameters.gaitPhase.left}
          testId="gait-phase-left-value"
          cardTestId="gait-phase-left"
        />
        <MetricCard
          label="Right Phase"
          value={gaitParameters.gaitPhase.right}
          testId="gait-phase-right-value"
          cardTestId="gait-phase-right"
        />
        <MetricCard
          label="Analysis Confidence"
          value={`${formatNumber(gaitParameters.confidence * 100, 1)}%`}
          testId="pose-confidence-value"
          cardTestId="pose-confidence"
        />
      </div>

        <h3 style={{ margin: '25px 0 15px 0' }}>Motion Tracking</h3>
        <div className="motion-metrics" data-testid="motion-metrics" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '15px'
      }}>
        <MetricCard
          label="Detection Confidence"
          value={`${formatNumber(motionMetrics.detectionConfidence * 100, 1)}%`}
          testId="motion-detection-confidence-value"
        />
        <MetricCard
          label="Visible Keypoints"
          value={`${motionMetrics.visibleKeypoints}/${motionMetrics.keypointCount}`}
          testId="motion-visible-keypoints-value"
        />
        <MetricCard
          label="Tracking Quality"
          value={`${formatNumber(motionMetrics.trackingQuality * 100, 1)}%`}
          testId="motion-tracking-quality-value"
        />
        <MetricCard
          label="Movement Intensity"
          value={`${formatNumber(motionMetrics.movementIntensity * 100, 1)}%`}
          testId="motion-intensity-value"
        />
        <MetricCard
          label="Pose Duration"
          value={`${formatNumber(motionMetrics.poseDuration, 2)} s`}
          testId="motion-pose-duration-value"
        />
        <MetricCard
          label="Average Keypoint Confidence"
          value={`${formatNumber(motionMetrics.averageKeypointConfidence * 100, 1)}%`}
          testId="motion-average-confidence-value"
        />
        </div>
      </div>
    </section>
  );
}

export default MetricsDisplay;
