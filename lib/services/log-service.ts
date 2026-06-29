import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type LogLevel = "debug" | "info" | "warn" | "error";

function redact(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      if (/token|secret|password|api.?key|authorization/i.test(key)) {
        return [key, "[redacted]"];
      }
      return [key, redact(entry)];
    })
  );
}

export class LogService {
  static async write(level: LogLevel, scope: string, message: string, metadata?: Record<string, unknown>) {
    await prisma.logEntry.create({
      data: {
        level,
        scope,
        message,
        metadata: metadata ? (redact(metadata) as Prisma.InputJsonValue) : undefined
      }
    });
  }

  static async info(scope: string, message: string, metadata?: Record<string, unknown>) {
    await this.write("info", scope, message, metadata);
  }

  static async warn(scope: string, message: string, metadata?: Record<string, unknown>) {
    await this.write("warn", scope, message, metadata);
  }

  static async error(scope: string, message: string, metadata?: Record<string, unknown>) {
    await this.write("error", scope, message, metadata);
  }
}
