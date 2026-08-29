# DentalChart Component

> **Status:** Implemented (Phase 7 — Medical Records UI) + Tooth Detail (Phase 7.5). Updated 2026-07-25.
>
> Pick-2 nâng cấp dựa trên spec gốc: auto-save, undo/redo, bulk actions, filter highlight, quick-jump giữa Sơ đồ răng ↔ Phiếu điều trị, **Tooth Detail drawer** cho răng có vấn đề.

## Purpose

Interactive 32-tooth dental chart picker cho phép bác sĩ cập nhật tình trạng răng trong 1 encounter hiện tại (theo SPEC MedicalRecords §5.1, BR-MR-006/007/008/019).

## Props

```typescript
interface DentalChartPanelProps {
  encounter: Encounter;
  isLocked: boolean;
  highlightToothNumbers?: number[];     // răng có treatment line trong encounter
  focusToothNumber?: number | null;      // cha truyền để scroll & focus răng cụ thể
  onSwitchToTreatmentTab?: (tooth: number) => void;  // quick-jump sang tab Điều trị
  onViewToothDetail?: (tooth: number) => void;       // mở drawer lịch sử răng ở page-level
  patientId?: string;                                // override patientId (mặc định = encounter.patientId)
}
```

```typescript
type ToothStatus =
  | 'healthy'
  | 'cavity'
  | 'filled'
  | 'crowned'
  | 'missing'
  | 'implant'
  | 'extraction_needed';

interface ToothEntry { status: ToothStatus; notes?: string }
```

## FDI Tooth Notation

- Adult (mặc định): 32 răng vĩnh viễn (FDI 11–18, 21–28, 31–38, 41–48).
- Child: 20 răng sữa (FDI 51–55, 61–65, 71–75, 81–85) — dự phòng cho Phase sau (BE đã có enum `PatientType`, FE đang hard-code `ADULT` trong payload; sẽ nâng cấp khi có yêu cầu UI).

## Bố cục hiển thị

```
Hàm trên:  18 17 16 15 14 13 12 11 | 21 22 23 24 25 26 27 28
Hàm dưới:  48 47 46 45 44 43 42 41 | 31 32 33 34 35 36 37 38
```

Mỗi ô hiển thị số FDI theo màu theo status; ô có `data-fdi` & `data-status` để dễ test.

## Trạng thái (palette)

| Status              | Màu (Tailwind)            | Use case                                       |
| ------------------- | ------------------------- | ---------------------------------------------- |
| `healthy`           | `emerald-50 / -700`       | Mặc định                                       |
| `cavity`            | `amber-50 / -700`         | Sâu răng                                       |
| `filled`            | `blue-50 / -700`          | Đã hàn                                         |
| `crowned`           | `indigo-50 / -700`        | Bọc mão                                        |
| `missing`           | `gray-100 / -500`         | Đã nhổ (BR-MR-009: cấm thêm treatment mới)     |
| `implant`           | `purple-50 / -700`        | Implant                                        |
| `extraction_needed` | `red-50 / -700`           | Cần nhổ                                        |

> Status mới (`watch`, `root_canal`, `bridge`, …) đã có trong SPEC §5.1 nhưng chưa bật palette trên FE. Khi backend mở rộng enum whitelist sẽ bổ sung cùng đợt.

## Tính năng

