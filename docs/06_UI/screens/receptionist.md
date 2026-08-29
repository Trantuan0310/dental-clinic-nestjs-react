# Receptionist Screens

> **Role:** Receptionist (Lễ tân)
> **Permission:** `patient.*`, `appointment.*`, `invoice.*`, `payment.*`, `encounter.read`
> **File này:** Wireframe + flow cho các màn hình Lễ tân.
> **Tham chiếu:** [`design-system.md`](../design-system.md) + [`patients.md`](../../05_API/patients.md) + [`appointments.md`](../../05_API/appointments.md) + [`billing.md`](../../05_API/billing.md).
> **Ngày tạo:** 2026-07-13

---

## Sidebar cho Receptionist

```
┌────────────────────────────┐
│ ClinicFlow          [≡]    │
├────────────────────────────┤
│ 🏠 Dashboard               │
│                            │
│ HÀNG NGÀY                  │
│ 📅 Lịch hẹn                │
│ ✅ Check-in                │
│ 📋 Hàng chờ khám          │
│                            │
│ QUẢN LÝ                    │
│ 👤 Bệnh nhân               │
│                            │
│ TÀI CHÍNH                  │
│ 🧾 Hóa đơn                │
│ 💰 Thanh toán             │
│                            │
│ ─────────────────────────  │
│ 👤 Hồ sơ cá nhân          │
│ 🚪 Đăng xuất              │
└────────────────────────────┘
```

> Receptionist KHÔNG thấy: Phân quyền, Audit logs, Cài đặt phòng khám, Kho (read-only qua dashboard badge).

---

## Workflow chính của Receptionist

```
                    ┌─────────────────┐
                    │ Patient đến     │
                    │ (walk-in/phone) │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ Bệnh nhân│  │ Bệnh nhân│  │ Bệnh nhân│
        │ mới      │  │ cũ + lịch│  │ cũ chưa  │
        │          │  │ hẹn      │  │ có lịch  │
        └────┬─────┘  └────┬─────┘  └────┬─────┘
             │             │              │
             ▼             ▼              ▼
        ┌─────────┐   ┌──────────┐   ┌──────────┐
        │ Tạo BN  │   │ Tìm lịch │   │ Lookup   │
        │ mới     │   │ hẹn      │   │ BN + tạo │
        │ + cảnh  │   │          │   │ lịch mới │
        │ báo dup │   │          │   │          │
        └────┬────┘   └────┬─────┘   └────┬─────┘
             │             │              │
             └─────────────┴──────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Check-in       │
                  │ (nếu có lịch)  │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Hàng chờ       │
                  │ (FIFO)         │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ BS gọi vào khám│
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Sau khám:        │
                  │ Hóa đơn + TT    │
                  └─────────────────┘
```

---

## Screen 1: Dashboard (Receptionist view)

**Path:** `/`
**Permission:** Authenticated (filtered)

### Wireframe

