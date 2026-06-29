import { NextResponse, type NextRequest } from "next/server";
import { unauthorized, isAuthorizedInternalRequest } from "@/lib/api-auth";
import { TelegramService } from "@/lib/services/telegram-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await isAuthorizedInternalRequest(request))) return unauthorized();
  const result = await new TelegramService().sendTestMessage();
  return NextResponse.json(result);
}
