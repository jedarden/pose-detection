import './commands';

// Cypress E2E support file
// This file is processed and loaded automatically before test files.

// Global configuration
Cypress.config('defaultCommandTimeout', 10000);
Cypress.config('requestTimeout', 10000);
Cypress.config('responseTimeout', 10000);

// Custom error handling
Cypress.on('uncaught:exception', (err, runnable) => {
  // Prevent Cypress from failing the test on uncaught exceptions
  // that are expected in the application (e.g., TensorFlow.js warnings)
  if (err.message.includes('TensorFlow.js')) {
    return false;
  }
  if (err.message.includes('WebGL')) {
    return false;
  }
  if (err.message.includes('MediaDevices')) {
    return false;
  }
  // Return true to fail the test for unexpected errors
  return true;
});

// Global test setup
beforeEach(() => {
  cy.on('window:before:load', (win) => {
    // Keep service frame capture active while avoiding an unbounded visual
    // animation loop in headless Electron between assertions.
    win.requestAnimationFrame = () => 0;
    win.cancelAnimationFrame = () => undefined;
  });

  // Mock performance.now() for consistent timestamps
  cy.window().then((win) => {
    let startTime = Date.now();
    Cypress.sinon.stub(win.performance, 'now').callsFake(() => {
      return Date.now() - startTime;
    });
  });

});
