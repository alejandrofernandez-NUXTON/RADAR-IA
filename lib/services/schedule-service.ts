import { prisma } from "@/lib/prisma";
import { SettingsService, type JobScheduleConfig, type JobScheduleKey } from "@/lib/services/settings-service";

const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
};

function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "long"
  }).formatToParts(date);

  const value = (type: string) => parts.find((part) => part.type === type)?.value || "0";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    weekday: value("weekday").toLowerCase()
  };
}

function localDatePlusDays(parts: LocalParts, days: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  let candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = localParts(candidate, timeZone);
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
    const actual = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    const diffMs = wanted - actual;
    if (diffMs === 0) return candidate;
    candidate = new Date(candidate.getTime() + diffMs);
  }

  return candidate;
}

function scheduleTimeParts(schedule: JobScheduleConfig) {
  const [hour, minute] = schedule.time.split(":").map(Number);
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0
  };
}

export class ScheduleService {
  static async shouldRun(scheduleKey: JobScheduleKey, jobType: string) {
    if (!(await SettingsService.getBoolean("jobs.schedulesEnabled", true))) return false;
    if (!(await SettingsService.hasJobSchedule(scheduleKey))) return false;

    const [schedules, timezone] = await Promise.all([
      SettingsService.getJobSchedules(),
      SettingsService.getString("jobs.timezone", "Europe/Madrid")
    ]);
    const schedule = schedules[scheduleKey];
    const lastRun = await prisma.jobRun.findFirst({
      where: { jobType },
      orderBy: { startedAt: "desc" }
    });
    const savedStates = await SettingsService.getJobScheduleSavedStates();
    const referenceRunAt = lastRun?.startedAt || savedStates[scheduleKey].savedAt || null;

    return this.isDue(schedule, referenceRunAt, new Date(), timezone);
  }

  static nextRun(schedule: JobScheduleConfig, lastRun: Date | null, now: Date, timeZone: string) {
    const nowParts = localParts(now, timeZone);
    const { hour, minute } = scheduleTimeParts(schedule);
    const minimum = new Date(Math.max(now.getTime(), lastRun?.getTime() || 0));

    if (schedule.frequency === "hourly") {
      const hourlyMinute = minute;
      let candidate = zonedTimeToUtc(nowParts.year, nowParts.month, nowParts.day, nowParts.hour, hourlyMinute, timeZone);
      while (candidate <= minimum) {
        candidate = new Date(candidate.getTime() + 60 * 60 * 1000);
      }
      return candidate;
    }

    if (schedule.frequency === "daily") {
      let daysToAdd = 0;
      for (let attempt = 0; attempt < 370; attempt += 1) {
        const target = localDatePlusDays(nowParts, daysToAdd);
        const candidate = zonedTimeToUtc(target.year, target.month, target.day, hour, minute, timeZone);
        if (candidate > minimum) return candidate;
        daysToAdd += 1;
      }
    }

    const targetWeekday = schedule.weekday || "monday";
    const targetIndex = weekdays.indexOf(targetWeekday);
    const todayIndex = weekdays.indexOf(nowParts.weekday);
    let daysToAdd = (targetIndex - todayIndex + 7) % 7;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const target = localDatePlusDays(nowParts, daysToAdd);
      const candidate = zonedTimeToUtc(target.year, target.month, target.day, hour, minute, timeZone);
      if (candidate > minimum) return candidate;
      daysToAdd += 7;
    }

    return null;
  }

  static isDue(schedule: JobScheduleConfig, lastRun: Date | null, now: Date, timeZone: string) {
    const dueSlot = this.latestDueSlot(schedule, now, timeZone);
    if (!dueSlot) return false;
    if (!lastRun) return dueSlot <= now;
    return lastRun < dueSlot;
  }

  private static latestDueSlot(schedule: JobScheduleConfig, now: Date, timeZone: string) {
    const nowParts = localParts(now, timeZone);
    const { hour, minute } = scheduleTimeParts(schedule);

    if (schedule.frequency === "hourly") {
      let candidate = zonedTimeToUtc(nowParts.year, nowParts.month, nowParts.day, nowParts.hour, minute, timeZone);
      if (candidate > now) candidate = new Date(candidate.getTime() - 60 * 60 * 1000);
      return candidate;
    }

    if (schedule.frequency === "daily") {
      let candidate = zonedTimeToUtc(nowParts.year, nowParts.month, nowParts.day, hour, minute, timeZone);
      if (candidate > now) {
        const target = localDatePlusDays(nowParts, -1);
        candidate = zonedTimeToUtc(target.year, target.month, target.day, hour, minute, timeZone);
      }
      return candidate;
    }

    const targetWeekday = schedule.weekday || "monday";
    const targetIndex = Math.max(0, weekdays.indexOf(targetWeekday));
    const todayIndex = weekdays.indexOf(nowParts.weekday);
    let daysSinceTarget = (todayIndex - targetIndex + 7) % 7;
    let target = localDatePlusDays(nowParts, -daysSinceTarget);
    let candidate = zonedTimeToUtc(target.year, target.month, target.day, hour, minute, timeZone);

    if (candidate > now) {
      daysSinceTarget += 7;
      target = localDatePlusDays(nowParts, -daysSinceTarget);
      candidate = zonedTimeToUtc(target.year, target.month, target.day, hour, minute, timeZone);
    }

    return candidate;
  }
}
