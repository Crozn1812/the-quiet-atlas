import type { WorldCopy } from "@/components/portfolio/WorldEntry";
import type { Locale } from "./locales";
type Messages={
  world: WorldCopy;
  building: string;
  soundReason: string;
  projects: string;
  contact: string;
  phone: string;
  home: string;
  cvPending: string;
};
export const messages: Record<Locale,Messages>={
  en: {
    world: {
      unavailable: "Enable JavaScript to check whether this device can enter the world.",
      editorial: "View Editorial",
      webgl2: "WebGL2 is unavailable on this device.",
      pointer: "The world requires a fine pointer, such as a mouse.",
      width: "The world requires a viewport at least 1024 pixels wide.",
      loading: "Loading the world…",
      error: "The world could not load. Retry once or open Quick Portfolio.",
      retry: "Try again",
      leave: "Exit world",
      scene: "Physics test scene — WASD to move",
      soundReason: "Sound is under construction"
    },
    building: "Under construction",
    soundReason: "Sound is under construction",
    projects: "Featured projects",
    contact: "Contact",
    phone: "Phone",
    home: "Welcome",
    cvPending: "CV is not available yet"
  },
  vi: {
    world: {
      unavailable: "Bật JavaScript để kiểm tra thiết bị có thể vào thế giới hay không.",
      editorial: "Xem bản Editorial",
      webgl2: "Thiết bị này không có WebGL2.",
      pointer: "Thế giới cần thiết bị trỏ chính xác, như chuột.",
      width: "Thế giới cần khung nhìn rộng ít nhất 1024 pixel.",
      loading: "Đang tải thế giới…",
      error: "Không tải được thế giới. Thử lại một lần hoặc mở Quick Portfolio.",
      retry: "Thử lại",
      leave: "Thoát world",
      scene: "Cảnh thử physics — di chuyển bằng WASD",
      soundReason: "Âm thanh đang xây dựng"
    },
    building: "Đang xây dựng",
    soundReason: "Âm thanh đang xây dựng",
    projects: "Dự án nổi bật",
    contact: "Liên hệ",
    phone: "Điện thoại",
    home: "Chào mừng",
    cvPending: "CV chưa có"
  },
};
