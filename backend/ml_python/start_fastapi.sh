#!/usr/bin/env bash

set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/fastapi.pid"
LOG_FILE="$SCRIPT_DIR/fastapi.log"

if [ -f "$PID_FILE" ]; then
  EXISTING_PID="$(cat "$PID_FILE")"
  if [ -n "$EXISTING_PID" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    echo "FastAPI is already running with PID $EXISTING_PID"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

cd "$SCRIPT_DIR"
nohup uvicorn main:app --host 127.0.0.1 --port 8000 >>"$LOG_FILE" 2>&1 &
FASTAPI_PID=$!
echo "$FASTAPI_PID" >"$PID_FILE"
echo "FastAPI started with PID $FASTAPI_PID"

