# Runbook — Công cụ pipeline asset (ADR 0012, 0013)

Cài 2026-11-05 trên máy dev (Lead, theo toàn quyền công cụ ở ADR 0012).

| Công cụ | Phiên bản | Nguồn | Kiểm tra nguồn | Giấy phép | Dùng cho |
|---|---|---|---|---|---|
| Blender | 5.2.3 | winget `BlenderFoundation.Blender` (source `winget`) | manifest winget | GPL-3.0 (công cụ; file `.blend`/glTF xuất ra thuộc người tạo) | Dựng/xuất mô hình headless `blender -b -P script.py` |
| KTX-Software (`ktx`, `toktx`) | 4.4.2 | github.com/KhronosGroup/KTX-Software release v4.4.2, `KTX-Software-4.4.2-Windows-x64.exe` | Authenticode **Valid**, ký bởi The Khronos Group Inc; SHA-256 `1F323B0FEC19794F5E6C0425A61D4B1DA396872A10BE862D105F4F4B2D2957FE` | Apache-2.0 | Nén texture KTX2 (ETC1S/UASTC) |
| FFmpeg | 9.0.2 | winget `Gyan.FFmpeg` | manifest winget | GPL (công cụ) | Video showcase |
| `@gltf-transform/cli`, `core`, `functions`, `extensions` | 4.5.1 (ghim chính xác) | npm, devDependency | lockfile | MIT | meshopt, prune, dedup, KTX2 |
| `meshoptimizer` | 1.3.0 (ghim) | npm, devDependency | lockfile | MIT | encoder/decoder meshopt |

Đường dẫn: `C:\Program Files\KTX-Software\bin\` (có trong PATH sau khi cài), Blender `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`.

## Quy tắc

- Công cụ GPL chỉ là công cụ; không đóng gói vào web.
- Không commit file nguồn của asset bên thứ ba khi giấy phép không cho phân phối nguồn (vd. Mixamo). Asset tự tạo bằng script bpy trong repo: commit script, không commit output trung gian lớn.
- Codex sandbox có thể không chạy được Blender/GPU → ticket cần Blender do Lead hoặc subagent chạy, Codex chỉ viết script + test phần Node.

## Blender MCP + Poly Haven (Duy chọn 2026-11-12)

- MCP server `blender-mcp` 1.30.0 (PyPI, repo `ahujasid/blender-mcp`) chạy bằng uv 0.13.7 (winget `astral-sh.uv`) với Python 3.12.16 do uv quản lý.
- Windows Application Control chặn shim `blender-mcp.exe` nên lệnh phải là `uvx --python <python 3.12.16> --from blender-mcp python -c "from blender_mcp.server import main; main()"`. Biến `DISABLE_TELEMETRY=true`.
- Đã đăng ký: Claude (`~/.claude.json` → `mcpServers.blender`) và Codex (`~/.codex/config.toml` → `[mcp_servers.blender]`).
- Add-on Blender: `tmp/blender-mcp/addon.py` (334 497 byte, SHA-256 `35e5f317b932d15b485a37d914f7c9d7b527c7ea527f526569c1c111e5f39a05`, tải 2026-11-12 từ nhánh main). Lead đã rà: chỉ mở cổng trên localhost, telemetry tắt mặc định, Hyper3D/Meshy/Tripo/premium chỉ chạy khi tự bật và nhập key; có `exec` để chạy code Python trong Blender (tính năng chính).
- Cách dùng: mở Blender, bấm N, mở tab BlenderMCP, tick **Poly Haven** (không bật Hyper3D, không bật telemetry), bấm **Connect to MCP server**. Asset Poly Haven là CC0; mỗi file đưa vào `public/` phải có dòng trong `assets/LICENSES.csv` (ghi nguồn Poly Haven, CC0, tên asset).
