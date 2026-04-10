#!/bin/bash
# pokt Craft - Script de inicialização unificado
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
echo "   ⛏️  pokt Craft - Minecraft Server Manager"
echo "============================================"
echo ""
echo "  Backend:  http://0.0.0.0:$BACKEND_PORT"
echo "  Frontend: http://0.0.0.0:$FRONTEND_PORT"
echo ""
echo "============================================"

# Install backend dependencies if needed
if [ ! -d "$SCRIPT_DIR/backend/node_modules" ]; then
  echo "[pokt Craft] Instalando dependências do backend..."
  cd "$SCRIPT_DIR/backend" && npm install
fi

# Build frontend in production
# Padrão: mesma origem (/api no domínio com HTTPS). Teste local sem proxy: VITE_USE_SAME_ORIGIN_API=false ./start.sh
if [ "$MODE" = "production" ]; then
  echo "[pokt Craft] Fazendo build do frontend..."
  if [ "${VITE_USE_SAME_ORIGIN_API:-}" = "false" ] || [ "${VITE_USE_SAME_ORIGIN_API:-}" = "0" ]; then
    echo "[pokt Craft] Build legado: API em http://IP:$BACKEND_PORT (sem HTTPS no mesmo host)."
    cd "$SCRIPT_DIR" && VITE_API_URL="http://$(hostname -I | awk '{print $1}'):$BACKEND_PORT" npm run build
  else
    echo "[pokt Craft] Build same-origin: use Nginx/Caddy em HTTPS com /api e /ws → Node:$BACKEND_PORT"
    cd "$SCRIPT_DIR" && VITE_USE_SAME_ORIGIN_API=true npm run build
  fi
fi

# Start backend
echo "[pokt Craft] Iniciando backend na porta $BACKEND_PORT..."
cd "$SCRIPT_DIR/backend" && node server.js &
BACKEND_PID=$!

# Start frontend
if [ "$MODE" = "production" ]; then
  echo "[pokt Craft] Servindo frontend na porta $FRONTEND_PORT..."
  cd "$SCRIPT_DIR" && npx serve dist -l $FRONTEND_PORT -s &
  FRONTEND_PID=$!
else
  echo "[pokt Craft] Iniciando frontend em modo dev na porta $FRONTEND_PORT..."
  cd "$SCRIPT_DIR" && npm run dev &
  FRONTEND_PID=$!
fi

# Trap SIGINT/SIGTERM to cleanup
cleanup() {
  echo ""
  echo "[pokt Craft] Encerrando..."
  kill $BACKEND_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID 2>/dev/null
  wait $FRONTEND_PID 2>/dev/null
  echo "[pokt Craft] Encerrado."
  exit 0
}

trap cleanup SIGINT SIGTERM

echo ""
echo "[pokt Craft] Sistema rodando! Pressione Ctrl+C para parar."
echo ""

# Wait for both processes
wait
