/// <reference types="cypress" />

// Custom command definitions for Cypress tests

// Mock camera access
Cypress.Commands.add('mockCameraAccess', (options = {}) => {
  cy.window().then((win) => {
    const defaultOptions = {
      width: 1280,
      height: 720,
      frameRate: 30,
      ...options
    };

    const mockStream = {
      getTracks: () => [{
        stop: cy.stub().as('stopTrack'),
        kind: 'video',
        enabled: true,
        getSettings: () => defaultOptions
      }],
      getVideoTracks: () => [{
        stop: cy.stub().as('stopVideoTrack'),
        getSettings: () => defaultOptions
      }]
    };

    cy.stub(win.navigator.mediaDevices, 'getUserMedia')
      .as('getUserMedia')
      .resolves(mockStream);

    cy.stub(win.navigator.mediaDevices, 'enumerateDevices')
      .as('enumerateDevices')
      .resolves([
        {
          deviceId: 'mock-camera-1',
          kind: 'videoinput',
          label: 'Mock Camera 1',
          groupId: 'mock-group-1'
        },
        {
          deviceId: 'mock-camera-2',
          kind: 'videoinput',
          label: 'Mock Camera 2',
          groupId: 'mock-group-2'
        }
      ]);
  });
});

// Mock camera access denial
Cypress.Commands.add('mockCameraAccessDenied', (errorMessage = 'Permission denied') => {
  cy.window().then((win) => {
    const error = new Error(errorMessage);
    error.name = 'NotAllowedError';
    
    cy.stub(win.navigator.mediaDevices, 'getUserMedia')
      .as('getUserMediaDenied')
      .rejects(error);
  });
});

// Mock TensorFlow.js and pose detection
Cypress.Commands.add('mockTensorFlowJS', () => {
  cy.window().then((win) => {
    // Mock TensorFlow.js
    const mockTf = {
      ready: cy.stub().as('tfReady').resolves(),
      dispose: cy.stub().as('tfDispose'),
      backend: cy.stub().as('tfBackend').returns({
        dispose: cy.stub()
      }),
      setBackend: cy.stub().as('tfSetBackend'),
      getBackend: cy.stub().as('tfGetBackend').returns('webgl')
    };

    // Mock pose detection
    const mockPoseDetector = {
      estimatePoses: cy.stub().as('estimatePoses').resolves([
        {
          keypoints: Array.from({ length: 17 }, (_, i) => ({
            x: 100 + i * 10,
            y: 200 + i * 10,
            score: 0.9,
            name: `keypoint_${i}`
          })),
          score: 0.95
        }
      ]),
      dispose: cy.stub().as('poseDetectorDispose')
    };

    const mockPoseDetection = {
      createDetector: cy.stub().as('createDetector').resolves(mockPoseDetector),
      SupportedModels: {
        MoveNet: 'MoveNet',
        PoseNet: 'PoseNet',
        BlazePose: 'BlazePose'
      },
      movenet: {
        modelType: {
          SINGLEPOSE_LIGHTNING: 'SinglePose.Lightning',
          SINGLEPOSE_THUNDER: 'SinglePose.Thunder',
          MULTIPOSE_LIGHTNING: 'MultiPose.Lightning'
        }
      }
    };

    // Attach to window for module loading
    win.tf = mockTf;
    win.poseDetection = mockPoseDetection;
  });
});

// Mock video element with fake video data
Cypress.Commands.add('mockVideoElement', () => {
  cy.window().then((win) => {
    const originalCreateElement = win.document.createElement;
    
    cy.stub(win.document, 'createElement').callsFake((tagName) => {
      if (tagName === 'video') {
        const mockVideo = originalCreateElement.call(win.document, 'video');
        
        // Add mock properties
        Object.defineProperties(mockVideo, {
          videoWidth: { value: 1280, writable: true },
          videoHeight: { value: 720, writable: true },
          currentTime: { value: 0, writable: true },
          duration: { value: 100, writable: true },
          paused: { value: false, writable: true }
        });
        
        // Mock play/pause methods
        mockVideo.play = cy.stub().as('videoPlay').resolves();
        mockVideo.pause = cy.stub().as('videoPause');
        
        // Auto-trigger metadata loaded event
        setTimeout(() => {
          const event = new Event('loadedmetadata');
          mockVideo.dispatchEvent(event);
        }, 100);
        
        return mockVideo;
      }
      return originalCreateElement.call(win.document, tagName);
    });
  });
});

