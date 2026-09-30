#!/bin/sh
set -e

# Set default BASE_PATH if not provided
export BASE_PATH="${BASE_PATH:-/}"

# Ensure BASE_PATH starts with / but doesn't end with /
if [ "$BASE_PATH" != "/" ]; then
    # Remove trailing slash if present
    BASE_PATH=$(echo "$BASE_PATH" | sed 's:/*$::')
    # Ensure it starts with /
    BASE_PATH=$(echo "$BASE_PATH" | sed 's:^/*:/:')
fi

echo "Starting pose detection app with BASE_PATH: $BASE_PATH"

# Keep the API URL rooted correctly when BASE_PATH is "/".  Concatenating
# "/" and "/api" directly would inject "//api" into the runtime config.
API_URL="${BASE_PATH%/}/api"
[ -n "$API_URL" ] || API_URL=/api
ASSET_BASE="${BASE_PATH%/}"

# Copy all static files to /tmp/html (writable location)
mkdir -p /tmp/html
echo "Copying static files to /tmp/html..."
cp -r /app/dist/* /tmp/html/

# Process the index.html template by injecting BASE_PATH configuration
if [ -f /tmp/html/index.html ]; then
    # Create a temporary version with BASE_PATH configuration injected
    sed -e "s|\./|${ASSET_BASE}/|g" \
        -e "s|<head>|<head><script>window.__BASE_PATH__ = '${BASE_PATH}'; window.__APP_CONFIG__ = { basePath: '${BASE_PATH}', apiUrl: '${API_URL}' };</script>|" \
        /tmp/html/index.html > /tmp/html/index.html.new
    mv /tmp/html/index.html.new /tmp/html/index.html
    echo "Injected BASE_PATH configuration into index.html"
else
    echo "Warning: index.html not found in /tmp/html"
fi

# Copy nginx config template to a writable location and process it
cp /etc/nginx/nginx.conf.template /tmp/nginx.conf.template

# Choose the appropriate location block based on BASE_PATH
if [ "$BASE_PATH" = "/" ]; then
    echo "Configuring nginx for root path"
    # Replace the placeholder with root path configuration
    awk '/# BASE_PATH_LOCATION_BLOCK/{system("cat /etc/nginx/nginx-root.conf");next}1' /tmp/nginx.conf.template > /tmp/nginx.conf
else
    echo "Configuring nginx for subpath: $BASE_PATH"
    # Replace the placeholder with subpath configuration
    awk '/# BASE_PATH_LOCATION_BLOCK/{system("cat /etc/nginx/nginx-subpath.conf");next}1' /tmp/nginx.conf.template > /tmp/nginx.conf.tmp
    # Substitute BASE_PATH variable
    envsubst '$BASE_PATH' < /tmp/nginx.conf.tmp > /tmp/nginx.conf
    rm /tmp/nginx.conf.tmp
fi

# Start nginx with the processed config from /tmp
echo "Starting nginx with config from /tmp/nginx.conf"
exec nginx -c /tmp/nginx.conf -g 'daemon off;'