```
┌─────────────────────────────────────────────────────────┐
│ Chào buổi sáng, Trần Thị B     [Hôm nay ▼] [📅 Today]│
├─────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ Hẹn hôm│ │ Check-in│ │ Đang chờ│ │ Đã khám │       │
│  │   18   │ │   5    │ │   3    │ │   10   │       │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │
│                                                          │
│  ┌─────────────────────┐ ┌──────────────────────┐       │
│  │ Lịch hẹn tiếp theo  │ │ Hóa đơn chờ thanh toán│      │
│  │ ─────────────────── │ │ ───────────────────   │      │
│  │ 14:00 BS.Tran - A  │ │ INV-0078  300.000 ₫   │      │
│  │ 15:00 BS.Lee - B   │ │ INV-0080  150.000 ₫   │      │
│  │ 16:00 BS.Tran - C  │ │ [Xem tất cả →]        │      │
│  └─────────────────────┘ └──────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

### KPI semantics

| Card | Mô tả | API |
| ---- | ----- | --- |
| Hẹn hôm nay | Số lượng hẹn hôm nay | `GET /appointments?from=today&to=today&count=true` |
| Check-in | Đã check-in hôm nay | `GET /appointments?status=checked_in&from=today&count=true` |
| Đang chờ | Số BN đã check-in, chưa khám (FIFO — theo thứ tự check-in, BD-0001) | `GET /appointments?status=checked_in&count=true` |
| Đã khám | Đã hoàn thành hôm nay | `GET /appointments?status=completed&from=today&count=true` |

---

## Screen 2: Patient List

**Path:** `/patients`
**Permission:** `patient.read`

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ Bệnh nhân                            [+ Tạo bệnh nhân]  │
├──────────────────────────────────────────────────────────┤
│ [🔍 Tìm SĐT, tên, mã BN...]              [Filter ▼]    │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Mã BN       │ Họ tên      │ SĐT      │ Tái khám     │ │
│ ├──────────────────────────────────────────────────────┤ │
│ │ PAT-2026-12 │ Nguyễn V.A │ 0912... │ 2026-06-15    │ │
│ │ PAT-2026-45 │ Trần T.B   │ 0987... │ Chưa từng đến │ │
│ │ PAT-2026-78 │ Lê V.C     │ 0901... │ 2026-07-10    │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│              « 1 2 3 ... 12 »        20 / trang  ▼      │
└──────────────────────────────────────────────────────────┘
```

### Behavior

- Click row → `/patients/:id`
- Quick search (debounce 300ms) gọi `GET /patients?q=...`
- "+ Tạo bệnh nhân" → form mới (xem screen 3)

---

## Screen 3: Create / Edit Patient

