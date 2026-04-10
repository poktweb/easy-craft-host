#!/bin/bash
# MCHost - Script de inicialização unificado
# Uso: ./start.sh [--dev] [--port 8080] [--api-port 3001]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_PORT=${FRONTEND_PORT:-8080}
BACKEND_PORT=${PORT:-3001}
MODE="production"

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --dev) MODE="development"; shift ;;
    --port) FRONTEND_PORT="$2"; shift 2 ;;
    --api-port) BACKEND_PORT="$2"; shift 2 ;;
    *) shift ;;
  esac
done

export PORT=$BACKEND_PORT

echo "============================================"
echo "   ⛏️  MCHost - Minecraft Server Manager"
echo "============================================"
echo ""
echo "  Backend:  http://0.0.0.0:$BACKEND_PORT"
echo "  Frontend: http://0.0.0.0:$FRONTEND_PORT"
echo ""
echo "============================================"

# Install backend dependencies if needed
if [ ! -d "$SCRIPT_DIR/backend/node_modules" ]; then
  echo "[MCHost] Instalando dependências do backend..."
  cd "$SCRIPT_DIR/backend" && npm install
fi

# Build frontend if production and dist doesn't exist
if [ "$MODE" = "production" ]; then
  if [ ! -d "$SCRIPT_DIR/dist" ]; then
    echo "[MCHost] Fazendo build do frontend..."
    cd "$SCRIPT_DIR" && VITE_API_URL="http://$(hostname -I | awk '{print $1}'):$BACKEND_PORT" npm run build
  fi
fi

# Start backend
echo "[MCHost] Iniciando backend na porta $BACKEND_PORT..."
cd "$SCRIPT_DIR/backend" && node server.js &
BACKEND_PID=$!

# Start frontend
if [ "$MODE" = "production" ]; then
  echo "[MCHost] Servindo frontend na porta $FRONTEND_PORT..."
  cd "$SCRIPT_DIR" && npx serve dist -l $FRONTEND_PORT -s &
  FRONTEND_PID=$!
else
  echo "[MCHost] Iniciando frontend em modo dev na porta $FRONTEND_PORT..."
  cd "$SCRIPT_DIR" && npm run dev &
  FRONTEND_PID=$!
fi

# Trap SIGINT/SIGTERM to cleanup
cleanup() {
  echo ""
  echo "[MCHost] Encerrando..."
  kill $BACKEND_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID 2>/dev/null
  wait $FRONTEND_PID 2>/dev/null
  echo "[MCHost] Encerrado."
  exit 0
}

trap cleanup SIGINT SIGTERM

echo ""
echo "[MCHost] Sistema rodando! Pressione Ctrl+C para parar."
echo ""

# Wait for both processes
wait
