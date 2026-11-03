export function cvFiles(date = process.env.CV_VERSION_DATE ?? new Date().toISOString().slice(0, 10)) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new Error("Invalid CV_VERSION_DATE: expected a valid YYYY-MM-DD date");
  }
  return {
    en: `/cv/cv-nguyen-huu-bao-duy-en-${date}.pdf`,
    vi: `/cv/cv-nguyen-huu-bao-duy-vi-${date}.pdf`,
  };
}