**Path:** `/patients/new` hoặc `/patients/:id/edit`
**Permission:** `patient.create` / `patient.update`

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ Tạo bệnh nhân mới                              [✕ Đóng]│
├──────────────────────────────────────────────────────────┤
│ ┌─ Thông tin cơ bản ──────────────────────────────┐    │
│ │ Họ và tên *                                       │    │
│ │ [Nguyễn Văn A                              ]     │    │
│ │                                                    │    │
│ │ Ngày sinh *        Giới tính *                     │    │
│ │ [1990-05-12 📅]    ◉ Nam ○ Nữ ○ Khác ○ Ẩn         │    │
│ │                                                    │    │
│ │ SĐT chính          Email                           │    │
│ │ [0912345678    ]   [a@example.com          ]       │    │
│ │                                                    │    │
│ │ Nghề nghiệp        Địa chỉ                        │    │
│ │ [Kỹ sư          ]  [123 Lê Lợi, Q1, TP.HCM  ]   │    │
│ └────────────────────────────────────────────────────┘    │
│                                                          │
│ ┌─ Thông tin y tế ────────────────────────────────┐    │
│ │ Dị ứng (nhập từng cái + Enter)                  │    │
│ │ [Penicillin] [Sulfa] [+]                         │    │
│ │                                                    │    │
│ │ Bệnh mãn tính                                    │    │
│ │ [Tăng huyết áp] [+]                              │    │
│ │                                                    │    │
│ │ Thuốc đang dùng                                  │    │
│ │ [Amlodipine 5mg] [+]                             │    │
│ └────────────────────────────────────────────────────┘    │
│                                                          │
│ ┌─ Người liên hệ (nếu BN < 12 tuổi) ──────────────┐   │
│ │ Tên                 SĐT                           │   │
│ │ [Nguyễn Thị B   ]   [0987654321              ]    │   │
│ └────────────────────────────────────────────────────┘    │
│                                                          │
│ ┌─ Giấy tờ tùy thân ──────────────────────────────┐   │
│ │ Loại        Số             Ngày cấp     Nơi cấp  │   │
│ │ CCCD ▼    [079123456789] [2021-03-15] [CA TP.HCM]│   │
│ │ [+ Thêm giấy tờ]                                 │   │
│ └────────────────────────────────────────────────────┘    │
│                                                          │
│ Ghi chú                                                  │
│ [Lần đầu đến                                        ]   │
│                                                          │
│ [Hủy]                                  [💾 Lưu]        │
└──────────────────────────────────────────────────────────┘
```

### Validation live

- Required fields có `*`
- Inline error dưới field (red text)
- SĐT: format check
- Email: format check
- DOB: phải trong quá khứ
- Nếu DOB → age < 12 → bắt buộc người liên hệ

### Smart duplicate detection

Khi user gõ SĐT hoặc tên:
- Debounce 500ms
- Gọi `GET /patients/lookup?phone=...`
- Nếu có candidates → hiển thị banner cảnh báo:

```
┌─────────────────────────────────────────────────────┐
│ ⚠ Phát hiện bệnh nhân có thông tin trùng:           │
│                                                     │
│ ┌─────────────────────────────────────────────────┐│
│ │ Nguyễn Văn A  •  PAT-2026-00012  •  0912345678 ││
│ │ 1990-05-12  •  Tái khám: 2026-06-15             ││
│ │ [Mở bệnh nhân này]                              ││
│ └─────────────────────────────────────────────────┘│
│                                                     │
│ Đây có phải cùng người không?                       │
│ ( ) Có — Mở BN đã có  (●) Không — Tạo mới          │
└─────────────────────────────────────────────────────┘
```

---

## Screen 4: Patient Detail

**Path:** `/patients/:id`
**Permission:** `patient.read`

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ ← Quay lại    PAT-2026-00012 — Nguyễn Văn A  [⋮ Actions]│
├──────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌────────────────────────────────────┐   │
│  │ [Avatar] │  │ Nguyễn Văn A                       │   │
│  │   Nam    │  │ Nam • 1990-05-12 (36 tuổi)         │   │
│  │  36 tuổi │  │ SĐT: 0912345678                   │   │
│  └──────────┘  │ Email: a@example.com               │   │
│                └────────────────────────────────────┘   │
│                                                          │
│ [Tabs: Tổng quan | Lịch sử khám | Hóa đơn | Sửa]       │
│ ────────────────────────────────────────────────       │
│                                                          │
│ ┌─ Tổng quan ─────────────────────────────────────┐    │
│ │ Dị ứng: Penicillin, Sulfa                         │    │
│ │ Bệnh mãn: Tăng huyết áp                         │    │
│ │ Thuốc: Amlodipine 5mg                            │    │
│ │                                                    │    │
│ │ ┌─ Thống kê ─────────────────────────────────┐   │    │
│ │ │ Tổng lượt khám:    5                        │   │    │
│ │ │ Tái khám gần nhất: 2026-06-15               │   │    │
│ │ │ Bác sĩ phụ trách: BS. Trần Thị C            │   │    │
│ │ │ (Lưu ý: Receptionist không thấy financial)  │   │    │
│ │ └──────────────────────────────────────────────┘   │    │
│ └────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

### Actions menu

```
┌─────────────────────────────┐
│ 📅 Đặt lịch hẹn mới        │
│ ✏️ Sửa thông tin            │
│ 📞 Xem lịch sử SĐT          │
│ ─────────────────────────── │
│ ⚠️ Merge với BN khác        │
│ 🗑️ Xóa (Admin only)         │
└─────────────────────────────┘
```

---

## Screen 5: Appointment Calendar

**Path:** `/appointments`
**Permission:** `appointment.read`

### Wireframe (3 view modes)

```
┌──────────────────────────────────────────────────────────┐
│ Lịch hẹn              [< Hôm nay >] [📅 13/07/2026]    │
├──────────────────────────────────────────────────────────┤
│ [📅 Ngày] [📆 Tuần] [🗓 Tháng]      [👨‍⚕️ Tất cả BS ▼] │
└──────────────────────────────────────────────────────────┘
```

#### 5.1 Day View (mặc định)

```
│         BS.Trần C    BS.Lê V        BS.Phạm T       │
│ 08:00  ┌──────────┐  ┌──────────┐   ┌──────────┐     │
│        │ 09:00-10 │  │          │   │          │     │
│ 09:00  │ BN Ng.A  │  │ 09:30-10 │   │          │     │
│        │ #APT-123 │  │ BN Tr.B  │   │          │     │
│ 10:00  ├──────────┤  ├──────────┤   ├──────────┤     │
│        │          │  │          │   │ 10:00-11 │     │
│ 11:00  │          │  │          │   │ BN Le.C  │     │
│        │          │  │          │   │ #APT-125 │     │
│ ...                                                        │
└──────────────────────────────────────────────────────────┘
```

#### 5.2 Status colors

```
scheduled    (gray)    ■
confirmed    (blue)    ■
checked_in   (cyan)    ■
in_progress  (amber)   ■
completed    (green)   ■
cancelled    (red)     ▓ (striped)
no_show      (red)     ▓ (striped)
```

#### 5.3 Click slot empty → Create appointment modal

```
┌─────────────────────────────────────┐
│ Tạo lịch hẹn — 14:00 BS.Trần C    │
├─────────────────────────────────────┤
│ Bệnh nhân *                          │
│ [🔍 Tìm BN...              ]       │
│                                     │
│ Thời lượng                          │
│ [60 phút ▼]                         │
│                                     │
│ Lý do khám                          │
│ [Khám định kỳ                ]      │
│                                     │
│ Ghi chú nội bộ                      │
│ [                                ]   │
│                                     │
│ [Hủy]              [Tạo lịch hẹn] │
└─────────────────────────────────────┘
```

#### 5.4 Click existing appointment → Popover

```
┌─────────────────────────────────────┐
│ APT-2026-00123                     │
│ ─────────────────────                │
│ Nguyễn Văn A  •  0912345678        │
│ 09:00 - 10:00  •  BS. Trần C       │
│ Lý do: Khám định kỳ                │
│ Trạng thái: 🟢 Confirmed            │
│                                     │
│ [✅ Check-in]                       │
│ [📅 Đổi lịch]                       │
│ [❌ Hủy]                            │
└─────────────────────────────────────┘
```

---

## Screen 6: Check-in

**Path:** `/checkin`
**Permission:** `appointment.checkin`

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ Check-in — Hôm nay (13/07/2026)                          │
├──────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────┐  │
│ │ 🔍 Quét CCCD / Nhập SĐT / Mã APT                  │  │
│ │ [_______________________________________]   [Tìm] │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ Lịch hẹn sắp đến (trong 30 phút tới):                  │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐│
│ │ Thời gian │ BN          │ BS      │ Trạng thái      ││
│ ├──────────────────────────────────────────────────────┤│
│ │ 13:30    │ Nguyễn V.A │ BS.Trần│ 🟡 Confirmed    ││
│ │          │             │         │ [✅ Check-in]   ││
│ │ 13:45    │ Trần T.B   │ BS.Lê  │ 🟢 Scheduled    ││
│ │          │             │         │ [✅ Check-in]   ││
│ │ 14:00    │ Lê V.C     │ BS.Trần│ 🟢 Scheduled    ││
│ │          │             │         │ [✅ Check-in]   ││
│ └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

### Behavior

- Check-in time window: `[startAt - 15min, startAt + 30min]` (BR-APPT-018)
- Nếu quá window → disable button + tooltip "Quá thời gian check-in"
- Sau check-in → chuyển status `checked_in` → BN vào hàng chờ

---

## Screen 7: Waiting Queue

**Path:** `/queue`
**Permission:** `appointment.checkin`
**Scope:** Receptionist thấy toàn bộ hàng đợi của tất cả bác sĩ (cross-dentist queue).

> **Phân biệt với Dentist:** Dentist dùng `/my-queue` — chỉ thấy hàng đợi của chính mình. Receptionist dùng `/queue` — thấy toàn bộ queue.

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ Hàng chờ — Hôm nay                       [🔄 Auto-refresh]│
├──────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────┐  │
│ │ #1 (đang khám)                                      │  │
│ │ ⭐ Trần Thị B                                       │  │
│ │ APT-2026-00124 • BS. Lê Văn  • 09:30 - 10:30      │  │
│ │ Check-in lúc: 09:20 (15 phút trước)                │  │
│ │ [Mời vào khám ✓]                                    │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ ┌────────────────────────────────────────────────────┐  │
│ │ #2 (đang chờ)                                       │  │
│ │ Nguyễn Văn A                                       │  │
│ │ APT-2026-00123 • BS. Trần C  • 09:00 - 10:00      │  │
│ │ Check-in lúc: 09:35 (vừa xong)                     │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ ┌────────────────────────────────────────────────────┐  │
│ │ #3 (đang chờ)                                       │  │
│ │ Lê Văn C                                           │  │
│ │ APT-2026-00125 • BS. Trần C  • 10:00 - 11:00      │  │
│ │ Check-in lúc: 09:50 (vừa xong)                     │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ #1 = người check-in sớm nhất (FIFO — BD-0001)         │
└──────────────────────────────────────────────────────────┘
```

