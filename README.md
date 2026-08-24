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

# Run with default settings (root path)
docker run -p 8080:80 pose-detection

# Run with custom base path
docker run -p 8080:80 -e BASE_PATH=/pose pose-detection
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
- `VITE_API_URL`: Backend API endpoint (optional)

### Runtime Configuration

The application supports runtime path configuration for flexible deployment:

```javascript
// Automatically detects and configures base path
const basePath = window.location.pathname.match(/^\/[^\/]+/)?.[0] || '/';
```

## 📊 Performance

- Targets 60 FPS for smooth motion tracking
- Optimized pose detection pipeline
- WebGL acceleration for TensorFlow.js
- Efficient canvas rendering

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e
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
      - "8080:80"
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
