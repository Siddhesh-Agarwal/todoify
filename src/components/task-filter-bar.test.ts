import { describe, it, expect } from "vitest";
import { computeDuePreset } from "./task-filter-bar";
import type { TaskListQuery } from "@/lib/schemas/task";

function ymd(d: Date) { return d.toISOString().slice(0, 10); }

describe("computeDuePreset", () => {
  const base: TaskListQuery = { page: 1, pageSize: 50, sort: "priority" };

  it("returns 'none' when no due dates", () => {
    expect(computeDuePreset(base)).toBe("none");
  });

  it("returns 'overdue' when only due_before is yesterday", () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    expect(computeDuePreset({ ...base, due_before: ymd(yesterday) })).toBe("overdue");
  });

  it("returns 'today' when due_after and due_before are both today", () => {
    const today = new Date();
    expect(computeDuePreset({ ...base, due_after: ymd(today), due_before: ymd(today) })).toBe("today");
  });

  it("returns 'week' when due_after is today and due_before is today+7", () => {
    const today = new Date();
    const week = new Date(today); week.setUTCDate(week.getUTCDate() + 7);
    expect(computeDuePreset({ ...base, due_after: ymd(today), due_before: ymd(week) })).toBe("week");
  });

  it("returns 'next' when due_after is today+7 and due_before is today+14", () => {
    const today = new Date();
    const week = new Date(today); week.setUTCDate(week.getUTCDate() + 7);
    const next = new Date(week); next.setUTCDate(next.getUTCDate() + 7);
    expect(computeDuePreset({ ...base, due_after: ymd(week), due_before: ymd(next) })).toBe("next");
  });

  it("returns 'custom' for arbitrary date ranges", () => {
    expect(computeDuePreset({ ...base, due_after: "2025-01-01", due_before: "2025-01-31" })).toBe("custom");
  });
});
