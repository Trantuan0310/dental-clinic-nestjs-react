# Dentist Screens

> **Role:** Dentist (Bác sĩ)
> **Permission:** `patient.read.medical_history`, `encounter.*`, `treatment.*`, `prescription.*`, `clinical_note.*`, `dental_chart.upsert`, `appointment.read` (own only)
> **File này:** Wireframe + flow cho các màn hình Bác sĩ.
> **Tham chiếu:** [`design-system.md`](../design-system.md) + [`medical-records.md`](../../05_API/medical-records.md) + [`appointments.md`](../../05_API/appointments.md).
> **Ngày tạo:** 2026-07-13

---

## Sidebar cho Dentist

```
┌────────────────────────────┐
│ ClinicFlow          [≡]    │
├────────────────────────────┤
│ 🏠 Hôm nay                  │
│                            │
│ LÂM SÀNG                    │
│ 📋 Hàng chờ của tôi         │
│ 👤 Bệnh nhân của tôi        │
│                            │
│ TRA CỨU                     │
│ 📅 Lịch hẹn của tôi         │
│                            │
│ ─────────────────────────  │
│ 👤 Hồ sơ cá nhân          │
│ 🚪 Đăng xuất              │
└────────────────────────────┘
```

> Dentist thấy **ít menu hơn** Admin/Receptionist. Tập trung vào workflow khám bệnh.
> Không thấy: Hóa đơn, Thanh toán, Kho (trừ dashboard badge low-stock).

---

## Workflow chính của Dentist

```
                    ┌─────────────────┐
                    │ Mở app đầu giờ │
                    └────────┬────────┘
                             │
                             ▼
                  ┌─────────────────┐
                  │ Xem "Hôm nay"  │
                  │ (calendar)      │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ BN đến phòng khám│
                  │ (Receptionist đã │
                  │  check-in xong)  │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Mở Encounter    │
                  │ (khám bệnh)     │
                  └────────┬────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
         ┌─────────┐  ┌─────────┐  ┌─────────┐
         │ Ghi chú │  │ Điều trị│  │ Đơn thuốc│
         │ LS      │  │ (Răng) │  │         │
         └────┬────┘  └────┬────┘  └────┬────┘
              │            │            │
              └────────────┼────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Cập nhật        │
                  │ Dental Chart    │
                  │ (32 răng)       │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Đóng Encounter  │
                  │ (auto tạo HĐ + │
                  │  stock-out)     │
                  └─────────────────┘
```

---

## Screen 1: Today (Calendar view của Dentist)