### Behavior

- Auto-refresh mỗi 30 giây (polling `GET /queue`)
- Order = FIFO (check-in_at ASC)
- Click "Mời vào khám" → tạo encounter (`POST /encounters`)
- Nếu đã quá startAt + 60min mà chưa check-in → status auto = no_show (cron)

---

## Screen 8: Invoice List

**Path:** `/invoices`
**Permission:** `invoice.read`

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ Hóa đơn                          [+ Tạo hóa đơn ngoài]
├──────────────────────────────────────────────────────────┤
│ [🔍 Tìm BN, mã HĐ...] [Trạng thái ▼] [Từ 📅][Đến 📅] │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐│
│ │ Mã HĐ   │ BN       │ Tổng   │ Còn phải thu│TT││
│ ├──────────────────────────────────────────────────────┤│
│ │ INV-0078 │ Ng.V.A   │ 500.000 │ 300.000    │⚠️││
│ │ INV-0079 │ Tr.T.B   │ 200.000 │     0      │✅││
│ │ INV-0080 │ Lê V.C   │ 150.000 │ 150.000    │⚠️││
│ └──────────────────────────────────────────────────────┘│
│                                                          │
│ ⚠️ Partial  ✅ Paid  📝 Draft  ❌ Void                   │
└──────────────────────────────────────────────────────────┘
```

### Filters

- Status: draft, issued, partial, paid, void
- Date range: từ ngày → đến ngày
- Search: BN name, mã HĐ

---

## Screen 9: Invoice Detail + Payment

**Path:** `/invoices/:id`
**Permission:** `invoice.read`

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ ← Quay lại   INV-2026-00078                          [⋮] │
├──────────────────────────────────────────────────────────┤
│ ┌─ Thông tin ──────────────────────────────────────┐    │
│ │ Bệnh nhân: Nguyễn Văn A  (PAT-2026-00012)        │    │
│ │ Trạng thái: 🟡 Partial                           │    │
│ │ Ngày tạo: 2026-07-15 11:30 (BS. Trần C close)   │    │
│ │ Ngày phát hành: 2026-07-15 11:35                │    │
│ │ Hóa đơn từ: Encounter ENC-2026-00045            │    │
│ └────────────────────────────────────────────────────┘    │
│                                                          │
│ ┌─ Chi tiết ──────────────────────────────────────┐    │
│ │ # │ Mô tả                  │ SL │ Đơn giá │ Tổng  │    │
│ │ ───────────────────────────────────────────────  │    │
│ │ 1 │ Hàn răng Composite 16 │  1 │ 150.000 │150.000│   │
│ │ 2 │ Nhổ răng sữa 26      │  1 │ 350.000 │350.000│   │
│ │                                       Tổng: 500.000│   │
│ │                                   Giảm giá:       0│   │
│ │                                  Phải thu: 500.000│   │
│ │                                  Đã thu:   200.000│   │
│ │                                  Còn nợ:   300.000│   │
│ └────────────────────────────────────────────────────┘    │
│                                                          │
│ ┌─ Lịch sử thanh toán ────────────────────────────┐    │
│ │ 2026-07-15 12:00 • Tiền mặt      • 200.000 ₫    │    │
│ │   Ghi chú: "Khách trả trước 1 phần"             │    │
│ │   Bởi: Trần Thị B (Receptionist)                │    │
│ └────────────────────────────────────────────────────┘    │
│                                                          │
│ Nếu status = draft:  [📤 Phát hành]                     │
│ Nếu status = issued/partial:                            │
│                       [💰 Thu tiền] [❌ Hủy HĐ]          │
└──────────────────────────────────────────────────────────┘
```

