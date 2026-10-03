# Pose Detection

A real-time webcam-based human pose detection and motion tracking system built with React, TypeScript, and TensorFlow.js.

🎮 **[Live Demo](https://gait.jedarden.com)** - Try it out in your browser!

## 🎯 Features

- **Real-time Pose Detection**: Uses TensorFlow.js with MoveNet for accurate pose estimation
- **Motion Tracking**: Comprehensive movement analysis including joint positions, velocity, and acceleration
- **Gait Analysis**: Specialized algorithms for walking pattern detection and analysis
- **Visual Feedback**: Live skeleton overlay and motion visualization
- **Performance Optimized**: Runs at 60+ FPS on modern hardware
- **Docker Support**: Containerized deployment with runtime path configuration
- **PWA Ready**: Installable as a Progressive Web App

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Webcam access
- Modern browser with WebGL support

### Installation

```bash
# Clone the repository
git clone https://github.com/jedarden/pose-detection.git
cd pose-detection

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit http://localhost:5173 to see the application.

### Docker Deployment

```bash
# Build the container
docker build -t pose-detection .

# Run with default settings (root path); the container listens on 8080
docker run -p 8080:8080 pose-detection

# Run with custom base path (runtime setting, same image)
docker run -p 8080:8080 -e BASE_PATH=/pose pose-detection
```

## 🏗️ Architecture

- **Frontend**: React 18 with TypeScript
- **Pose Detection**: TensorFlow.js with MoveNet
- **State Management**: React hooks and context
- **Styling**: CSS modules with responsive design
- **Build Tool**: Vite for fast development
- **Testing**: Vitest for unit tests, Cypress for E2E

## 📦 Key Components

- **PoseDetector**: Core pose detection engine
- **MotionTracker**: Movement analysis and tracking
- **GaitAnalyzer**: Walking pattern detection
- **VisualOverlay**: Real-time skeleton rendering
- **MetricsDisplay**: Performance and accuracy metrics

## 🔧 Configuration

### Environment Variables

- `BASE_PATH`: URL base path for deployment (default: `/`)

There is no backend API endpoint variable. The application is fully
client-side: webcam capture, pose detection (TensorFlow.js), motion tracking,
and rendering all run in the browser, and the app does not call an application
backend. Nothing in the build reads `VITE_API_URL`.

### Runtime Configuration

The application supports runtime path configuration for flexible deployment:

```javascript
// BASE_PATH is injected by the container at startup. The fallback supports
// local development, where no runtime injection is present.
const basePath = window.__BASE_PATH__ || '/';
```

`BASE_PATH` is a runtime setting only. There is no build-time path setting, and
`PUBLIC_URL` is not used. `BASE_PATH` is the configured deployment prefix, not a
value inferred from the current URL. Use `/` for the root deployment, `/pose` for a single-segment
deployment, or `/apps/pose-detector` for a nested deployment. The same built
image supports all three shapes at runtime.

## 📊 Performance

- Targets 60 FPS for smooth motion tracking
- Optimized pose detection pipeline
- WebGL acceleration for TensorFlow.js
- Efficient canvas rendering

### Browser performance benchmark

```bash
npm run bench:browser
```

Builds the production bundle, serves it, starts analysis with a fake camera in
headless Chromium, and reports render FPS, detection FPS, dropped frames and
detection latency as JSON. Render FPS and detection FPS must both reach
`BENCH_MIN_FPS` (default `60`, the target above) or the run exits `1`. Exit `2`
means the run could not complete (for example, no browser), so no verdict was
produced.

Environment variables:

- `BENCH_CHROME`: Chromium executable. Defaults to Playwright's cached build;
  set this when that build cannot start on the host.
- `BENCH_URL`: measure an already-running app instead of building one.
- `BENCH_MIN_FPS`, `BENCH_WARMUP_MS`, `BENCH_DURATION_MS`, `BENCH_PORT`: see
  `scripts/browser-benchmark.mjs`.

Results depend heavily on hardware. Headless Chromium without a GPU uses
software WebGL, so numbers from such a host are not representative of users'
machines. The benchmark is not part of the default verification gate.

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e

# Test the production container at root, single-segment, and nested paths
npm run test:deployment
```

## 🚢 Deployment

### Kubernetes

See `k8s-example.yaml` for a complete deployment example with:
- Deployment with health checks
- Service configuration
- Ingress with path-based routing
- TLS certificate management

### Docker Compose

```yaml
version: '3.8'
services:
  pose-detection:
    image: pose-detection:latest
    ports:
      - "8080:8080"
    environment:
      - BASE_PATH=/pose
```

## 📄 License

MIT License - see LICENSE file for details

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to our repository.

## 📞 Support

- Create an issue on GitHub
- Check the documentation in `/docs`
- View deployment guide in `DEPLOYMENT.md`

## 🤖 AI-Generated Code

This project was created using AI assistance. Below are the prompts that were used to generate this codebase:

### First Prompt

> Create a new folder in research/pose-detection conduct deep research into creating a webpage that can use a computer's webcam to analyze and detect a human in the video and to overlay pose detection of the user's body. Source the data from from academic papers, github repos, blogs, and youtube transcripts (source using youtube-transcript-retrieval library). Create up to 8 agents using the available MCP servers to conduct the research. Put all file into research/pose-detection.

### Second Prompt

> Based on the research in research/pose-detection create a docker image in containers/pose-detection. The application should be a single docker image which exposes a single port. It will create a web experience that uses the user's webcam to detect the presence of a person and to draw an overlay showing the person's pose and orientation. Use up to 8 agents to build this application concurrently. Follow test driven development principles and keep iterating until the application is complete. If stuck conduct deep web searches to resolve the problem. All created files should go in containers/pose-detection

---

Built with ❤️ using React, TypeScript, and TensorFlow.js

---

Part of [jedarden.com](https://jedarden.com) · Read the write-up: [jedarden.com/projects/gait/](https://jedarden.com/projects/gait/)

*This GitHub repo is a read-only mirror of git.ardenone.com/jedarden/pose-detection — issues and PRs are welcome here either way.*