**Path:** `/today`
**Permission:** Authenticated (filtered to own)

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ Hôm nay — Thứ Hai 13/07/2026         [< Hôm qua] [>]  │
├──────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│  │ Hẹn: 12  │ │ Check-in │ │ Đã khám  │                │
│  │          │ │    3     │ │    5     │                │
│  └──────────┘ └──────────┘ └──────────┘                │
│                                                          │
│  Timeline:                                               │
│                                                          │
│  09:00 ┌─ Nguyễn Văn A ──────────────────────┐         │
│        │ ⭐ ĐANG KHÁM (Encounter #ENC-045)   │         │
│        │ Check-in 08:50                       │         │
│        │ [Tiếp tục khám →]                    │         │
│        └───────────────────────────────────────┘         │
│                                                          │
│  09:30 ┌─ Trần Thị B ────────────────────────┐         │
│        │ 🟢 Confirmed                          │         │
│        │ Lý do: Tái khám sau nhổ răng         │         │
│        │ [Bắt đầu khám →]                      │         │
│        └───────────────────────────────────────┘         │
│                                                          │
│  10:00 ┌─ Lê Văn C ──────────────────────────┐         │
│        │ 🟡 Scheduled                          │         │
│        │ Lý do: Hàn răng                       │         │
│        │ [Bắt đầu khám →]                      │         │
│        └───────────────────────────────────────┘         │
│                                                          │
│  10:30 ┌─ Phạm Thị D ────────────────────────┐         │
│        │ ✅ Completed                          │         │
│        │ Summary: Hàn composite răng 26       │         │
│        │ [Xem chi tiết]                        │         │
│        └───────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────┘
```

### Behavior

- Auto-load today's appointments: `GET /appointments?dentistId=me&date=today`
- Sort theo `startAt:asc`
- Status colors như receptionist calendar
- "Bắt đầu khám" → `POST /encounters` → chuyển sang screen Encounter Detail
- "Tiếp tục khám" → resume encounter hiện tại

---

## Screen 2: My Queue (Hàng chờ của tôi)

**Path:** `/my-queue`
**Permission:** Authenticated (own only)

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ Hàng chờ của tôi                     [🔄 Auto-refresh]  │
├──────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────┐  │
│ │ #1 — Trần Thị B                                  │  │
│ │ ──────────────────────────────────────────────   │  │
│ │ ⏱ Chờ: 25 phút                                   │  │
│ │ APT-2026-00124 • Check-in 09:20                  │  │
│ │ Lý do khám: Tái khám sau nhổ răng                │  │
│ │ Allergies: ⚠ Penicillin                           │  │
│ │ [Bắt đầu khám →]                                  │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ ┌────────────────────────────────────────────────────┐  │
│ │ #2 — Lê Văn C                                     │  │
│ │ ⏱ Chờ: 5 phút                                     │  │
│ │ APT-2026-00125 • Check-in 09:50                   │  │
│ │ Lý do khám: Hàn răng                              │  │
│ │ Allergies: —                                       │  │
│ │ [Bắt đầu khám →]                                  │  │
│ └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

> FIFO order theo `check_in_at:asc` (BD-0001).

---

## Screen 3: My Patients

**Path:** `/my-patients`
**Permission:** `patient.read.medical_history`

> Chỉ hiện BN đã từng khám với BS hiện tại (row-level filter BR-PT-021).

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ Bệnh nhân của tôi                                       │
├──────────────────────────────────────────────────────────┤
│ [🔍 Tìm tên, SĐT...]              [Filter ▼]           │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐│
│ │ Mã BN       │ Tên        │ Lần cuối │ Trạng thái  ││
│ ├──────────────────────────────────────────────────────┤│
│ │ PAT-12     │ Nguyễn V.A│ 2026-06-15│ 🟢 Active   ││
│ │ PAT-45     │ Trần T.B  │ 2026-07-01│ 🟢 Active   ││
│ │ PAT-78     │ Lê V.C    │ 2026-05-20│ ⚪ Inactive ││
│ └──────────────────────────────────────────────────────┘│
│                                                          │
│              « 1 2 3 ... 8 »        20 / trang  ▼       │
└──────────────────────────────────────────────────────────┘
```

### Behavior

- Click row → Patient Detail (Medical Records focus)

---

## Screen 4: Patient Detail (Medical Records view)

**Path:** `/my-patients/:id`
**Permission:** `patient.read.medical_history`

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ ← Quay lại    Nguyễn Văn A  (PAT-2026-00012)            │
├──────────────────────────────────────────────────────────┤
│ ┌──────────┐  ┌────────────────────────────────────────┐│
│ │ [Avatar] │  │ Nguyễn Văn A  •  36 tuổi  •  Nam      ││
│ │          │  │ SĐT: 0912345678                        ││
│ └──────────┘  │ DOB: 1990-05-12                        ││
│               └────────────────────────────────────────┘│
│                                                          │
│ ⚠ ALERT: Dị ứng Penicillin                              │
│ Bệnh mãn tính: Tăng huyết áp                            │
│ Thuốc hiện tại: Amlodipine 5mg                          │
│                                                          │
│ [Tabs: Lịch sử khám | Dental Chart | Hóa đơn]          │
│ ────────────────────────────────────────────────       │
│                                                          │
│ ┌─ Lịch sử khám ──────────────────────────────────┐    │
│ │ 2026-07-15 • BS. Trần C                          │    │
│ │ ────────────────────────────────────────────     │    │
│ │ Lý do: Hàn răng định kỳ                         │    │
│ │ Treatments: Hàn composite răng 16 (150k)         │    │
│ │ Prescriptions: —                                  │    │
│ │ Summary: Hàn răng số 16 bằng Composite A2        │    │
│ │ [Xem chi tiết →]                                  │    │
│ │ ────────────────────────────────────────────     │    │
│ │ 2026-06-15 • BS. Trần C                          │    │
│ │ ...                                               │    │
│ └────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

> **Quan trọng:** Hiển thị "ALERT: Dị ứng ..." ở header để BS thấy NGAY khi mở BN.

---

## Screen 5: Encounter Detail (Trái tim của workflow khám)

**Path:** `/encounters/:id`
**Permission:** `encounter.read` (own)

### Wireframe — Main layout

```
┌──────────────────────────────────────────────────────────┐
│ ← Quay lại   Encounter #ENC-2026-00045                    │
│ BS. Trần C  •  09:00  •  Started 09:05  •  ⏱ 25 phút   │
│ [Bệnh nhân ▼]  [Status: 🟠 In Progress]  [Đóng ▼]      │
├──────────────────────────────────────────────────────────┤
│  ┌─ Cảnh báo y tế ──────────────────────────────────┐  │
│  │ ⚠ Dị ứng: Penicillin                              │  │
│  │ ⚠ Bệnh mãn: Tăng huyết áp                        │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ Tabs ──────────────────────────────────────────┐    │
│  │ [📝 Ghi chú] [🦷 Điều trị] [💊 Đơn thuốc]      │    │
│  │ [📊 Dental Chart] [📋 Tóm tắt]                    │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  (Tab content dưới đây)                                  │
└──────────────────────────────────────────────────────────┘
```

### 5.1 Tab "Ghi chú" (Clinical Notes)

```
┌──────────────────────────────────────────────────────────┐
│ 📝 Ghi chú lâm sàng                    [+ Thêm ghi chú] │
├──────────────────────────────────────────────────────────┤
│ ┌─ Lý do khám (Chief Complaint) ──────────────────┐   │
│ │ "Bệnh nhân đau răng hàm dưới bên phải 2 ngày"    │   │
│ │ Tạo: 09:05 • BS. Trần C                           │   │
│ │ [✏️ Sửa]                                            │   │
│ └────────────────────────────────────────────────────┘   │
│                                                          │
│ ┌─ Chẩn đoán ─────────────────────────────────────┐    │
│ │ "Viêm quanh răng răng 46"                          │   │
│ │ Tạo: 09:15 • BS. Trần C                           │   │
│ │ [✏️ Sửa]                                            │   │
│ └────────────────────────────────────────────────────┘   │
│                                                          │
│ ┌─ Ghi chú tiến triển ─────────────────────────────┐    │
│ │ "BN đáp ứng tốt với thuốc tê. Bắt đầu điều trị." │   │
│ │ Tạo: 09:25 • BS. Trần C                           │   │
│ │ [✏️ Sửa]                                            │   │
│ └────────────────────────────────────────────────────┘   │
│                                                          │
│ [+ Thêm ghi chú ▼]                                      │
│   ├─ Lý do khám                                         │
│   ├─ Chẩn đoán                                         │
│   ├─ Ghi chú tiến triển                                │
│   └─ Khác                                              │
└──────────────────────────────────────────────────────────┘
```

### 5.2 Tab "Điều trị" (Treatments)

```
┌──────────────────────────────────────────────────────────┐
│ 🦷 Điều trị                            [+ Thêm điều trị]│
├──────────────────────────────────────────────────────────┤
│ ┌─ Răng 16 ──────────────────────────────────────┐     │
│ │ Hàn răng Composite • Mã: D2392                  │     │
│ │ SL: 1 × 350.000 ₫ = 350.000 ₫                  │     │
│ │ Vật tư: [Composite resin A2] [-]               │     │
│ │ Ghi chú: Hàn mặt nhai                          │     │
│ │ [✏️ Sửa] [🗑️ Xóa]                                │     │
│ └─────────────────────────────────────────────────┘     │
│                                                          │
│ ┌─ Răng 26 ──────────────────────────────────────┐     │
│ │ Nhổ răng sữa • Mã: D7210                       │     │
│ │ SL: 1 × 150.000 ₫ = 150.000 ₫                  │     │
│ │ Vật tư: —                                       │     │
│ │ [✏️ Sửa] [🗑️ Xóa]                                │     │
│ └─────────────────────────────────────────────────┘     │
│                                                          │
│ ┌──────────────────────────────────────────────────┐   │
│ │ Tổng điều trị:            500.000 ₫              │   │
│ │ (Sẽ tự động tạo hóa đơn khi đóng encounter)    │   │
│ └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### 5.3 Tab "Đơn thuốc" (Prescription)

```
┌──────────────────────────────────────────────────────────┐
│ 💊 Đơn thuốc                            [+ Tạo đơn thuốc]│
├──────────────────────────────────────────────────────────┤
│ ┌─ Đơn thuốc #1 ─────────────────────────────────┐    │
│ │ Chẩn đoán: Viêm quanh răng                      │     │
│ │ ────────────────────────────────────────────    │     │
│ │ # │ Thuốc              │ Liều    │ Tần suất      │     │
│ │ 1 │ Amoxicillin 500mg  │ 500mg   │ 3 lần/ngày    │     │
│ │   │ SL: 15 viên • 5 ngày                        │     │
│ │   │ Hướng dẫn: Uống sau ăn                      │     │
│ │ 2 │ Ibuprofen 400mg    │ 400mg   │ Khi đau       │     │
│ │   │ SL: 10 viên                                   │     │
│ │ ────────────────────────────────────────────    │     │
│ │ Tái khám: Sau 1 tuần nếu không giảm             │     │
│ │ [✏️ Sửa] [🗑️ Xóa] [🖨 In]                         │     │
│ └─────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────┘
```

### 5.4 Tab "Dental Chart"

```
┌──────────────────────────────────────────────────────────┐
│ 📊 Dental Chart                        Snapshot: 09:15  │
├──────────────────────────────────────────────────────────┤
│ ┌─────────────────────────┬────────────────────────┐    │
│ │ HÀM TRÊN                │ HÀM DƯỚI              │    │
│ │ (phải)      (trái)      │ (phải)      (trái)    │    │
│ │                         │                        │    │
│ │ 18 17 16 15 14 13 12 11│ 48 47 46 45 44 43 42 41│    │
│ │  ⬜ 🟫  ✅ ⬜ 🟫 ⬜ ⬜ ⬜│ ⬜ 🟫 🟥 ⬜ 🟫 ⬜ ⬜ ⬜│    │
│ │                         │                        │    │
│ │ 55 54 53 52 51 61 62 63│ 85 84 83 82 81 71 72 73│    │
│ │  ⬜ ⬜ ⬜ ⬜ ⬜ ⬜ ⬜ ⬜   │ ⬜ ⬜ ⬜ ⬜ ⬜ ⬜ ⬜ ⬜   │    │
│ │ (răng sữa)              │ (răng sữa)             │    │
│ └─────────────────────────┴────────────────────────┘    │
│                                                          │
│ Chú thích:                                              │
│ ⬜ Bình thường    ✅ Đã hàn    🟥 Sâu     🟫 Vỡ         │
│ ❌ Nhổ           💎 Bọc sứ    🌱 Implant                 │
│                                                          │
│ Click răng để chỉnh sửa chi tiết                       │
└──────────────────────────────────────────────────────────┘
```

#### Click răng 26 → modal chi tiết

```
┌─────────────────────────────────────┐
│ Răng 26 — Hàm trên trái       [✕] │
├─────────────────────────────────────┤
│ Bề mặt                              │
│ ◉ Bình thường                       │
│ ○ Sâu                              │
│ ○ Vỡ/Mẻ                            │
│ ○ Đã hàn                           │
│ ○ Mất tủy                          │
│ ○ Bọc sứ                           │
│ ○ Implant                          │
│ ○ Đã nhổ                           │
│                                     │
│ Tình trạng                           │
│ [Bình thường ▼]                     │
│                                     │
│ Ghi chú                              │
│ [Đã hàn Composite tháng 7/2026 ]    │
│                                     │
│ [Hủy]                  [Lưu]        │
└─────────────────────────────────────┘
```

### 5.5 Tab "Tóm tắt" (Summary trước khi đóng)

```
┌──────────────────────────────────────────────────────────┐
│ 📋 Tóm tắt Encounter (trước khi đóng)                  │
├──────────────────────────────────────────────────────────┤
│ Bệnh nhân: Nguyễn Văn A                                │
│ Thời gian: 09:00 - 09:30 (30 phút)                     │
│                                                          │
│ Ghi chú:                                                │
│ - Lý do: Đau răng hàm dưới 2 ngày                     │
│ - Chẩn đoán: Viêm quanh răng răng 46                  │
│                                                         │
│ Điều trị:                                              │
│ - Hàn Composite răng 16 (350k)                         │
│ - Nhổ răng sữa 26 (150k)                              │
│ Tổng: 500.000 ₫                                         │
│                                                         │
│ Đơn thuốc:                                              │
│ - Amoxicillin 500mg × 5 ngày                          │
│ - Ibuprofen 400mg khi đau                              │
│                                                         │
│ Cập nhật Chart:                                        │
│ - Răng 16: filled (Composite)                          │
│ - Răng 26: extracted                                  │
│                                                         │
│ ┌──────────────────────────────────────────────────┐   │
│ │ Tóm tắt cuối cùng *                              │   │
│ │ [Hàn răng số 16, nhổ răng sữa 26, kê đơn... ]  │   │
│ │                                                  │   │
│ │ ☐ Tôi đã kiểm tra tất cả ghi chú và điều trị   │   │
│ │ ☐ Bệnh nhân đã được giải thích                  │   │
│ │ ☐ Đơn thuốc đã được in/giao                     │   │
│ └──────────────────────────────────────────────────┘   │
│                                                         │
│ [Hủy]                              [✓ Đóng Encounter] │
└──────────────────────────────────────────────────────────┘
```

### Close behavior

Click "Đóng Encounter" →

```
┌─────────────────────────────────────────────────────┐
│ Xác nhận đóng Encounter                       [✕] │
├─────────────────────────────────────────────────────┤
│ Khi đóng, hệ thống sẽ tự động:                    │
│                                                     │
│ ✓ Tạo hóa đơn (draft) với tổng 500.000 ₫          │
│ ✓ Trừ tồn kho vật tư đã dùng                     │
│ ✓ Khóa ghi chú lâm sàng (read-only)               │
│ ✓ Cập nhật trạng thái appointment = completed     │
│                                                     │
│ ⚠ Nếu vật tư không đủ (BR-MR-011):               │
│   → Encounter KHÔNG đóng được.                    │
│   → Hiển thị lỗi kèm danh sách vật tư thiếu. │
│   → BS phải xóa Treatment dùng vật tư thiếu trước.│
│                                                     │
│ Hành động này KHÔNG thể hoàn tác.                 │
│ (Có thể thêm addendum trong vòng 30 ngày)         │
│                                                     │
│ [Hủy]                  [Xác nhận đóng]            │
└─────────────────────────────────────────────────────┘
```

---

## Screen 6: Encounter Closed View (Read-only sau khi đóng)

**Path:** `/encounters/:id` (khi status = completed)

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ ← Quay lại   Encounter #ENC-2026-00045                    │
│ BS. Trần C  •  09:00-09:30  •  ✅ Completed              │
├──────────────────────────────────────────────────────────┤
│  🔒 Ghi chú đã được khóa (read-only)                    │
│  Có thể thêm addendum trong vòng 30 ngày                │
│  [📝 Thêm addendum]                                     │
│                                                          │
│  ┌─ Summary (read-only) ────────────────────────────┐  │
│  │ "Hàn răng số 16, nhổ răng sữa 26, kê đơn..."   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ... (các tab như trên nhưng read-only)                 │
│                                                          │
│  ┌─ Addendums ──────────────────────────────────────┐  │
│  │ (none yet)                                        │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## Screen 7: Addendum Modal

**Path:** Modal từ Encounter Closed
**Permission:** `encounter.addendum`

### Wireframe

```
┌─────────────────────────────────────┐
│ Thêm Addendum                 [✕] │
├─────────────────────────────────────┤
│ Encounter: #ENC-2026-00045         │
│ Thời gian đóng: 2026-07-15 09:30  │
│ Còn lại: 28 ngày (deadline 30 ngày)│
│                                     │
│ Bổ sung cho:                        │
│ ◉ Ghi chú chẩn đoán               │
│ ○ Ghi chú tiến triển               │
│ ○ Lý do khám                      │
│                                     │
│ Nội dung *                          │
│ ┌─────────────────────────────────┐│
│ │ BN có phản ứng dị ứng nhẹ với ││
│ │ thuốc tê, theo dõi tại chỗ    ││
│ │ 5 phút. Ổn định.               ││
│ └─────────────────────────────────┘│
│                                     │
│ [Hủy]                  [Lưu]      │
└─────────────────────────────────────┘
```

---

## Screen 8: My Schedule (Calendar view cho Dentist)

**Path:** `/my-schedule`
**Permission:** `appointment.read`

### Wireframe (Tuần view)

```
┌──────────────────────────────────────────────────────────────────┐
│ Tuần 11-17/07/2026                       [< Tuần trước] [Tuần này]│
├──────────┬──────────┬──────────┬──────────┬──────────┬──────────┤
│  T2 11/07│  T3 12/07│  T4 13/07│  T5 14/07│  T6 15/07│  T7 16/07│
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ 08:00    │          │          │          │          │          │
│ 09:00 🟡 │ 09:00 🟢 │ 09:00 ⭐│ 09:00 🟡 │          │          │
│ 10:00 🟢 │ 10:00 🟢 │ 10:00 🟢│ 10:00 🟡 │          │          │
│ 11:00 🟢 │ 11:00 🟡 │ 11:00 ⬜│ 11:00 🟢 │          │          │
│ 12:00 ⬜ │ 12:00 ⬜ │ 12:00 ⬜│ 12:00 ⬜ │          │          │
│ ...      │          │          │          │          │          │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘

⭐ In progress  🟢 Confirmed  🟡 Scheduled  ✅ Completed  ⬜ Off
```

---

## Screen 9: Encounter List (theo patient)

**Path:** `/patients/:id/encounters`
**Permission:** `encounter.read`

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ Lịch sử khám — Nguyễn Văn A                             │
├──────────────────────────────────────────────────────────┤
│ [Filter theo BS ▼] [Từ 📅] [Đến 📅]                    │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐│
│ │ Ngày       │ BS      │ Summary                │Tr.thái││
│ ├──────────────────────────────────────────────────────┤│
│ │ 2026-07-15│ Trần C  │ Hàn composite răng 16 │✅ Done││
│ │ 2026-06-15│ Trần C  │ Khám định kỳ           │✅ Done││
│ │ 2026-03-10│ Lê V    │ Nhổ răng khôn          │✅ Done││
│ └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

---

## Common Dentist patterns

### Allergy Alert (BR-MR-001)

Alert luôn hiển thị ở:
- Patient Detail header
- Encounter Detail header
- Treatment form (khi chọn vật tư)
- Prescription form (khi chọn thuốc)

```
┌─────────────────────────────────────────┐
│ ⚠ DỊ ỨNG: Penicillin, Sulfa           │
│ ⚠ BỆNH MÃN: Tăng huyết áp           │
└─────────────────────────────────────────┘
```

### Auto-save draft

Ghi chú lâm sàng **auto-save** mỗi 5 giây (localStorage) để tránh mất dữ liệu khi BS bị gián đoạn.

### Tooth chart visual

- Mỗi răng = 1 button trong grid
- Color theo surface:
  - `⬜` Bình thường
  - `✅` Đã hàn (xanh lá)
  - `🟥` Sâu (đỏ)
  - `🟫` Vỡ (cam)
  - `💎` Bọc sứ (xanh dương)
  - `🌱` Implant (tím)
  - `❌` Đã nhổ (xám có gạch ngang)

### Encounter timing

- Header hiển thị elapsed time (auto-update mỗi 30s)
- Sau 60 phút → warning "Encounter dài hơn bình thường"

---

## Related

- [`design-system.md`](../design-system.md)
- [`../../05_API/medical-records.md`](../../05_API/medical-records.md)
- [`../../05_API/appointments.md`](../../05_API/appointments.md)
- [`admin.md`](admin.md)