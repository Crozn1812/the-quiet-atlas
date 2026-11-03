import type { Locale } from "./locales";
type Messages = { building: string; soundReason: string; projects: string; contact: string; phone: string; home: string; cvPending: string };
export const messages: Record<Locale, Messages> = {
  en: { building: "Under construction", soundReason: "Sound is under construction", projects: "Featured projects", contact: "Contact", phone: "Phone", home: "Welcome", cvPending: "CV is not available yet" },
  vi: { building: "Đang xây dựng", soundReason: "Âm thanh đang xây dựng", projects: "Dự án nổi bật", contact: "Liên hệ", phone: "Điện thoại", home: "Chào mừng", cvPending: "CV chưa có" },
};