---

## Screen 10: Payment Modal

**Path:** Modal trigger từ invoice detail
**Permission:** `payment.create`

### Wireframe

```
┌─────────────────────────────────────┐
│ Thu tiền — INV-2026-00078    [✕] │
├─────────────────────────────────────┤
│ Tổng hóa đơn:      500.000 ₫       │
│ Đã thu:            200.000 ₫       │
│ Còn nợ:            300.000 ₫       │
│                                     │
│ Số tiền thu *                       │
│ [300.000                     ] ₫   │
│ [● Thu hết] [○ Thu một phần]        │
│                                     │
│ Phương thức *                       │
│ (●) Tiền mặt                       │
│ ( ) Chuyển khoản                    │
│                                     │
│ Ngày thu                            │
│ [2026-07-15 12:30 📅]               │
│                                     │
│ Ghi chú                             │
│ [                            ]      │
│                                     │
│ [Hủy]              [Xác nhận]      │
└─────────────────────────────────────┘
```

### Validation

- Amount > 0 và ≤ outstanding (BR-BILL-005)
- Method required
- PaidAt ≤ now (không cho future date)

### Idempotency

Auto-generate `Idempotency-Key` từ (invoiceId + amount + timestamp rounded minute) — tránh double-submit.

---

## Screen 11: Quick Book Appointment

