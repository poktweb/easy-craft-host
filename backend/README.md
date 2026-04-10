# MCHost Backend - Servidor de Minecraft

## Instalação na VPS

```bash
# 1. Clone ou copie a pasta backend para sua VPS
cd backend

# 2. Instale as dependências
npm install

# 3. Crie a pasta do servidor Minecraft e coloque o server.jar
mkdir -p minecraft
cp /caminho/do/server.jar minecraft/

# 4. Aceite o EULA
echo "eula=true" > minecraft/eula.txt

# 5. Configure as variáveis de ambiente (opcional)
export PORT=3001
export MC_SERVER_DIR=/caminho/absoluto/para/minecraft
export MC_JAR=server.jar
export JAVA_PATH=java
export MC_MAX_RAM=2048M
export MC_MIN_RAM=512M
export MC_BACKUP_DIR=/caminho/para/backups
export MC_MAX_PLAYERS=20

# 6. Inicie o backend
npm start
```

## Variáveis de Ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3001` | Porta do backend |
| `MC_SERVER_DIR` | `./minecraft` | Diretório do servidor MC |
| `MC_JAR` | `server.jar` | Nome do arquivo JAR |
| `JAVA_PATH` | `java` | Caminho do Java |
| `MC_MAX_RAM` | `2048M` | RAM máxima |
| `MC_MIN_RAM` | `512M` | RAM mínima |
| `MC_EXTRA_FLAGS` | `""` | Flags extras do Java |
| `MC_BACKUP_DIR` | `./backups` | Diretório de backups |
| `MC_MAX_PLAYERS` | `20` | Max jogadores (display) |
| `MC_MAX_CPU` | `200` | Max CPU % (display) |
| `MC_MAX_STORAGE` | `10 GB` | Max storage (display) |

## Rodar com PM2 (recomendado)

```bash
npm install -g pm2
pm2 start server.js --name mchost
pm2 save
pm2 startup
```

## Frontend

No frontend, configure a URL do backend em `src/lib/api.ts`:
```
VITE_API_URL=http://SEU_IP_VPS:3001
```

## API Endpoints

- `POST /api/server/start` - Iniciar servidor
- `POST /api/server/stop` - Parar servidor
- `POST /api/server/restart` - Reiniciar servidor
- `POST /api/server/command` - Enviar comando `{ command: "/say hello" }`
- `GET /api/server/status` - Status atual
- `GET /api/server/stats` - Estatísticas (CPU, RAM, etc)
- `GET /api/files?path=` - Listar arquivos
- `GET /api/files/content?path=` - Ler arquivo
- `PUT /api/files/content` - Salvar arquivo `{ path, content }`
- `POST /api/files/create` - Criar arquivo/pasta `{ path, type }`
- `DELETE /api/files?path=` - Deletar
- `POST /api/files/upload` - Upload (multipart)
- `GET /api/files/download?path=` - Download
- `GET /api/backups` - Listar backups
- `POST /api/backups/create` - Criar backup
- `GET /api/backups/download?name=` - Download backup
- `DELETE /api/backups?name=` - Deletar backup
- `GET /api/properties` - Ler server.properties
- `PUT /api/properties` - Salvar server.properties
- `WS /ws` - WebSocket (logs em tempo real, stats, status)
