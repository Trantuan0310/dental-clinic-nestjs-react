# 📋 Báo cáo Lỗi Tài liệu Markdown — Dental Clinic Management System

> **Phạm vi:** 67 file `.md` trong toàn bộ repository (loại trừ `node_modules`, `dist`).
> **Kết quả quét ban đầu:** **75 broken links** trong **16 file**, phân thành **6 nhóm lỗi** theo nguyên nhân gốc.
> **Ngày cập nhật:** 22/07/2026 — **đã sửa: 75/75 (100%)**.

---

## ✅ Nhóm 1 — `docs/04_Database/schema-per-module/*.md`: Sai đường dẫn thư mục (−1 cấp) — **ĐÃ SỬA**

**Nguyên nhân:** Các file trong `docs/04_Database/schema-per-module/` sử dụng tiền tố `../ADR/` và `../01_Architecture/`, nhưng các thư mục đó nằm ở `docs/ADR/` và `docs/01_Architecture/` — tức cần lên **2 cấp** (`../../`), không phải 1 cấp (`../`).

| File | Link bị lỗi | Phải sửa thành |
|:---|:---|:---|
| `schema-per-module/auth.md` | `../ADR/0004-permission-based-rbac.md` | `../../ADR/0004-permission-based-rbac.md` |
| `schema-per-module/auth.md` | `../ADR/0005-id-strategy.md` | `../../ADR/0005-id-strategy.md` |
| `schema-per-module/auth.md` | `../ADR/0006-soft-delete.md` | `../../ADR/0006-soft-delete.md` |
| `schema-per-module/auth.md` | `../01_Architecture/actor-permissions-matrix.md` | `../../01_Architecture/actor-permissions-matrix.md` |
| `schema-per-module/appointments.md` | `../01_Architecture/business-decisions.md` (×3) | `../../01_Architecture/business-decisions.md` |
| `schema-per-module/appointments.md` | `../ADR/0007-cross-module-event-bus.md` | `../../ADR/0007-cross-module-event-bus.md` |
| `schema-per-module/billing.md` | `../ADR/0007-cross-module-event-bus.md` (×2) | `../../ADR/0007-cross-module-event-bus.md` |
| `schema-per-module/billing.md` | `../ADR/0008-transactional-encounter-close.md` (×2) | `../../ADR/0008-transactional-encounter-close.md` |
| `schema-per-module/billing.md` | `../01_Architecture/business-decisions.md` | `../../01_Architecture/business-decisions.md` |
| `schema-per-module/inventory.md` | `../ADR/0008-transactional-encounter-close.md` (×2) | `../../ADR/0008-transactional-encounter-close.md` |
| `schema-per-module/inventory.md` | `../01_Architecture/business-decisions.md` | `../../01_Architecture/business-decisions.md` |
| `schema-per-module/medical-records.md` | `../ADR/0008-transactional-encounter-close.md` (×2) | `../../ADR/0008-transactional-encounter-close.md` |
| `schema-per-module/medical-records.md` | `../01_Architecture/business-decisions.md` (×2) | `../../01_Architecture/business-decisions.md` |
| `schema-per-module/patients.md` | `../01_Architecture/business-decisions.md` (×2) | `../../01_Architecture/business-decisions.md` |
| `schema-per-module/patients.md` | `../ADR/0006-soft-delete.md` | `../../ADR/0006-soft-delete.md` |

**Số lỗi:** 25 — ✅ **Đã sửa xong (đã xác nhận lại 22/07/2026, tất cả 25 link đều hợp lệ)**

---

## ✅ Nhóm 2 — `docs/00_Vision/PRODUCT_VISION.md`: Sai đường dẫn thư mục (thừa 1 cấp `../`) — **ĐÃ SỬA**

**Nguyên nhân:** `PRODUCT_VISION.md` nằm ở `docs/00_Vision/`, nhưng link dùng `../../../` (lên 3 cấp = ra ngoài thư mục `ĐATN`). Cần chỉ lên 2 cấp (`../../`).

