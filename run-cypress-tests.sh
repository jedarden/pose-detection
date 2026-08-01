#!/usr/bin/env bash
cd /home/coding/pose-detection

# Set up nix-shell environment with Xvfb and run Cypress
nix-shell -p xorg.xvfb --run '
  export DISPLAY=:99
  Xvfb :99 -screen 0 1024x768x24 >/dev/null 2>&1 &
  XVFB_PID=$!
  sleep 2
  
  echo "Running Cypress E2E tests..."
  npx cypress run
  
  kill $XVFB_PID 2>/dev/null
'
