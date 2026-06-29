import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRateLimited } from "@/lib/rate-limit";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "local";
  if (isRateLimited(`login:${ip}`, 8, 60_000)) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  const formData = await request.formData();
  const email = String(formData.get("email") || "").toLowerCase().trim();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/admin");

  const user = await prisma.user.findUnique({ where: { email } });
  const envFallbackOk =
    !user &&
    email === (process.env.ADMIN_EMAIL || "").toLowerCase() &&
    password === process.env.ADMIN_PASSWORD &&
    Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD);

  const valid = user ? verifyPassword(password, user.passwordHash) : envFallbackOk;
  if (!valid) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "invalid");
    return NextResponse.redirect(loginUrl, { status: 303 });
  }

  const token = await createSessionToken(email, process.env.NEXTAUTH_SECRET || "");
  const response = NextResponse.redirect(new URL(next.startsWith("/") ? next : "/admin", request.url), { status: 303 });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });
  return response;
}
