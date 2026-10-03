# Human Pose Detection and Motion Tracking - Deployment Guide

> **Production path:** This is a legacy generic Docker/Kubernetes reference.
> The live site is released by Argo Workflows to Cloudflare Pages. Read
> [`docs/CI-CD.md`](docs/CI-CD.md) for the canonical repository, webhook,
> release, and verification workflow. Do not use the manual `kubectl apply`,
> `patch`, `scale`, or `rollout restart` examples below for the production
> site.

This guide provides detailed instructions for deploying the Human Pose Detection and Motion Tracking Application in various environments, from development to production.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Overview](#environment-overview)
- [Development Deployment](#development-deployment)
- [Staging Deployment](#staging-deployment)
- [Production Deployment](#production-deployment)
- [Monitoring and Maintenance](#monitoring-and-maintenance)
- [Troubleshooting](#troubleshooting)
- [Security Considerations](#security-considerations)

## 🔧 Prerequisites

### Software Requirements

- **Docker**: Version 20.10+ with BuildKit support
- **Docker Compose**: Version 2.0+
- **Kubernetes**: Version 1.24+ (for container orchestration)
- **kubectl**: Configured to access your cluster
- **Node.js**: Version 18+ (for local development)
- **Helm**: Version 3.0+ (optional, for Helm deployments)

### System Requirements

#### Development Environment
- **CPU**: 2+ cores
- **Memory**: 4GB+ RAM
- **Storage**: 10GB+ available space
- **Network**: Stable internet connection

#### Production Environment
- **CPU**: 4+ cores per instance
- **Memory**: 8GB+ RAM per instance
- **Storage**: 50GB+ available space
- **Network**: High-bandwidth, low-latency connection

### Browser Requirements

- **Chrome**: Version 88+
- **Firefox**: Version 85+
- **Safari**: Version 14+
- **Edge**: Version 88+
- **WebGL 2.0**: Required for GPU acceleration
- **HTTPS**: Required for camera access

## 🌍 Environment Overview

### Development Environment

**Purpose**: Local development and testing
**Infrastructure**: Docker Compose
**Characteristics**:
- Single replica
- Minimal resource allocation
- Hot reloading enabled
- Debug logging active
- Local storage only

### Staging Environment

**Purpose**: Pre-production testing and validation
**Infrastructure**: Kubernetes cluster
**Characteristics**:
- 2 replicas for high availability
- Moderate resource allocation
- Production-like configuration
- Comprehensive monitoring
- Persistent storage

### Production Environment

**Purpose**: End-user facing deployment
**Infrastructure**: Kubernetes cluster with auto-scaling
**Characteristics**:
- 3+ replicas with auto-scaling
- Production resource allocation
- Full monitoring and alerting
- Backup and disaster recovery
- High availability and performance

## 🏗️ Development Deployment

### Local Development Setup

#### 1. Quick Start with Docker Compose

```bash
# Clone the repository
git clone https://github.com/your-org/pose-detection-motion-tracking-app.git
cd pose-detection-motion-tracking-app

# Start development environment
docker-compose up --build

# Application will be available at http://localhost:3000
```

#### 2. Manual Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

#### 3. Environment Configuration

Create `.env.development`:

```env
NODE_ENV=development
REACT_APP_API_URL=http://localhost:3001
REACT_APP_WS_URL=ws://localhost:3001
CHOKIDAR_USEPOLLING=true
FAST_REFRESH=true
```

### Development Services

The development environment includes:

- **Main Application**: React development server
- **Redis**: For caching and session management
- **WebSocket Server**: For real-time features (optional)
- **MongoDB**: For data storage (optional)

### Development Commands

```bash
# Start all services
docker-compose up

# Start specific services
docker-compose up pose-detection-motion-tracking redis

# Run with specific profiles
docker-compose --profile websocket up

# View logs
docker-compose logs -f pose-detection-motion-tracking

# Stop services
docker-compose down

# Clean up
docker-compose down -v --remove-orphans
```

## 🧪 Staging Deployment

### Staging Environment Setup

#### 1. Prepare Staging Configuration

```bash
# Create staging namespace
kubectl create namespace staging

# Apply staging configuration
kubectl apply -f k8s/configmap.yaml -n staging
kubectl apply -f k8s/deployment.yaml -n staging
kubectl apply -f k8s/monitoring.yaml -n staging
```

#### 2. Deploy Using Scripts

```bash
# Deploy to staging
./scripts/deploy.sh --environment staging --namespace staging

# Deploy specific version
./scripts/deploy.sh --environment staging --tag v1.0.0-rc.1
```

#### 3. Staging Configuration

Environment-specific settings for staging:

```yaml
# k8s/configmap-staging.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: pose-detection-motion-tracking-config
  namespace: staging
data:
  app.config.json: |
    {
      "environment": "staging",
      "replicas": 2,
      "resources": {
        "requests": {
          "cpu": "200m",
          "memory": "256Mi"
        },
        "limits": {
          "cpu": "400m",
          "memory": "512Mi"
        }
      },
      "features": {
        "debug_mode": true,
        "performance_monitoring": true,
        "error_tracking": true
      }
    }
```

### Staging Verification

#### 1. Health Checks

```bash
# Check deployment status
kubectl get deployment pose-detection-motion-tracking-app -n staging

# Check pod status
kubectl get pods -n staging -l app=pose-detection-motion-tracking

# Check service
kubectl get service pose-detection-motion-tracking-service -n staging
```

#### 2. Functional Tests

```bash
# Port forward for testing
kubectl port-forward service/pose-detection-motion-tracking-service 8080:80 -n staging

# Run health check
curl http://localhost:8080/health

# Test application
curl http://localhost:8080/

# Test models
curl http://localhost:8080/models/
```

#### 3. Performance Tests

```bash
# Run load tests
npm run test:load:staging

# Monitor performance
kubectl top pods -n staging
```

## 🚀 Production Deployment

### Production Environment Setup

#### 1. Infrastructure Prerequisites

**Kubernetes Cluster Requirements**:
- **Nodes**: 3+ worker nodes
- **CPU**: 8+ cores total
- **Memory**: 16GB+ total
- **Storage**: 100GB+ available
- **Network**: Load balancer support

**Additional Components**:
- **Ingress Controller**: Nginx or similar
- **Certificate Manager**: cert-manager for TLS
- **Monitoring**: Prometheus and Grafana
- **Logging**: ELK stack or similar

#### 2. Production Configuration

```yaml
# k8s/configmap-production.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: pose-detection-motion-tracking-config
  namespace: production
data:
  app.config.json: |
    {
      "environment": "production",
      "replicas": 3,
      "resources": {
        "requests": {
          "cpu": "250m",
          "memory": "256Mi"
        },
        "limits": {
          "cpu": "500m",
          "memory": "512Mi"
        }
      },
      "features": {
        "debug_mode": false,
        "performance_monitoring": true,
        "error_tracking": true,
        "analytics": true
      },
      "security": {
        "https_only": true,
        "csp_enabled": true,
        "rate_limiting": true
      }
    }
```

#### 3. Production Deployment

```bash
# Create production namespace
kubectl create namespace production

# Deploy to production
./scripts/deploy.sh --environment production --namespace production

# Deploy with specific image
./scripts/deploy.sh --environment production --tag v1.0.0 --registry myregistry.com/
```

### Production Security

#### 1. TLS Configuration

```yaml
# k8s/ingress-production.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: pose-detection-motion-tracking-ingress
  namespace: production
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  tls:
  - hosts:
    - pose-detection.yourdomain.com
    secretName: pose-detection-motion-tracking-tls
  rules:
  - host: pose-detection.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: pose-detection-motion-tracking-service
            port:
              number: 80
```

#### 2. Security Policies

```yaml
# k8s/security-policies.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: pose-detection-motion-tracking-network-policy
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: pose-detection-motion-tracking
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 80
  egress:
  - to: []
    ports:
    - protocol: TCP
      port: 53
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 443
```

### Auto-scaling Configuration

```yaml
# k8s/hpa-production.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: pose-detection-motion-tracking-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: pose-detection-motion-tracking-app
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

## 📊 Monitoring and Maintenance

### Monitoring Setup

#### 1. Prometheus Configuration

```yaml
# k8s/prometheus-rules.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: pose-detection-motion-tracking-alerts
  namespace: production
spec:
  groups:
  - name: pose-detection-motion-tracking.rules
    rules:
    - alert: PoseDetectionHighCPU
      expr: rate(container_cpu_usage_seconds_total{pod=~"pose-detection-motion-tracking-app-.*"}[5m]) > 0.8
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High CPU usage in Pose Detection pod"
        description: "Pod {{ $labels.pod }} has high CPU usage: {{ $value }}"
    
    - alert: PoseDetectionPodDown
      expr: up{job="pose-detection-motion-tracking-service"} == 0
      for: 1m
      labels:
        severity: critical
      annotations:
        summary: "Pose Detection pod is down"
        description: "Pose Detection pod has been down for more than 1 minute"
```

#### 2. Grafana Dashboard

The application includes a pre-configured Grafana dashboard for monitoring:

- **Performance Metrics**: CPU, memory, response time
- **Application Metrics**: Frame rate, accuracy, errors
- **Infrastructure Metrics**: Pod status, resource usage
- **Business Metrics**: User sessions, feature usage

### Maintenance Procedures

#### 1. Regular Updates

```bash
# Update application
./scripts/deploy.sh --environment production --tag v1.1.0

# Update dependencies
npm update
npm audit fix

# Update Docker base image
docker build --pull -t pose-detection-motion-tracking:latest .
```

#### 2. Backup Procedures

```bash
# Backup configuration
kubectl get configmap pose-detection-motion-tracking-config -n production -o yaml > backup-config.yaml

# Backup persistent data (if applicable)
kubectl exec deployment/pose-detection-motion-tracking-app -n production -- /backup-script.sh
```

#### 3. Scaling Operations

```bash
# Manual scaling
kubectl scale deployment pose-detection-motion-tracking-app --replicas=5 -n production

# Check auto-scaling status
kubectl get hpa -n production

# Update auto-scaling configuration
kubectl apply -f k8s/hpa-production.yaml
```

## 🔍 Troubleshooting

### Common Issues and Solutions

#### 1. Pod Startup Issues

**Problem**: Pods failing to start
**Symptoms**: 
- Pods in `CrashLoopBackOff` state
- Health checks failing
- High startup time

**Solutions**:
```bash
# Check pod logs
kubectl logs -l app=pose-detection-motion-tracking -n production

# Check events
kubectl get events --sort-by=.metadata.creationTimestamp -n production

# Check resource constraints
kubectl describe pods -l app=pose-detection-motion-tracking -n production

# Check image pull issues
kubectl get pods -l app=pose-detection-motion-tracking -n production -o wide
```

#### 2. Performance Issues

**Problem**: Slow response times or low frame rates
**Symptoms**:
- High response times (>2s)
- Low frame rates (<20 FPS)
- High CPU/memory usage

**Solutions**:
```bash
# Check resource usage
kubectl top pods -n production

# Check HPA status
kubectl get hpa -n production

# Scale manually if needed
kubectl scale deployment pose-detection-motion-tracking-app --replicas=6 -n production

# Check application logs for performance warnings
kubectl logs -l app=pose-detection-motion-tracking -n production | grep -i performance
```

#### 3. Camera Access Issues

**Problem**: Camera not accessible in browser
**Symptoms**:
- Permission denied errors
- No camera devices found
- WebRTC connection failures

**Solutions**:
1. **Verify HTTPS**: Camera access requires HTTPS
2. **Check permissions**: Browser camera permissions
3. **Verify device**: Camera device availability
4. **Check CSP**: Content Security Policy settings

#### 4. Model Loading Issues

**Problem**: AI models not loading properly
**Symptoms**:
- Long loading times
- Model inference errors
- Fallback to CPU mode

**Solutions**:
```bash
# Check model file accessibility
curl -I https://yourdomain.com/models/movenet_lightning_model.json

# Check network policy
kubectl get networkpolicy -n production

# Verify model files in container
kubectl exec deployment/pose-detection-motion-tracking-app -n production -- ls -la /usr/share/nginx/html/models/

# Check CDN/caching issues
kubectl logs -l app=pose-detection-motion-tracking -n production | grep -i model
```

### Debugging Commands

```bash
# Get deployment status
kubectl get deployment pose-detection-motion-tracking-app -n production -o wide

# Check pod details
kubectl describe pods -l app=pose-detection-motion-tracking -n production

# Get service information
kubectl get service pose-detection-motion-tracking-service -n production -o wide

# Check ingress
kubectl get ingress -n production

# View recent events
kubectl get events --sort-by=.metadata.creationTimestamp -n production

# Check HPA status
kubectl get hpa -n production

# Monitor resource usage
kubectl top pods -n production
kubectl top nodes
```

## 🔒 Security Considerations

### Container Security

1. **Non-root User**: Application runs as non-root user (UID 1001)
2. **Read-only Filesystem**: Root filesystem is read-only
3. **Minimal Base Image**: Alpine Linux for minimal attack surface
4. **Security Updates**: Regular base image updates

### Network Security

1. **Network Policies**: Restrict pod-to-pod communication
2. **TLS Termination**: HTTPS-only access
3. **Rate Limiting**: Prevent DoS attacks
4. **CORS Configuration**: Proper cross-origin restrictions

### Application Security

1. **Content Security Policy**: Comprehensive CSP headers
2. **Input Validation**: Client-side validation
3. **Data Privacy**: No personal data storage
4. **Secure Headers**: Security-focused HTTP headers

### Monitoring Security

1. **Audit Logging**: Comprehensive audit trails
2. **Anomaly Detection**: Unusual activity alerts
3. **Compliance Monitoring**: Security policy compliance
4. **Incident Response**: Automated incident response

## 🚨 Incident Response

### Incident Classification

- **Critical**: Complete service outage
- **High**: Significant performance degradation
- **Medium**: Partial functionality issues
- **Low**: Minor issues not affecting users

### Response Procedures

1. **Immediate Response**: Assess and contain
2. **Investigation**: Root cause analysis
3. **Resolution**: Fix implementation
4. **Communication**: Stakeholder updates
5. **Post-incident**: Review and improvement

### Emergency Procedures

```bash
# Emergency rollback
./scripts/deploy.sh --rollback --environment production

# Scale down to reduce load
kubectl scale deployment pose-detection-motion-tracking-app --replicas=1 -n production

# Emergency maintenance mode
kubectl patch deployment pose-detection-motion-tracking-app -n production -p '{"spec":{"replicas":0}}'
```

## 📝 Change Management

### Deployment Process

1. **Development**: Feature development and testing
2. **Staging**: Pre-production validation
3. **Production**: Controlled production deployment
4. **Monitoring**: Post-deployment monitoring
5. **Rollback**: Quick rollback if issues arise

### Release Management

1. **Version Control**: Semantic versioning
2. **Build Pipeline**: Automated CI/CD
3. **Testing**: Comprehensive test suite
4. **Approval Process**: Change approval workflow
5. **Documentation**: Release notes and documentation

---

This deployment guide provides comprehensive instructions for deploying the Human Pose Detection and Motion Tracking Application across different environments. For additional support, refer to the main README.md or contact the development team.
