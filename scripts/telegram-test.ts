import "dotenv/config";
import { TelegramService } from "../lib/services/telegram-service";

await new TelegramService().sendTestMessage();
console.log("Telegram test message sent.");
