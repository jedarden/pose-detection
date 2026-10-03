# Gait Detection Application Testing Suite

This directory contains comprehensive tests for the webcam-based gait detection application. The test suite is designed to achieve >90% code coverage while testing all critical paths and edge cases.

## Test Structure

```
tests/
├── unit/                    # Unit tests for individual components
│   ├── services/           # Service layer tests
│   ├── components/         # React component tests
│   └── utils/             # Utility function tests
├── integration/            # Integration tests
│   ├── GaitDetectionPipeline.test.ts
│   └── MultiServiceIntegration.test.ts
├── performance/            # Performance benchmarks
│   ├── PerformanceBenchmarks.test.ts
│   └── LoadTesting.test.ts
├── utils/                  # Test utilities
│   ├── TestDataFactory.ts
│   └── MockHelpers.ts
└── README.md              # This file
```

## Test Categories

### 1. Unit Tests (`tests/unit/`)

Test individual components and services in isolation.

**Coverage Areas:**
- CameraService: Camera access, device enumeration, stream management
- PoseDetectionService: TensorFlow.js integration, pose estimation
- GaitAnalysisService: Biomechanics calculations, parameter extraction
- PersonTrackingService: Multi-person detection and tracking
- PerformanceMonitorService: Performance metrics and monitoring
- React Components: User interface components and hooks

**Key Features:**
- Comprehensive mocking of external dependencies
- Edge case testing (network errors, device failures)
- Input validation and error handling
- Memory leak detection
- Performance regression prevention

### 2. Integration Tests (`tests/integration/`)

Test component interactions and full pipeline workflows.

**Coverage Areas:**
- Full gait detection pipeline (camera → pose → analysis)
- Service orchestration and data flow
- Real-time processing coordination
- Error recovery and resilience
- Multi-person tracking integration
- Performance monitoring integration

**Key Features:**
- End-to-end workflow testing
- Service interaction validation
- Data integrity verification
- Performance under load
- Error propagation and recovery

### 3. Performance Tests (`tests/performance/`)

Benchmark performance and validate optimization strategies.

**Coverage Areas:**
- Frame rate maintenance (target: >25 FPS)
- Memory usage optimization
- CPU utilization monitoring
- Model inference speed
- Adaptive quality adjustments
- Stress testing under extreme conditions

**Key Features:**
- Performance regression detection
- Benchmark comparisons
- Memory leak detection
- Optimization validation
- Real-world scenario simulation

### 4. End-to-End Tests (`cypress/e2e/`)

Test complete user workflows in a real browser environment.

**Coverage Areas:**
- User interface interactions
- Camera access and permissions
- Real-time gait analysis
- Data export functionality
- Error handling and recovery
- Multi-device compatibility
- Accessibility compliance

## Running Tests

### Quick Start

```bash
# Run all tests
npm run test:all

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:performance
npm run test:e2e

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### Advanced Test Runner

Use the comprehensive test runner script:

```bash
# Run all tests with coverage and report
./scripts/test-runner.sh --all --coverage --report

# Run only unit tests
./scripts/test-runner.sh --unit-only

# Run performance tests only
./scripts/test-runner.sh --performance-only

# Run with E2E tests (requires app to be running)
./scripts/test-runner.sh --e2e
```

### Test Runner Options

- `--unit-only`: Run only unit tests
- `--integration-only`: Run only integration tests
- `--performance-only`: Run only performance tests
- `--e2e`: Include E2E tests
- `--all`: Run all tests including E2E
- `--coverage`: Generate coverage report
- `--report`: Generate HTML test report
- `--help`: Show help message

## Test Configuration

### Vitest Configuration (`vitest.config.ts`)

```typescript
// Key configuration options
{
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      thresholds: {
        global: {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90
        }
      }
    }
  }
}
```

### Cypress Configuration (`cypress.config.ts`)

```typescript
// E2E test configuration
{
  e2e: {
    baseUrl: 'http://localhost:3000',
    viewportWidth: 1280,
    viewportHeight: 720,
    defaultCommandTimeout: 10000
  }
}
```

## Test Data and Mocking

### Test Data Factory (`tests/utils/TestDataFactory.ts`)

Provides realistic test data for various scenarios:

```typescript
// Create walking sequence
const walkingData = TestDataFactory.createWalkingSequence(60);

// Create pathological gait patterns
const limpingGait = TestDataFactory.createPathologicalGait('limping');