**Path:** Modal trigger từ Patient Detail
**Permission:** `appointment.create`

### Wireframe

```
┌─────────────────────────────────────────────┐
│ Đặt lịch hẹn cho Nguyễn Văn A       [✕]  │
├─────────────────────────────────────────────┤
│ Bác sĩ *                                     │
│ [BS. Trần C              ▼]                 │
│                                             │
│ Ngày *                                       │
│ [2026-07-15                          📅]     │
│                                             │
│ Giờ bắt đầu *          Thời lượng *         │
│ [09:00]                 [60 phút ▼]         │
│                                             │
│ ┌─ Lịch trống BS.Trần C ngày 15/07 ─────┐ │
│ │ 08:00-09:00  ✅ Trống                   │ │
│ │ 09:00-10:00  ❌ Đã đặt (BN Trần B)     │ │
│ │ 10:00-11:00  ✅ Trống                   │ │
│ │ 11:00-12:00  ✅ Trống                   │ │
│ │ ...                                       │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Lý do khám                                  │
│ [Khám định kỳ                      ]        │
│                                             │
│ Ghi chú                                     │
│ [                                    ]      │
│                                             │
│ [Hủy]                       [Đặt lịch]     │
└─────────────────────────────────────────────┘
```

### Availability API

Gọi `GET /appointments/dentist/:dentistId/availability?date=2026-07-15` để load slot grid real-time.

---

## Common Receptionist patterns

### Phone format

SĐT luôn hiển thị format `0912 345 678` (3-3-3) trên UI, dù DB lưu `0912345678` (không dấu cách).

### Currency

Format tiền: `1.000.000 ₫` (dấu chấm phân cách hàng nghìn, có ký hiệu ₫).

### Date format

- Ngày: `dd/MM/yyyy` (e.g., `15/07/2026`)
- Giờ: `HH:mm` (e.g., `09:00`)
- Ngày giờ đầy đủ: `dd/MM/yyyy HH:mm` (e.g., `15/07/2026 09:00`)

### Empty states

Mỗi list page đều có empty state:

```
┌─────────────────────────────────────┐
│                                     │
│           📋                        │
│                                     │
│    Chưa có bệnh nhân nào           │
│                                     │
│    [+ Tạo bệnh nhân đầu tiên]      │
│                                     │
└─────────────────────────────────────┘
```

---

## Related

- [`design-system.md`](../design-system.md)
- [`../../05_API/patients.md`](../../05_API/patients.md)
- [`../../05_API/appointments.md`](../../05_API/appointments.md)
- [`../../05_API/billing.md`](../../05_API/billing.md)
- [`dentist.md`](dentist.md)