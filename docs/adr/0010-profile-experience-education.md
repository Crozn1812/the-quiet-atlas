# ADR 0010 — Hồ sơ: kinh nghiệm và học vấn trong schema nội dung

- Trạng thái: **Accepted** (Lead, 2026-11-04, đợt 11) — duyệt đề xuất của L2-010
- Spec: §1.1 (không bịa), §2 (Welcome/Quick: vai trò, cấp độ), §4.1 (hợp đồng dữ liệu), §4.4 (CV)

## Bối cảnh

Duy cho phép nêu tên HPT (Intern từ 07/2026) và CV ghi học vấn PTIT (dự kiến 2027). `profileSchema` chưa có trường cho hai mục này nên dữ liệu đang nằm ở `drafts.ts`, không lên web/CV.

## Quyết định

Thêm vào `profileSchema` (mỗi locale một bản, nội dung song ngữ như các trường khác):

```ts
experience: z.array(z.object({
  employer: text,                       // "HPT"
  title: text,                          // "Cloud & DevOps Intern"
  start: z.string().regex(/^\d{4}-\d{2}$/),          // "2026-07"
  end: z.union([z.literal("present"), z.string().regex(/^\d{4}-\d{2}$/), z.literal("TBD")]),
  summary: text,                        // có thể "TBD"
  evidence: z.array(z.string()),        // id trong evidence.json, có thể rỗng
})).default([]),
education: z.array(z.object({
  institution: text,                    // "Posts and Telecommunications Institute of Technology (PTIT)"
  program: text,                        // theo CV
  expectedGraduation: z.string().regex(/^\d{4}$/),   // "2027"
  status: z.enum(["in-progress", "graduated"]),
})).default([]),
```

- Không tính thời lượng ("6 tháng") trong dữ liệu; renderer chỉ in khoảng thời gian `start – end`.
- `end: "present"` hiển thị "nay"/"present".
- Mỗi mục vẫn chịu `reviewStatus` của profile (draft không lên production như "completed").
- **Không** thêm `upstreamUrl`/`attribution` cho project ở ADR này — chờ Duy trả lời Q-17.

### Bổ sung khi triển khai (L2-011, Lead chấp nhận)

- Tháng chặt hơn: `^\d{4}-(0[1-9]|1[0-2])$`.
- `superRefine`: `end` không trước `start`; id trong `evidence` phải có trong ledger.

## Người làm

- L2: schema + dữ liệu + validator + CV (`tools/cv/`).
- L1: hiển thị ở Quick Portfolio (ticket riêng sau khi L2 merge).

## Hệ quả

Đổi tên/kiểu trường phải qua ADR mới.

## Mở rộng 2026-11-04 (đợt 12): evidence song ngữ

Bối cảnh: `claim`/`scope`/`description` trong `evidence.json` viết bằng tiếng Việt nên trang Quick EN hiện câu tiếng Việt.

Quyết định (hợp đồng L2 ↔ L1):

```ts
// evidenceSchema — thêm 3 trường TÙY CHỌN; trường gốc giữ nguyên nghĩa là bản tiếng Việt
claimEn: text.optional(),
scopeEn: text.optional(),
descriptionEn: text.optional(),
```

- L2: mọi evidence có `level` khác `TBD` phải có đủ `claimEn` và `scopeEn` (kiểm trong `superRefine`); `descriptionEn` khuyến khích.
- L1: khi locale là `en`, hiển thị `claimEn ?? claim`, `scopeEn ?? scope`; `vi` dùng trường gốc.
- Không đổi `id`, không đổi `level`.

## Ghi công InsightHub (trả lời Q-17)

Duy chọn trình bày bối cảnh bản triển khai từ repo của giảng viên, chỉ ghi "InsightHub", không nêu tên repo gốc. Vì vậy **không** thêm `upstreamUrl`/`attribution`.