// Create performance metrics
const metrics = TestDataFactory.createPerformanceMetrics('optimal');
```

### Mock Setup (`src/test/setup.ts`)

Comprehensive mocking of:
- TensorFlow.js and pose detection models
- MediaDevices API (camera access)
- Canvas and WebGL contexts
- Performance monitoring APIs
- File system operations

## Coverage Requirements

### Minimum Coverage Thresholds

- **Lines**: 90%
- **Functions**: 90%
- **Branches**: 90%
- **Statements**: 90%

### Critical Path Coverage

- Camera initialization and error handling: 100%
- Pose detection pipeline: 95%
- Gait analysis calculations: 95%
- Performance monitoring: 90%
- User interface interactions: 90%

## Performance Benchmarks

### Target Performance Metrics

- **Frame Rate**: >25 FPS (Lightning), >15 FPS (Thunder)
- **Processing Time**: <33ms per frame
- **Memory Usage**: <100MB steady state
- **Startup Time**: <3 seconds
- **Model Loading**: <5 seconds

### Performance Tests

```typescript
// Example performance test
it('should maintain >25 FPS with lightning model', async () => {
  const fps = await benchmarkFrameRate('lightning', 100);
  expect(fps).toBeGreaterThan(25);
});
```

## Test Development Guidelines

### Writing Unit Tests

1. **Test in isolation**: Mock all external dependencies
2. **Test edge cases**: Handle errors, edge inputs, boundary conditions
3. **Test behavior**: Focus on what the code should do, not how
4. **Use descriptive names**: Test names should explain the scenario
5. **Follow AAA pattern**: Arrange, Act, Assert

```typescript
// Example unit test
describe('GaitAnalysisService', () => {
  it('should calculate cadence from heel strike events', () => {
    // Arrange
    const service = new GaitAnalysisService();
    const mockPoses = createHeelStrikeSequence();
    
    // Act
    mockPoses.forEach(pose => service.addPose(pose, Date.now()));
    const parameters = service.calculateGaitParameters();
    
    // Assert
    expect(parameters.cadence).toBeGreaterThan(0);
    expect(parameters.cadence).toBeLessThan(200);
  });
});
```

### Writing Integration Tests

1. **Test workflows**: Focus on component interactions
2. **Test data flow**: Verify data passes correctly between services
3. **Test error propagation**: Ensure errors are handled properly
4. **Test performance**: Verify acceptable performance under load

### Writing Performance Tests

1. **Set clear benchmarks**: Define specific performance targets
2. **Test realistic scenarios**: Use real-world data and conditions
3. **Measure consistently**: Use stable test environments
4. **Test edge cases**: High load, low resources, network issues

## Common Test Patterns

### Service Testing Pattern

```typescript
describe('ServiceName', () => {
  let service: ServiceName;
  
  beforeEach(() => {
    service = new ServiceName();
  });
  
  afterEach(() => {
    service.dispose();
  });
  
  describe('method', () => {
    it('should handle normal case', () => {
      // Test implementation
    });
    
    it('should handle error case', () => {
      // Test error handling
    });
  });
});
```

### Component Testing Pattern

```typescript
describe('ComponentName', () => {
  it('should render correctly', () => {
    render(<ComponentName />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
  
  it('should handle user interactions', async () => {
    render(<ComponentName />);
    await user.click(screen.getByRole('button'));
    expect(mockCallback).toHaveBeenCalled();
  });
});
```

## Debugging Tests

### Common Issues

1. **Async timing issues**: Use `waitFor` and proper async/await
2. **Mock cleanup**: Ensure mocks are reset between tests
3. **Memory leaks**: Dispose of services and clear timers
4. **Performance variance**: Use stable test environments

### Debugging Tools

```typescript
// Debug test output
console.log('Test state:', service.getState());

// Debug performance
const startTime = performance.now();
// ... test code
console.log('Execution time:', performance.now() - startTime);

// Debug DOM state
screen.debug();
```

## Continuous Integration

### Argo Workflows integration

Production CI runs in Argo Workflows on `iad-ci`; see
[`docs/CI-CD.md`](../docs/CI-CD.md) for the trigger and release gate. The
following is a generic example for the repository's production gate:

```yaml
- name: Run production release gate
  run: |
    npm ci
    npm run lint
    npm run build
    npm run test:deployment
```

The command names above are the scripts currently defined by this repository;
the Argo `website-build` workflow uses the lint/build portion of this gate.

### Pre-commit Hooks

```json
{
  "pre-commit": [
    "npm run lint",
    "npm run type-check",
    "npm run test:unit"
  ]
}
```

## Maintenance

### Regular Tasks

- Update test data for new features
- Maintain performance benchmarks
- Update mocks for API changes
- Review coverage reports
- Update documentation

### Performance Monitoring

- Track test execution times
- Monitor memory usage during tests
- Identify slow tests and optimize
- Update performance thresholds

## Contributing

When adding new features:

1. Write tests first (TDD approach)
2. Ensure >90% coverage for new code
3. Add performance benchmarks if applicable
4. Update integration tests for new workflows
5. Add E2E tests for user-facing features

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Cypress Documentation](https://docs.cypress.io/)
- [Testing Library](https://testing-library.com/)
- [TensorFlow.js Testing](https://www.tensorflow.org/js/guide/testing)
- [React Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

---

*This test suite ensures the gait detection application maintains high quality, performance, and reliability across all features and use cases.*