| Link bị lỗi | Phải sửa thành |
|:---|:---|
| `../../../ROADMAP.md` | `../../ROADMAP.md` |
| `../../../README.md` | `../../README.md` |
| `../../../PROJECT_RULES.md` | `../../PROJECT_RULES.md` |
| `../../../ARCHITECTURE.md` | `../../ARCHITECTURE.md` |
| `../../02_Glossary/GLOSSARY.md` | `../02_Glossary/GLOSSARY.md` |

**Số lỗi:** 5 — ✅ **Đã sửa xong (đã xác nhận lại 22/07/2026, không còn link `../../../` nào)**

---

## ✅ Nhóm 3 — `docs/ADR/*.md`: Sai đường dẫn tới root (thừa 1 cấp `../`) — **ĐÃ SỬA**

**Nguyên nhân:** Các file ADR nằm ở `docs/ADR/`, nhưng link dùng `../../../PROJECT_RULES.md` (lên 3 cấp = ra ngoài `ĐATN`). Cần lên 2 cấp (`../../`). Tương tự cho link đến `GLOSSARY.md`.

| File | Link bị lỗi | Phải sửa thành |
|:---|:---|:---|
| `ADR/0003-patient-is-not-user.md` | `../../02_Glossary/GLOSSARY.md` | `../02_Glossary/GLOSSARY.md` |
| `ADR/0004-permission-based-rbac.md` | `../../02_Glossary/GLOSSARY.md` | `../02_Glossary/GLOSSARY.md` |
| `ADR/0005-id-strategy.md` | `../../../PROJECT_RULES.md` | `../../PROJECT_RULES.md` |
| `ADR/0006-soft-delete.md` | `../../../PROJECT_RULES.md` | `../../PROJECT_RULES.md` |
| `ADR/0007-cross-module-event-bus.md` | `../../../PROJECT_RULES.md` | `../../PROJECT_RULES.md` |

**Số lỗi:** 5 — ✅ **Đã sửa xong (đã xác nhận lại 22/07/2026, không còn link `../../../PROJECT_RULES.md` nào trong các file ADR)**

---

## ✅ Nhóm 4 — `docs/06_UI/design-system.md` & `navigation-map.md`: File component chưa tồn tại — **ĐÃ SỬA**

**Nguyên nhân:** Cả hai file tham chiếu đến các file spec chi tiết của từng UI component (`components/button.md`, `components/input.md`,...), nhưng thư mục `docs/06_UI/components/` **hoàn toàn chưa được tạo**.

| File | Số link bị lỗi | Ví dụ link |
|:---|:---:|:---|
| `docs/06_UI/design-system.md` | 10 | `components/button.md`, `components/modal.md`,... |
| `docs/06_UI/navigation-map.md` | 56 | `components/button.md`, `components/dental-chart.md`,... |

**Danh sách file component thiếu (28 file):** — **ĐÃ TẠO ĐẦY ĐỦ (xác nhận 22/07/2026, 28/28 file tồn tại)**
`button.md`, `input.md`, `select.md`, `textarea.md`, `checkbox.md`, `radio.md`, `date-picker.md`, `file-upload.md`, `form.md`, `data-table.md`, `status-badge.md`, `empty-state.md`, `loading.md`, `error-boundary.md`, `avatar.md`, `tag.md`, `toast.md`, `modal.md`, `confirm-dialog.md`, `alert.md`, `card.md`, `tabs.md`, `accordion.md`, `drawer.md`, `dental-chart.md`, `calendar.md`, `kpi-card.md`, `permission-guard.md`.

> **Ngoài ra:** `navigation-map.md` còn có 2 link `../design-system.md` bị sai vị trí tham chiếu — cần là `design-system.md` (cùng cấp, không cần `../`).

**Số lỗi:** 38 (gộp 2 file) — ✅ **Đã sửa xong: 20 link trong `design-system.md` + 56 link trong `navigation-map.md` đều hợp lệ (xác nhận 22/07/2026)**

---