// Mock canvas for rendering
Cypress.Commands.add('mockCanvas', () => {
  cy.window().then((win) => {
    const originalCreateElement = win.document.createElement;
    
    cy.stub(win.document, 'createElement').callsFake((tagName) => {
      if (tagName === 'canvas') {
        const mockCanvas = originalCreateElement.call(win.document, 'canvas');
        
        const mockContext = {
          fillStyle: '#000000',
          strokeStyle: '#000000',
          lineWidth: 1,
          clearRect: cy.stub().as('clearRect'),
          fillRect: cy.stub().as('fillRect'),
          strokeRect: cy.stub().as('strokeRect'),
          beginPath: cy.stub().as('beginPath'),
          moveTo: cy.stub().as('moveTo'),
          lineTo: cy.stub().as('lineTo'),
          closePath: cy.stub().as('closePath'),
          stroke: cy.stub().as('stroke'),
          fill: cy.stub().as('fill'),
          arc: cy.stub().as('arc'),
          drawImage: cy.stub().as('drawImage'),
          getImageData: cy.stub().as('getImageData').returns({
            data: new Uint8ClampedArray(4),
            width: 1,
            height: 1
          }),
          putImageData: cy.stub().as('putImageData')
        };
        
        mockCanvas.getContext = cy.stub().returns(mockContext);
        mockCanvas.toDataURL = cy.stub().returns('data:image/png;base64,mock-data');
        
        return mockCanvas;
      }
      return originalCreateElement.call(win.document, tagName);
    });
  });
});

// Wait for gait analysis to start
// Note: Gait analysis is not implemented in the current app
// This command waits for pose detection metrics instead
Cypress.Commands.add('waitForGaitAnalysis', (timeout = 10000) => {
  cy.get('[data-testid="pose-metrics"]', { timeout }).should('be.visible');
  cy.get('[data-testid="pose-confidence-value"]', { timeout }).should('not.be.empty');
});

// Wait for pose detection to start
Cypress.Commands.add('waitForPoseDetection', (timeout = 10000) => {
  cy.get('[data-testid="skeleton-canvas"]', { timeout }).should('be.visible');
});

// Check performance metrics
Cypress.Commands.add('checkPerformanceMetrics', (expectedFps = 20) => {
  cy.get('[data-testid="performance-monitor"]').should('be.visible');
  cy.get('[data-testid="fps-counter"]').should('be.visible');
  cy.get('[data-testid="fps-value"]').should(($el) => {
    const text = $el.text();
    const fps = parseFloat(text);
    expect(fps).to.be.at.least(expectedFps);
  });
});

// Mock file download
Cypress.Commands.add('mockFileDownload', () => {
  cy.window().then((win) => {
    const mockAnchor = {
      click: cy.stub().as('downloadClick'),
      href: '',
      download: ''
    };
    
    cy.stub(win.document, 'createElement').callsFake((tagName) => {
      if (tagName === 'a') {
        return mockAnchor;
      }
      return win.document.createElement(tagName);
    });
    
    cy.stub(win.URL, 'createObjectURL').as('createObjectURL').returns('mock-blob-url');
    cy.stub(win.URL, 'revokeObjectURL').as('revokeObjectURL');
  });
});

// Simulate gait walking pattern
Cypress.Commands.add('simulateWalkingPattern', (duration = 5000) => {
  cy.window().then((win) => {
    // Override pose estimation to return walking pattern
    if (win.poseDetection && win.poseDetection.createDetector) {
      let frameCount = 0;
      const walkingPattern = (frame) => {
        const leftAnkleX = 100 + Math.sin(frame * 0.1) * 20;
        const rightAnkleX = 120 + Math.sin(frame * 0.1 + Math.PI) * 20;
        
        return [{
          keypoints: Array.from({ length: 17 }, (_, i) => {
            if (i === 15) { // Left ankle
              return {
                x: leftAnkleX,
                y: 200,
                score: 0.9,
                name: 'left_ankle'
              };
            }
            if (i === 16) { // Right ankle
              return {
                x: rightAnkleX,
                y: 200,
                score: 0.9,
                name: 'right_ankle'
              };
            }
            return {
              x: 100 + i * 10,
              y: 200 + i * 10,
              score: 0.9,
              name: `keypoint_${i}`
            };
          }),
          score: 0.95
        }];
      };
      
      win.poseDetection.createDetector.resolves({
        estimatePoses: () => {
          return Promise.resolve(walkingPattern(frameCount++));
        },
        dispose: () => {}
      });
    }
  });
  
  // Wait for the duration
  cy.wait(duration);
});

// Type definitions for custom commands
declare global {
  namespace Cypress {
    interface Chainable {
      mockCameraAccess(options?: any): Chainable<Element>;
      mockCameraAccessDenied(errorMessage?: string): Chainable<Element>;
      mockTensorFlowJS(): Chainable<Element>;
      mockVideoElement(): Chainable<Element>;
      mockCanvas(): Chainable<Element>;
      waitForGaitAnalysis(timeout?: number): Chainable<Element>;
      waitForPoseDetection(timeout?: number): Chainable<Element>;
      checkPerformanceMetrics(expectedFps?: number): Chainable<Element>;
      mockFileDownload(): Chainable<Element>;
      simulateWalkingPattern(duration?: number): Chainable<Element>;
    }
  }
}