1. **Picker modal**: bấm vào răng mở modal chọn `status` + `notes` (≤200 ký tự). Răng đã có treatment line trong encounter → mở popover liệt kê điều trị, có nút nhảy nhanh sang tab Điều trị (`onSwitchToTreatmentTab`).
2. **Auto-save debounce 1.5s**: gọi `PUT /encounters/:id/dental-chart` với payload `{ patientType, teeth: Array<{ number, surface, notes }> }` (xem `snapshotToWire`). Backend tự merge với snapshot trước (BR-MR-006/008).
3. **Undo/Redo** (`useHistory` hook, tối đa 50 step). Phím tắt: `Ctrl+Z` / `Ctrl+Y` (gắn ngoài component nếu cần).
4. **Bulk actions**: đặt trạng thái cho 1 quadrant (Q1/Q2/Q3/Q4), toàn hàm (upper/lower), hoặc tất cả răng hiện đang bị lọc. Mỗi bulk đẩy 1 step vào history.
5. **Filter highlight**: toggle từng status để làm mờ (`opacity-30`) các răng có trạng thái bị tắt; tổng số răng theo trạng thái hiển thị ở summary cards bên dưới (mờ khi status bị tắt).
6. **Quick-jump**:
   - Tab *Điều trị* → bấm nhãn răng ở header strip → chuyển sang tab *Dental Chart* và `focusToothNumber` được set → component scroll + focus răng đó.
   - Tab *Dental Chart* → bấm răng có treatment → popover "Thêm điều trị cho răng này" → `onSwitchToTreatmentTab` được gọi → chuyển sang tab *Điều trị* với modal mở sẵn `toothNumber` (xem `TreatmentsTab.initialToothNumber`).
7. **Tìm răng nhanh**: ô search ở header. Nhập FDI (vd. `16`) hoặc tên răng (`Hàm 16`) → các răng không khớp bị dim, răng khớp giữ nguyên + Enter sẽ focus vào răng đầu tiên khớp.
8. **Reset**: đưa toàn bộ 32 răng về `healthy` (ghi 1 bước undo).
9. **Tooth Detail (lịch sử điều trị đầy đủ theo răng)**:
   - Bấm vào **răng có status ≠ healthy** (cavity / filled / crowned / missing / implant / extraction_needed) trong panel → mở `ToothDetailDrawer` ở page-level.
   - Răng có treatment line trong encounter hiện tại → popover có thêm nút **"Xem lịch sử răng"** để mở drawer.
   - Trong tab *Điều trị*, mỗi nhóm răng có link **"Xem lịch sử răng →"** ở header → mở drawer.
   - Drawer hiển thị: status hiện tại, badge mức độ (Bình thường / Cần theo dõi / Nghiêm trọng), 3 stat (số lần điều trị / số encounter có điều trị / số lần thay đổi status), 3 tab:
     - **Tổng quan**: timeline thay đổi status (sắp xếp mới nhất), danh sách treatment đã thực hiện.
     - **Lịch sử điều trị**: chi tiết từng encounter (ngày, BS, danh sách dòng điều trị, tổng tiền).
     - **Kế hoạch tiếp theo**: encounter đang `in_progress` có treatment/plan nhắc tới răng này.
   - Nguồn dữ liệu: `useToothHistory(patientId, fdi)` — gọi `GET /patients/:id/encounters` (paginated top 50) rồi fan-out `GET /encounters/:id` cho từng encounter để có `treatments` + `dentalChart` + `clinicalNote`. TanStack Query cache kết quả xuyên encounter → lần mở răng thứ 2 gần như tức thì.
   - AI placeholder: hiện không gọi AI; badge "Suy luận từ treatment" ở timeline khi status được suy ra từ treatment code (fallback) — đây là điểm mở để thay bằng AI summary ở Phase sau.

## Persistence & API

- Mỗi encounter có đúng 1 snapshot (BD-0005).
- `GET /encounters/:id/dental-chart` trả `{ id, encounterId, patientType?, teeth: Record<fdi, { status, notes }>, snapshotAt }`.
- `PUT /encounters/:id/dental-chart` nhận `{ patientType, teeth: Array<{ number, surface, notes }> }`. Service tự merge với snapshot trước.
- Idempotency: client không gửi `Idempotency-Key` cho dental-chart hiện tại; backend đã xử lý overwrite an toàn (không có side effect).
- Auto-save lỗi sẽ hiển thị toast lỗi và giữ nguyên state local — người dùng có thể bấm "Lưu ngay" để retry.

## Accessibility