## ✅ Nhóm 5 — `docs/INDEX.md`: Sai đường dẫn tới `schema.prisma` — **ĐÃ SỬA**

**Nguyên nhân:** `INDEX.md` nằm ở `docs/`, nhưng link dùng `../../backend/prisma/schema.prisma` (lên 2 cấp = ra ngoài `ĐATN`). Cần lên 1 cấp.

| Link bị lỗi | Phải sửa thành |
|:---|:---|
| `../../backend/prisma/schema.prisma` | `../backend/prisma/schema.prisma` |

**Số lỗi:** 1 — ✅ **Đã sửa xong (22/07/2026, link hiển thị trong backticks đã sửa từ `../../backend/prisma/schema.prisma` thành `../backend/prisma/schema.prisma`)**

---

## ✅ Nhóm 6 — `docs/04_Database/erd-overview.md`: Sai đường dẫn tới Spec — **ĐÃ SỬA**

**Nguyên nhân:** `erd-overview.md` nằm ở `docs/04_Database/`, nhưng link dùng `../../03_Specification/Auth/SPEC.md` (lên 2 cấp = `docs/`). Cần lên 1 cấp.

| Link bị lỗi | Phải sửa thành |
|:---|:---|
| `../../03_Specification/Auth/SPEC.md` | `../03_Specification/Auth/SPEC.md` |

**Số lỗi:** 1 — ✅ **Đã sửa xong (xác nhận 22/07/2026, không còn link `../../03_Specification/Auth/SPEC.md` nào)**

---

## 📊 Tổng kết cập nhật (22/07/2026)

| # | Nhóm lỗi | Số file | Số lỗi | Mức độ |
|:---:|:---|:---:|:---:|:---:|
| 1 | `schema-per-module/*.md` — thiếu 1 cấp `../` | 6 | 25 | 🔴 Nghiêm trọng |
| 2 | `PRODUCT_VISION.md` — thừa 1 cấp `../` | 1 | 5 | 🔴 Nghiêm trọng |
| 3 | `ADR/*.md` — thừa 1 cấp `../` | 5 | 5 | 🔴 Nghiêm trọng |
| 4 | `design-system.md` & `navigation-map.md` — file component chưa tồn tại | 2 | 38 | 🟡 Trung bình |
| 5 | `INDEX.md` — sai đường dẫn `schema.prisma` | 1 | 1 | 🟡 Trung bình |
| 6 | `erd-overview.md` — sai đường dẫn Spec | 1 | 1 | 🟡 Trung bình |
| **Tổng** | | **16 file** | **75 lỗi** | ✅ **ĐÃ SỬA 75/75 (100%)** |

---

## 🛠️ Kế hoạch sửa

- ✅ **Nhóm 1, 2, 3, 5, 6 (37 lỗi):** Đã sửa bằng `sed` hoặc thủ công — tất cả link giờ đều đúng cấp `../`.
- ✅ **Nhóm 4 (38 lỗi):** Đã tạo nội dung cho 28 file component spec — tất cả link trong `design-system.md` (20) và `navigation-map.md` (56) đều hợp lệ.

### Trạng thái cuối cùng (22/07/2026)

| # | Nhóm lỗi | Trạng thái |
|---:|:---|:---:|
| 1 | `schema-per-module/*.md` — thiếu 1 cấp `../` | ✅ Đã sửa (25/25) |
| 2 | `PRODUCT_VISION.md` — thừa 1 cấp `../` | ✅ Đã sửa (5/5) |
| 3 | `ADR/*.md` — thừa 1 cấp `../` | ✅ Đã sửa (5/5) |
| 4 | `design-system.md` & `navigation-map.md` — file component chưa tồn tại | ✅ Đã tạo (28/28) |
| 5 | `INDEX.md` — sai đường dẫn `schema.prisma` | ✅ Đã sửa (1/1) |
| 6 | `erd-overview.md` — sai đường dẫn Spec | ✅ Đã sửa (1/1) |
| **Tổng** | | **✅ 75/75 (100%)** |
