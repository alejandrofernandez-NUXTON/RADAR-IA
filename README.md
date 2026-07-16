# Radar IA interno

Aplicacion interna para recopilar, analizar y priorizar novedades de inteligencia artificial, enviar noticias relevantes a Telegram y curar formaciones gratuitas para equipos de empresa.

Incluye un modo opcional para agrupar noticias pendientes en videos explicativos narrados. La generacion puede encadenarse automaticamente despues del analisis con OpenAI y los videos `READY` pueden enviarse manualmente o mediante la programacion de Telegram. La documentacion completa esta en [docs/video-digests.md](docs/video-digests.md).

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Componentes locales compatibles con shadcn/ui
- PostgreSQL
- Prisma ORM
- Autenticacion admin propia con cookie firmada
- OpenAI Responses, Transcription, Vision y Text-to-Speech como motor de IA
- YouTube.js con fallback `yt-dlp` para obtener subtitulos, fotogramas y audio real
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

TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""

OPENAI_API_KEY=""
OPENAI_MODEL="gpt-5.6-terra"
OPENAI_TRANSCRIPTION_MODEL="gpt-4o-transcribe"
OPENAI_REASONING_EFFORT="low"
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
npm run ops:openai:diagnose
npm run ops:telegram:discover
npm run ops:telegram:save-first
npm run ops:telegram:test
npm run test
npm run video:demo
npm run video:preview
```

## OpenAI

1. Crea una API key en la plataforma de OpenAI y activa facturacion o saldo de API.
2. Entra en `/admin/settings`.
3. Pega la key en `OpenAI API Key`.
4. Revisa los modelos de analisis, transcripcion y voz.
5. Activa vision para utilizar storyboards y miniatura como evidencia complementaria.
6. Ajusta prompt y umbrales, guarda y abre `/admin/diagnostics`.
7. En `/admin/jobs`, recoge publicaciones y despues pulsa `Procesar pendientes con OpenAI`.

Diagnostico especifico:

```bash
npm run ops:openai:diagnose
```

Un `401` indica una clave invalida. Un `429 quota exceeded` indica que la organizacion o proyecto de API no tiene cuota/saldo disponible, aunque ChatGPT Plus o Pro este activo: la facturacion de ChatGPT y la API son independientes.

Para YouTube, la aplicacion usa subtitulos si son suficientes. Si no existen, descarga el audio con un extractor secundario mantenido y lo envia a `gpt-4o-transcribe`. El resumen usa esa transcripcion y hasta tres storyboards mas la miniatura; la descripcion nunca sustituye al contenido real. Si OpenAI no esta operativo, el elemento queda en error o revision y no se envia a Telegram.

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
npm run ops:openai:diagnose
```

## Exponer localmente con seguridad

Para una demo temporal por tunel, usa Cloudflare Tunnel con Cloudflare Access para restringir por emails o dominio corporativo. La aplicacion mantiene su propio login interno en `/login`, similar a un panel tipo WordPress.

Opcion permanente: Vercel + Neon/Supabase PostgreSQL + variables de entorno + dominio corporativo.

## Endpoints

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/jobs/sources/collect`
- `POST /api/jobs/news/process`
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

- YouTube funciona mejor con videos concretos, playlists y la pestana `Videos` de canales. Directos privados, contenido con restriccion regional/edad o retos anti-bot pueden requerir intervencion operativa.
- Los audios se limitan a 24 MB por transcripcion. Los videos excepcionalmente largos necesitan segmentacion, que aun no forma parte del MVP.
- La busqueda de formaciones usa proveedores publicos y catalogos reputados; se puede ampliar con APIs dedicadas.
- El guion y la voz del resumen son de OpenAI. Remotion realiza la composicion determinista del MP4 para conservar literalmente noticias, cifras, fuentes y subtitulos; no se usa video generativo para representar hechos.
- El rate limiting es en memoria, suficiente para MVP local o despliegues simples.
- El render de video requiere un proceso Node.js persistente, Chromium/FFmpeg compatibles y almacenamiento persistente; no se ha validado dentro de funciones serverless.
- La retencion de videos finales es configurable, pero su purga programada queda pendiente de un job de mantenimiento.
