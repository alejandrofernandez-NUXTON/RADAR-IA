import { prisma } from "@/lib/prisma";
import { OpenAIService } from "@/lib/services/openai-service";
import { SettingsService } from "@/lib/services/settings-service";
import { SourceService } from "@/lib/services/source-service";
import { TelegramService } from "@/lib/services/telegram-service";

export type DiagnosticCheck = {
  name: string;
  ok: boolean;
  message: string;
  detail?: string;
};

function asMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export class DiagnosticsService {
  private openai = new OpenAIService();
  private telegram = new TelegramService();
  private sourceService = new SourceService();

  async runAll(): Promise<DiagnosticCheck[]> {
    const checks: DiagnosticCheck[] = [];
    checks.push(await this.checkDatabase());
    checks.push(await this.checkOpenAI());
    checks.push(await this.checkTelegramBot());
    checks.push(await this.checkTelegramChat());
    checks.push(await this.checkYouTubeExtraction());
    return checks;
  }

  async checkDatabase(): Promise<DiagnosticCheck> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { name: "Base de datos", ok: true, message: "PostgreSQL responde correctamente." };
    } catch (error) {
      return { name: "Base de datos", ok: false, message: "No se pudo conectar a PostgreSQL.", detail: asMessage(error) };
    }
  }

  async checkOpenAI(): Promise<DiagnosticCheck> {
    try {
      const settings = await SettingsService.getAll();
      if (!settings.openaiApiKey) {
        return { name: "OpenAI", ok: false, message: "Falta OpenAI API Key." };
      }
      const result = await this.openai.testConnection();
      return { name: "OpenAI", ok: true, message: `OpenAI responde con el modelo ${result.model}.` };
    } catch (error) {
      return {
        name: "OpenAI",
        ok: false,
        message: "OpenAI no esta operativo con la clave o el modelo actual.",
        detail: asMessage(error)
      };
    }
  }

  async checkTelegramBot(): Promise<DiagnosticCheck> {
    try {
      const settings = await SettingsService.getAll();
      if (!settings.telegramBotToken) {
        return { name: "Telegram bot", ok: false, message: "Falta Telegram Bot Token." };
      }
      await this.telegram.getBotInfo();
      return { name: "Telegram bot", ok: true, message: "El token del bot es valido." };
    } catch (error) {
      return { name: "Telegram bot", ok: false, message: "El token del bot no funciona.", detail: asMessage(error) };
    }
  }

  async checkTelegramChat(): Promise<DiagnosticCheck> {
    try {
      const settings = await SettingsService.getAll();
      if (!settings.telegramChatId) {
        const chats = await this.telegram.discoverChats().catch(() => []);
        if (chats.length === 1) {
          return {
            name: "Telegram chat",
            ok: false,
            message: `Chat detectado pero no guardado: ${chats[0].title} (${chats[0].id}).`,
            detail: "Usa el boton Detectar y guardar chat ID."
          };
        }
        return {
          name: "Telegram chat",
          ok: false,
          message: "Falta Telegram Chat ID.",
          detail: "Anade el bot al grupo y envia /start o un mensaje mencionando al bot para que aparezca en getUpdates."
        };
      }
      await this.telegram.getConfiguredChat();
      return { name: "Telegram chat", ok: true, message: "El chat configurado existe y el bot puede verlo." };
    } catch (error) {
      return { name: "Telegram chat", ok: false, message: "El chat configurado no es valido.", detail: asMessage(error) };
    }
  }

  async checkYouTubeExtraction(): Promise<DiagnosticCheck> {
    try {
      const source = await prisma.source.findFirst({
        where: { active: true },
        orderBy: [{ priority: "desc" }, { updatedAt: "desc" }]
      });
      if (!source) {
        return { name: "YouTube/fuentes", ok: false, message: "No hay fuentes activas para probar extraccion." };
      }
      const contents = await this.sourceService.fetchContents(source, 1);
      const first = contents[0];
      if (!first) {
        return { name: "YouTube/fuentes", ok: false, message: "La fuente activa no devolvio contenido." };
      }
      return {
        name: "YouTube/fuentes",
        ok: true,
        message: `Extraccion OK desde ${source.name}.`,
        detail: `Titulo: ${first.title}. Transcript: ${first.transcript ? "si" : "no"}`
      };
    } catch (error) {
      return { name: "YouTube/fuentes", ok: false, message: "La extraccion de fuentes fallo.", detail: asMessage(error) };
    }
  }
}
