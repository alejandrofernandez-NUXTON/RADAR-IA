import "dotenv/config";
import { TelegramService } from "../lib/services/telegram-service";

const telegram = new TelegramService();
const chats = await telegram.discoverChats();

if (!chats.length) {
  console.log("No chats found in Telegram updates.");
  console.log("Add the bot to the group and send /start@your_bot_username or mention the bot, then run this again.");
  process.exit(1);
}

for (const chat of chats) {
  console.log(`${chat.id} | ${chat.type} | ${chat.title}`);
}

if (process.argv.includes("--save-first") && chats.length === 1) {
  const result = await telegram.saveFirstDetectedChat();
  console.log(result.saved ? "Saved chat_id." : "Could not save chat_id automatically.");
}
