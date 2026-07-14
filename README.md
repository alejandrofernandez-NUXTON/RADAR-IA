# Radar IA interno

Aplicacion interna para recopilar, analizar y priorizar novedades de inteligencia artificial, enviar noticias relevantes a Telegram y curar formaciones gratuitas para equipos de empresa.

Incluye un modo opcional para agrupar noticias pendientes en videos explicativos narrados, revisarlos y enviarlos manualmente a Telegram. La documentacion completa esta en [docs/video-digests.md](docs/video-digests.md).

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Componentes locales compatibles con shadcn/ui
- PostgreSQL
- Prisma ORM
- Autenticacion admin propia con cookie firmada
- Gemini API como proveedor principal
- Telegram Bot API
- Jobs internos protegidos por sesion admin o `CRON_SECRET`

## Instalacion

```bash
npm install
docker compose up -d
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

La aplicacion quedara disponible en `http://localhost:3000`.

En Windows puedes usar el script guiado:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev-start.ps1
```

## Variables de entorno

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/imagion_ai_radar?schema=public"
NEXTAUTH_SECRET="replace-with-a-long-random-secret"
ADMIN_EMAIL="admin"
ADMIN_PASSWORD="78202412"
APP_ENCRYPTION_SECRET="replace-with-32-plus-random-characters"
CRON_SECRET="replace-with-a-long-random-cron-secret"

GEMINI_API_KEY=""
GEMINI_MODEL="gemini-3.5-flash"

TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""

OPENAI_API_KEY=""
OPENAI_MODEL=""
```

Los valores de base de datos tienen prioridad sobre `.env` cuando existen. Las claves guardadas desde `/admin/settings` se cifran con `APP_ENCRYPTION_SECRET`.

## Comandos

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
npm run typecheck
npm run build
npm run ops:diagnose
npm run ops:gemini:diagnose
npm run ops:telegram:discover
npm run ops:telegram:save-first
npm run ops:telegram:test
npm run test
npm run video:demo
npm run video:preview
```

## Gemini

1. Crea una API key de Gemini.
2. Entra en `/admin/settings`.
3. Pega la key en `Gemini API Key`.
4. Elige modelo, por defecto `gemini-3.5-flash`.
5. Ajusta prompt y umbrales.
6. Guarda.
7. Ejecuta `/admin/jobs` -> `Buscar noticias ahora`.

Diagnostico especifico:

```bash
npm run ops:gemini:diagnose
```

Si Gemini devuelve `403 Your project has been denied access`, la clave existe pero el proyecto de Google no tiene permiso de inferencia para ese modelo. Si devuelve `429 quota exceeded`, la clave/proyecto no tiene cuota disponible para ese modelo. En ambos casos hay que renovar la key, activar facturacion/cuota o usar otro proyecto/modelo con acceso.

Mientras Gemini no este operativo, los jobs crean evaluaciones fallback en estado de revision para poder probar el flujo de YouTube, base de datos, admin y Telegram. El analisis real de IA requiere una API key/proyecto Gemini valido.

## Telegram

1. Crea un bot con `@BotFather`.
2. Copia el token.
3. Anade el bot al grupo.
4. Dale permiso para enviar mensajes.
5. Obten el `chat_id` del grupo.
6. Guarda token y chat ID en `/admin/settings`.
7. Activa `envio automatico`.
8. Usa `Enviar mensaje de prueba`.

Tambien puedes probarlo desde PowerShell:

```bash
npm run ops:telegram:discover
npm run ops:telegram:save-first
npm run ops:telegram:test
```

Si `discover` no encuentra chats, anade el bot al grupo y envia `/start@usuario_del_bot` o menciona al bot dentro del grupo.

## Diagnostico

Desde admin:

```text
/admin/diagnostics
```

Desde PowerShell:

```bash
npm run ops:diagnose
npm run ops:gemini:diagnose
```

## Exponer localmente con seguridad

Para una demo temporal por tunel, usa Cloudflare Tunnel con Cloudflare Access para restringir por emails o dominio corporativo. La aplicacion mantiene su propio login interno en `/login`, similar a un panel tipo WordPress.

Opcion permanente: Vercel + Neon/Supabase PostgreSQL + variables de entorno + dominio corporativo.

## Endpoints

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/jobs/news/run`
- `POST /api/jobs/training/run`
- `POST /api/jobs/telegram/send-pending`
- `POST /api/jobs/video/generate-pending`
- `POST /api/jobs/video/[id]/regenerate`
- `POST /api/admin/video-digests/[id]/send`
- `POST /api/admin/video-digests/[id]/cancel`
- `POST /api/admin/video-digests/[id]/confirm-not-delivered`
- `GET /api/admin/video-digests/[id]/media`
- `POST /api/telegram/test`
- `GET /api/cron/news`
- `GET /api/cron/training`
- `GET /api/cron/telegram`

Los endpoints de jobs aceptan sesion admin o `Authorization: Bearer $CRON_SECRET`.

## Rutas

- `/`
- `/news`
- `/news/[id]`
- `/training`
- `/login`
- `/admin`
- `/admin/settings`
- `/admin/sources`
- `/admin/news`
- `/admin/news/[id]`
- `/admin/training`
- `/admin/jobs`
- `/admin/videos`
- `/admin/videos/[id]`

## Limitaciones del MVP

- YouTube funciona mejor con videos concretos y playlists. Canales quedan soportados mediante feed cuando se puede resolver el channel ID.
- Los transcripts de YouTube dependen de que existan subtitulos publicos.
- La busqueda de formaciones usa proveedores publicos y catalogos reputados; se puede ampliar con APIs dedicadas.
- El proveedor OpenAI queda configurado como futuro fallback, pero no se invoca todavia.
- El rate limiting es en memoria, suficiente para MVP local o despliegues simples.
- El render de video requiere un proceso Node.js persistente, Chromium/FFmpeg compatibles y almacenamiento persistente; no se ha validado dentro de funciones serverless.
- La retencion de videos finales es configurable, pero su purga programada queda pendiente de un job de mantenimiento.
