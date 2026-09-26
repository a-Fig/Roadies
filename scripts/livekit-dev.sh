#!/usr/bin/env bash
# Local LiveKit server in dev mode (API key "devkey", secret "secret").
# Uses livekit-server from PATH if present (macOS: `brew install livekit`),
# otherwise downloads the Linux binary into .livekit/.
set -euo pipefail
VERSION=1.13.7
DIR="$(cd "$(dirname "$0")/.." && pwd)/.livekit"

if command -v livekit-server >/dev/null 2>&1; then
  BIN=livekit-server
else
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) ARCH=linux_amd64 ;;
    Linux-aarch64 | Linux-arm64) ARCH=linux_arm64 ;;
    Darwin-*) echo "Install LiveKit first: brew install livekit" >&2; exit 1 ;;
    *) echo "Unsupported platform: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
  esac
  BIN="$DIR/livekit-server"
  if [ ! -x "$BIN" ]; then
    mkdir -p "$DIR"
    echo "Downloading LiveKit server v$VERSION..." >&2
    curl -fsSL "https://github.com/livekit/livekit/releases/download/v$VERSION/livekit_${VERSION}_${ARCH}.tar.gz" |
      tar -xz -C "$DIR" livekit-server
  fi
fi

exec "$BIN" --dev --bind 0.0.0.0 "$@"
