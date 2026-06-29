import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token, process.env.NEXTAUTH_SECRET || "");
}

export async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}
