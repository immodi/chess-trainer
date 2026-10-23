#!/usr/bin/env bash
# Builds the debug APK inside the capgo/capacitor container (Android SDK +
# JDK + Node preinstalled). No Android Studio needed.
#
# Used identically by CI (.github/workflows/android.yml) and locally.
#
#   ./build-apk.sh                 # normal build
#   CAPACITOR_IMAGE=capgo/capacitor:main ./build-apk.sh
#   SKIP_INSTALL=1 ./build-apk.sh  # reuse the existing node_modules volume
#
# Output: dist-apk/chess-trainer-debug.apk
set -euo pipefail

IMAGE="${CAPACITOR_IMAGE:-capgo/capacitor:latest}"
GRADLE_VOLUME="${GRADLE_VOLUME:-chess-trainer-gradle}"
NODE_MODULES_VOLUME="${NODE_MODULES_VOLUME:-chess-trainer-node-modules}"
PLATFORM_ARGS=()

# Locally the Gradle cache lives in a named volume. CI points this at a
# workspace directory so actions/cache can persist it between runs.
if [[ -n "${GRADLE_CACHE_DIR:-}" ]]; then
  mkdir -p "$GRADLE_CACHE_DIR"
  GRADLE_MOUNT=(-v "$(cd "$GRADLE_CACHE_DIR" && pwd)":/root/.gradle)
else
  GRADLE_MOUNT=(-v "$GRADLE_VOLUME":/root/.gradle)
fi

# Apple Silicon: the Android SDK image is x86_64.
if [[ "$(uname -m)" == "arm64" || "$(uname -m)" == "aarch64" ]]; then
  PLATFORM_ARGS=(--platform linux/amd64)
fi

if [[ ! -d android ]]; then
  echo "android/ is missing. Run 'npx cap add android' first." >&2
  exit 1
fi

echo "==> Pulling $IMAGE"
docker pull "$IMAGE" > /dev/null

INSTALL="npm ci"
if [[ "${SKIP_INSTALL:-0}" == "1" ]]; then
  INSTALL="npm rebuild --ignore-scripts || true"
fi

echo "==> Building APK"
docker run --rm \
  "${PLATFORM_ARGS[@]}" \
  -e CI=true \
  -e HOST_UID="$(id -u)" \
  -e HOST_GID="$(id -g)" \
  -e GRADLE_USER_HOME=/root/.gradle \
  -v "$PWD":/app \
  "${GRADLE_MOUNT[@]}" \
  -v "$NODE_MODULES_VOLUME":/app/node_modules \
  -w /app \
  "$IMAGE" sh -c "
    set -e
    $INSTALL
    npm run build
    npx cap sync android
    cd android
    ./gradlew assembleDebug --no-daemon --console=plain
    chown -R \$HOST_UID:\$HOST_GID /app/android /app/dist
  "

mkdir -p dist-apk
cp android/app/build/outputs/apk/debug/app-debug.apk dist-apk/chess-trainer-debug.apk
echo "APK: dist-apk/chess-trainer-debug.apk"
