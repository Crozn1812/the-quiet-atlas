// Never imported by public content or page renderers.
export const experienceDraft = {
  // Duy (2026-11-04): thực tập dự án Azure từ 07/2026, dự kiến hoàn thành lộ trình 12/2026.
  // Tới 11/2026 là ~4 tháng; "6 tháng" chỉ đúng sau khi hoàn thành 12/2026 — không đưa lên public trước đó.
  claim: "Thực tập 07/2026 – dự kiến 12/2026",
  source: "Duy, chat 2026-11-04",
  evidence: "TBD",
  // HPT và PTIT đã chuyển sang profile.experience / profile.education (ADR 0010); không ghi "6 tháng".
  levelNow: "Intern",
  levelTargetAfterInternship: "Fresher/Junior (chỉ đổi khi Duy xác nhận đã hoàn thành)",
  reviewStatus: "draft",
} as const;