- Mỗi nút răng có `aria-label="${name}, ${statusLabel}"` và `title` chi tiết.
- Modal/popover dùng `Modal` chuẩn (focus trap, ESC đóng).
- Bộ lọc trạng thái dùng `aria-pressed`.
- Quick-jump set `focus()` vào nút răng, người dùng keyboard có thể Tab tiếp.

## Quan hệ với các module khác

- `Encounter.treatments` được đọc để highlight răng đã điều trị + cảnh báo khi răng `missing` mà vẫn có treatment (UI chỉ cảnh báo, BE đã validate BR-MR-009).
- Khi `encounter.status === 'completed'` → `isLocked = true` → mọi handler bị disable, modal/popover không mở.
- `ToothDetailDrawer` mount ở `EncounterDetailPage` (page-level) nên tồn tại xuyên suốt khi chuyển tab. Quick-jump "Thêm điều trị cho răng này" trong drawer sẽ đặt `initialTreatmentTooth` rồi chuyển sang tab *Điều trị* (tương tự flow popover).

## Self-review checklist (Phase 7 update)

- [x] Auto-save có debounce 1.5s, retry qua nút "Lưu ngay".
- [x] Undo/Redo giới hạn 50 step (BR history).
- [x] Bulk actions đẩy 1 step undo (đúng semantics "thuận tiện nhưng reversible").
- [x] Không phá `DentalChartTab` cũ (giữ nguyên trong tree để không vỡ import ngoài ý muốn).
- [x] Wire payload đúng DTO `DentalChartDataDto` (xem `snapshotToWire`).
- [x] Không sửa backend schema / spec BR — chỉ nâng cấp UX.
- [x] Filter highlight không xóa răng khỏi DOM (vẫn giữ focus order & a11y).
- [x] Read-only khi encounter closed.
- [x] TypeScript: tsc sạch (trừ lỗi pre-existing ở `Sidebar.tsx`).

## Self-review checklist (Tooth Detail — Phase 7.5)

- [x] Răng có vấn đề (status ≠ healthy) → drawer, không mở modal chỉnh status.
- [x] Răng có treatment → popover có thêm nút "Xem lịch sử răng".
- [x] Tab Điều trị → mỗi nhóm răng có link "Xem lịch sử răng" mở drawer.
- [x] Drawer mount ở page-level → sống xuyên các tab (giữ state khi chuyển).
- [x] Quick-jump `onAddTreatment` của drawer gọi `onSwitchToTreatmentTab` → tận dụng pipeline `initialToothNumber` đã có.
- [x] `useToothHistory` dùng `useQueries` (TanStack Query) → cache 60s, song song, có skeleton khi loading.
- [x] Timeline chấp nhận cả 2 schema response (array vs dict) mà dental-chart backend trả về (defensive).
- [x] Status suy ra từ treatment code chỉ là fallback, gắn cờ trong UI (placeholder cho AI summary sau).
- [x] Không thêm endpoint backend mới — chỉ lắp ghép từ GET /encounters + /encounters/:id có sẵn.

## Liên kết

- Design system: [`../design-system.md`](../design-system.md)
- Medical Records: [`../../03_Specification/MedicalRecords/SPEC.md`](../../03_Specification/MedicalRecords/SPEC.md)
- Component: [`frontend/src/features/medical-records/DentalChartPanel.tsx`](../../../frontend/src/features/medical-records/DentalChartPanel.tsx)
- Hook: [`frontend/src/features/medical-records/hooks/useHistory.ts`](../../../frontend/src/features/medical-records/hooks/useHistory.ts)
- Tooth Detail Drawer: [`frontend/src/features/medical-records/ToothDetailDrawer.tsx`](../../../frontend/src/features/medical-records/ToothDetailDrawer.tsx)
- Hook: [`frontend/src/features/medical-records/hooks/useToothHistory.ts`](../../../frontend/src/features/medical-records/hooks/useToothHistory.ts)