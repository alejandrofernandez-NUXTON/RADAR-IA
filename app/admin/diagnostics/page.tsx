import { CheckCircle2, RefreshCcw, TriangleAlert } from "lucide-react";
import {
  detectTelegramChatAction,
  runNewsJobAction,
  sendTelegramTestAction,
  useRecommendedOpenAIModelAction
} from "@/lib/actions/admin-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DiagnosticsService } from "@/lib/services/diagnostics-service";
import { SettingsService } from "@/lib/services/settings-service";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DiagnosticsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [checks, settings] = await Promise.all([new DiagnosticsService().runAll(), SettingsService.getAll()]);
  const telegramStatus = Array.isArray(params.telegramChat) ? params.telegramChat[0] : params.telegramChat;
  const openaiModelStatus = Array.isArray(params.openaiModel) ? params.openaiModel[0] : params.openaiModel;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Diagnostico operativo</h1>
        <p className="mt-2 text-sm text-muted-foreground">Comprueba DB, OpenAI, Telegram y extraccion de fuentes antes de ejecutar jobs.</p>
      </div>

      {telegramStatus ? <StatusNotice kind={telegramStatus} /> : null}
      {openaiModelStatus === "updated" ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Modelo OpenAI actualizado a gpt-5.6-terra.</div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        {checks.map((check) => (
          <Card key={check.name}>
            <CardContent className="flex gap-3 py-4">
              {check.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden /> : <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{check.name}</h2>
                  <Badge tone={check.ok ? "high" : "medium"}>{check.ok ? "OK" : "Revisar"}</Badge>
                </div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{check.message}</p>
                {check.detail ? <p className="mt-2 break-words rounded-md border border-border bg-muted/40 p-2 text-xs leading-5 text-muted-foreground">{check.detail}</p> : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Acciones rapidas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <form action={useRecommendedOpenAIModelAction}>
            <Button type="submit" variant={settings.openaiModel === "gpt-5.6-terra" ? "secondary" : "primary"}>
              Usar gpt-5.6-terra
            </Button>
          </form>
          <form action={detectTelegramChatAction}>
            <Button type="submit" variant="outline">
              Detectar y guardar chat ID
            </Button>
          </form>
          <form action={sendTelegramTestAction}>
            <Button type="submit" variant="outline">
              Enviar prueba Telegram
            </Button>
          </form>
          <form action={runNewsJobAction}>
            <Button type="submit" variant="outline">
              <RefreshCcw className="h-4 w-4" aria-hidden />
              Analizar fuentes ahora
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Para detectar el chat ID de Telegram</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
          <p>1. Anade el bot al grupo de Telegram.</p>
          <p>2. En el grupo, envia un mensaje como <span className="font-mono text-foreground">/start@usuario_del_bot</span> o menciona al bot.</p>
          <p>3. Vuelve aqui y pulsa <span className="font-medium text-foreground">Detectar y guardar chat ID</span>.</p>
          <p>4. Si Telegram no devuelve updates, desactiva la privacidad del bot en @BotFather o escribe un comando dirigido al bot dentro del grupo.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusNotice({ kind }: { kind: string }) {
  if (kind === "saved") {
    return <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Chat ID detectado y guardado.</div>;
  }
  if (kind === "none") {
    return <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Telegram no devolvio chats. Envia /start o menciona al bot dentro del grupo y vuelve a intentarlo.</div>;
  }
  return <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Telegram devolvio varios chats. Copia manualmente el chat_id correcto en Ajustes.</div>;
}
