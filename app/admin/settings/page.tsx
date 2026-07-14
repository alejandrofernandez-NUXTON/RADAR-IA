import { CheckCircle2, Send } from "lucide-react";
import { saveSettingsAction, sendTelegramTestAction } from "@/lib/actions/admin-actions";
import { SettingsService } from "@/lib/services/settings-service";
import { DEFAULT_NEWS_ANALYSIS_PROMPT, DEFAULT_TELEGRAM_TEMPLATE } from "@/lib/prompts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const saved = params.saved === "1";
  const [settings, hasGemini, hasTelegramToken, hasTelegramChat, hasXBearerToken, hasOpenAI] = await Promise.all([
    SettingsService.getAll(),
    SettingsService.hasSecret("gemini.apiKey"),
    SettingsService.hasSecret("telegram.botToken"),
    SettingsService.hasSecret("telegram.chatId"),
    SettingsService.hasSecret("x.bearerToken"),
    SettingsService.hasSecret("openai.apiKey")
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Ajustes</h1>
          <p className="mt-2 text-sm text-muted-foreground">Configuracion general, IA, Telegram y automatizaciones.</p>
        </div>
        {saved ? (
          <Badge tone="high">
            <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden />
            Guardado
          </Badge>
        ) : null}
      </div>

      <form action={saveSettingsAction} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Gemini y analisis</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <Field label="Gemini API Key" hint={hasGemini ? "Ya hay una clave configurada. Deja el campo vacio para conservarla." : "Se guardara cifrada en base de datos."}>
              <Input name="geminiApiKey" type="password" placeholder={hasGemini ? "Configurada" : "Pega tu API key"} />
            </Field>
            <Field label="Modelo Gemini">
              <Input name="geminiModel" defaultValue={settings.geminiModel || "gemini-3.5-flash"} />
            </Field>
            <Field label="Idioma de salida">
              <Input name="outputLanguage" defaultValue={settings.outputLanguage || "es"} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Umbral publicar">
                <Input name="publishThreshold" type="number" min="0" max="100" defaultValue={settings.publishThreshold} />
              </Field>
              <Field label="Umbral Telegram">
                <Input name="telegramThreshold" type="number" min="0" max="100" defaultValue={settings.telegramThreshold} />
              </Field>
            </div>
            <div className="lg:col-span-2">
              <Field label="Prompt base">
                <Textarea name="basePrompt" className="min-h-72 font-mono text-xs" defaultValue={settings.basePrompt || DEFAULT_NEWS_ANALYSIS_PROMPT} />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Jobs</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="Frecuencia noticias (horas)">
              <Input name="updateFrequencyHours" type="number" min="1" max="168" defaultValue={settings.updateFrequencyHours} />
            </Field>
            <Field label="Maximo de fuentes por ejecucion">
              <Input name="maxSourcesPerRun" type="number" min="1" max="100" defaultValue={settings.maxSourcesPerRun} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Telegram</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input name="telegramEnabled" type="checkbox" defaultChecked={settings.telegramEnabled} className="h-4 w-4 rounded border-border" />
              Activar envio automatico a Telegram
            </label>
            <div className="grid gap-4 lg:grid-cols-2">
              <Field label="Bot Token" hint={hasTelegramToken ? "Configurado. Deja vacio para conservarlo." : "Se guardara cifrado."}>
                <Input name="telegramBotToken" type="password" placeholder={hasTelegramToken ? "Configurado" : "Token de @BotFather"} />
              </Field>
              <Field label="Chat ID" hint={hasTelegramChat ? "Configurado. Deja vacio para conservarlo." : "ID del grupo o canal."}>
                <Input name="telegramChatId" type="password" placeholder={hasTelegramChat ? "Configurado" : "-100..."} />
              </Field>
            </div>
            <Field label="Plantilla del mensaje">
              <Textarea name="telegramTemplate" className="min-h-52 font-mono text-xs" defaultValue={settings.telegramTemplate || DEFAULT_TELEGRAM_TEMPLATE} />
            </Field>
            <div className="rounded-md border border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
              <p className="font-medium text-foreground">Como configurar Telegram</p>
              <p>1. Crea un bot hablando con @BotFather. 2. Copia el token. 3. Anade el bot al grupo. 4. Dale permiso para enviar mensajes. 5. Obten el chat_id del grupo. 6. Guarda token y chat_id aqui. 7. Usa el boton de prueba.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Proveedor secundario</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <label className="flex items-center gap-2 text-sm font-medium lg:col-span-2">
              <input name="openaiEnabled" type="checkbox" defaultChecked={settings.openaiEnabled} className="h-4 w-4 rounded border-border" />
              Activar proveedor secundario cuando se implemente fallback multi-provider
            </label>
            <Field label="OpenAI API Key" hint={hasOpenAI ? "Configurada. Deja vacio para conservarla." : "Opcional para el futuro."}>
              <Input name="openaiApiKey" type="password" placeholder={hasOpenAI ? "Configurada" : "Opcional"} />
            </Field>
            <Field label="Modelo OpenAI">
              <Input name="openaiModel" defaultValue={settings.openaiModel || ""} placeholder="gpt-4.1-mini" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Redes sociales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <Field
                label="X API Bearer Token"
                hint={hasXBearerToken ? "Configurado. Deja vacio para conservarlo." : "Se guardara cifrado. Necesario para fuentes de tipo Canal de Twitter."}
              >
                <Input name="xBearerToken" type="password" placeholder={hasXBearerToken ? "Configurado" : "Bearer Token de X Developer"} />
              </Field>
            </div>
            <div className="rounded-md border border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
              <p className="font-medium text-foreground">Como configurar X/Twitter</p>
              <p>
                1. Crea o abre tu proyecto en X Developer Portal. 2. En la app del proyecto, copia el Bearer Token.
                3. Pegalo aqui y guarda ajustes. 4. Crea una fuente de tipo Canal de Twitter con una URL como
                https://x.com/OpenAI. 5. Ejecuta el job de noticias para probar la ultima publicacion del apartado de posts.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button type="submit">Guardar ajustes</Button>
        </div>
      </form>

      <form action={sendTelegramTestAction}>
        <Button type="submit" variant="outline">
          <Send className="h-4 w-4" aria-hidden />
          Enviar mensaje de prueba
        </Button>
      </form>
    </div>
  );
}
