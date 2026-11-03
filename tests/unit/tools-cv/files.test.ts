import { afterEach, expect, it, vi } from "vitest";
import { cvFiles } from "../../../tools/cv/files.mjs";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

it("shares versioned EN/VI filenames and rejects invalid calendar dates", () => {
  vi.stubEnv("CV_VERSION_DATE", "2026-11-04");
  expect(cvFiles()).toEqual({
    en: "/cv/cv-nguyen-huu-bao-duy-en-2026-11-04.pdf",
    vi: "/cv/cv-nguyen-huu-bao-duy-vi-2026-11-04.pdf",
  });
  for (const date of ["2026-02-30", "2026-13-01", "2026-1-01", ""]) {
    expect(() => cvFiles(date)).toThrow("Invalid CV_VERSION_DATE");
  }
});

it("defaults to the current UTC date when the environment is absent", () => {
  vi.stubEnv("CV_VERSION_DATE", undefined);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-04T23:59:59Z"));
  expect(cvFiles().en).toBe("/cv/cv-nguyen-huu-bao-duy-en-2026-11-04.pdf");
});
