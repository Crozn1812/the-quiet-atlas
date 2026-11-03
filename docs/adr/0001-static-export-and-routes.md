# ADR 0001 — Static export và routes

- Trạng thái: **Proposed** (chờ khởi tạo repo để chốt phiên bản)
- Ngày: 2026-11-03
- Spec: §5, §6.3, §11.2

## Bối cảnh

Site phải host trên S3 private + CloudFront Free plan, không có Next runtime, không Lambda@Edge. Nội dung nghề nghiệp phải đọc được khi tắt JS/WebGL. Chunk 3D không được tải trước Enter World.

## Quyết định

1. Next.js App Router + React + TypeScript, `output: 'export'`, `trailingSlash: true`, `images: { unoptimized: true }`. Ảnh tối ưu trước lúc build.
2. Không dùng API routes, middleware, SSR, Intercepting Routes, image optimizer mặc định.
3. Locale bằng route tường minh `/en/`, `/vi/`, dựng qua `generateStaticParams`; `dynamicParams = false`.
4. Bảng route:

| Route | Ghi chú |
|---|---|
| `/` | Trang vào tiếng Anh nhẹ, canonical `/en/`, link EN/VI, chạy khi tắt JS; banner gợi ý VI nếu `navigator.language` bắt đầu bằng `vi`, không tự chuyển |
| `/{locale}/` | Welcome **và** shell thế giới; Enter World lazy-load chunk 3D trong cùng document, không điều hướng |
| `/{locale}/quick/` | Quick Portfolio, bản mobile/fallback/SEO chính |
| `/{locale}/projects/{slug}/` | Case study dựng sẵn |
| `/{locale}/privacy/` | Privacy |
| `/cv/` | CV PDF hai ngôn ngữ |
| `/404.html` | Lỗi có lối về |
| `/sitemap.xml`, `/robots.txt` | Sinh lúc build từ `SITE_URL` |

5. Ranh giới 3D: `src/features/world` chỉ được nạp qua `import()` động sau Enter World. Không import từ `src/app/**/layout.tsx`, barrel dùng chung hay `components/portfolio`. Nghiệm thu bằng network trace + bundle analysis (Q18), không chỉ đọc code.
6. Đổi ngôn ngữ trong thế giới dùng `history.replaceState`, không remount Canvas.
7. Hosting: CloudFront Function viewer-request rewrite thư mục → `index.html`, 301 thêm slash; 403/404 từ S3 → `/404.html` mã 404.

## Đánh đổi

- Không có middleware → không tự chuyển locale theo header; chấp nhận, dùng banner.
- `trailingSlash: true` cần function rewrite ở CDN; đổi lại URL ổn định, khớp S3 key `.../index.html`.

## Xem xét lại khi

- Next.js thay đổi hành vi static export ở phiên bản được ghim.
- Cần tính năng chỉ có ở runtime (khi đó ghi ADR mới, không lén thêm).

## Việc còn mở

- Ghim phiên bản Next/React cụ thể khi tạo repo (blocker: chưa có Node).
