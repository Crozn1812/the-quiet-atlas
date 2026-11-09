## RC-11 — Cache inverse matrix cho chọn tán che camera
- Trạng thái: review (chưa commit/merge).
- Vùng file: src/features/world/foliage/instances.ts; tests/unit/world/foliage.test.ts.
- Mục tiêu: giảm việc đảo matrix lặp mỗi frame mà không đổi ba sight segment, bounds, tập cây được fade, geometry hay quality.
- Sửa: WeakMap theo InstancedMesh lưu inverse(world * instance). Cache đổi khi instanceMatrix identity/version/count hoặc matrixWorld đổi. Snapshot số liệu matrix từng instance còn phát hiện setMatrixAt/direct CPU edit chưa đánh needsUpdate; chỉ inverse lại instance thay đổi trong trường hợp đó.
- Không đổi phép tính inverse hoặc kiểm tra giao box; camera/player chuyển động chỉ dùng lại inverse static và chạy lại sight segment như trước.
- Unit: khẳng định hit/miss cùng tập index, không gọi invert trên frame static/camera motion; đổi pose không version, sửa array trực tiếp, version update, quality compaction/count0/count trở lại, parent translate+rotate, thay attribute cùng version.
- Đã chạy: Vitest foliage + foliage-light 23/23 PASS; ESLint hai file 0 warning exit0; typecheck exit0; diff-check exit0.
- Không build/browser/benchmark ở worker. Lead cần gate và CPU hai lượt mỗi bản + kiểm ảnh; chưa kết luận đạt trần +10ms/s.
