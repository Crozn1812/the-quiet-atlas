#!/usr/bin/env bash
# Usage: blender-workers.sh [port ...]  (default 9876 9877 9878 9879)
# One Blender GUI per worker so parallel MCP sessions never share a scene:
#   .codex=9876  .codex2=9877  .codex3=9878  agy=9879  (see each worker's blender MCP env BLENDER_PORT)
BL="C:/Program Files/Blender Foundation/Blender 5.2/blender.exe"
for port in "${@:-9876 9877 9878 9879}"; do
  for p in $port; do
    if netstat -ano | grep -q "127.0.0.1:$p .*LISTENING"; then echo "$p already listening"; continue; fi
    BLENDER_WORKER_PORT=$p nohup "$BL" --python D:/the-quiet-atlas/tools/lead/blender-mcp-start.py > "$TEMP/blender-$p.log" 2>&1 &
    echo "started Blender for port $p"
  done
done
