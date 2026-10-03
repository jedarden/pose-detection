#!/bin/sh
# Health check script for Human Pose Detection and Motion Tracking Application
# nginx listens on 8080 and serves the app under BASE_PATH (default "/").

BASE_PATH="${BASE_PATH:-/}"
PREFIX="${BASE_PATH%/}"
ORIGIN="http://127.0.0.1:8080"

# Check if nginx is running
if ! pgrep nginx > /dev/null; then
    echo "ERROR: nginx is not running"
    exit 1
fi

# Check if the application is responding
if ! curl -f "$ORIGIN$PREFIX/health" > /dev/null 2>&1; then
    echo "ERROR: Application health check failed"
    exit 1
fi

# Check if static files are accessible
if ! curl -f "$ORIGIN$PREFIX/index.html" > /dev/null 2>&1; then
    echo "ERROR: Static files not accessible"
    exit 1
fi

# Check if TensorFlow.js models are accessible
if ! curl -f "$ORIGIN$PREFIX/models/" > /dev/null 2>&1; then
    echo "WARNING: TensorFlow.js models may not be accessible"
fi

echo "Health check passed"
exit 0
