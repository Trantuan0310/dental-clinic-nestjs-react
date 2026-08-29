# Billing & Inventory UI

> **Module:** Billing + Inventory (gộp)
> **Roles:** Receptionist (Billing) + Receptionist/Admin (Inventory read+adjust)
> **File này:** Wireframe + flow cho các màn hình Billing và Inventory.
> **Tham chiếu:** [`design-system.md`](../design-system.md) + [`billing.md`](../../05_API/billing.md) + [`inventory.md`](../../05_API/inventory.md).
> **Ngày tạo:** 2026-07-13

---

# PHẦN A: BILLING

> Billing screen detail đã có trong receptionist.md. Phần này bổ sung **Reports** và **Ad-hoc Invoice**.

---

## Screen A1: Reports (Revenue)

**Path:** `/reports/revenue`
**Permission:** `report.revenue.read`

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ Báo cáo doanh thu        [Từ 📅] [Đến 📅]   [Xuất CSV] │
├──────────────────────────────────────────────────────────┤
│  ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│  │ Tổng DT    │ │ Đã thu     │ │ Còn nợ     │           │
│  │ 245.6M ₫   │ │ 198.2M ₫   │ │ 47.4M ₫    │           │
│  └────────────┘ └────────────┘ └────────────┘           │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ [Line chart: Doanh thu theo ngày]                │   │
│  │ (30 ngày gần nhất)                               │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─ Theo bác sĩ ──────────────────────────────────┐    │
│  │ BS. Trần C    45.2M ₫    18%    ████████        │    │
│  │ BS. Lê V      38.7M ₫    15%    ███████         │    │
│  │ BS. Phạm T    32.1M ₫    13%    ██████          │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─ Theo phương thức thanh toán ──────────────────┐    │
│  │ Tiền mặt      120.5M ₫   61%   ██████████      │    │
│  │ Chuyển khoản    62.3M ₫   32%   █████          │    │
│  └────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

### Filters

- Date range (default: 30 ngày gần nhất)
- By dentist (optional)
- By payment method (optional)

---

## Screen A2: Ad-hoc Invoice Creation

**Path:** `/invoices/new`
**Permission:** `invoice.create_adhoc`

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ Tạo hóa đơn ngoài (không từ Encounter)          [✕]    │
├──────────────────────────────────────────────────────────┤
│ Bệnh nhân *                                             │
│ [🔍 Tìm BN...                                   ]     │
│ → Đã chọn: Nguyễn Văn A (PAT-2026-00012)              │
│                                                         │
│ Items:                                                  │
│ ┌─────────────────────────────────────────────────┐    │
│ │ # │ Mô tả        │ SL │ Đơn giá  │ Tổng        │    │
│ │ ───────────────────────────────────────────────  │    │
│ │ 1 │ Thuốc ABC    │ 2  │ 50.000   │ 100.000     │    │
│ │ 2 │ Khẩu trang   │ 1  │ 20.000   │ 20.000      │    │
│ │ [+ Thêm dòng]                                      │    │
│ └─────────────────────────────────────────────────┘    │
│                                                         │
│ Giảm giá:    [0           ] ₫                          │
│ ────────────────────────────────────                  │
│ Tổng cộng:    120.000 ₫                                 │
│                                                         │
│ Phát hành ngay: ☑                                       │
│ ☐ Lưu draft (phát hành sau)                            │
│                                                         │
│ [Hủy]                                  [💾 Tạo]      │
└──────────────────────────────────────────────────────────┘
```

---

## Screen A3: Payments List

**Path:** `/payments`
**Permission:** `payment.create`

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ Thanh toán                              [Xuất CSV]      │
├──────────────────────────────────────────────────────────┤
│ [🔍 Tìm...] [PT TT ▼] [Từ 📅] [Đến 📅]               │
│                                                         │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Thời gian   │ BN        │ HĐ      │ Số tiền │ PT │ │
│ ├────────────────────────────────────────────────────┤ │
│ │ 15/07 12:00│ Nguyễn V.A│ INV-78 │ 200.000│💵   │ │
│ │ 15/07 11:00│ Trần T.B  │ INV-79 │ 200.000│🏦   │ │
│ │ 14/07 16:30│ Lê V.C    │ INV-80 │ 150.000│💵   │ │
│ │ 14/07 09:00│ Phạm T.D  │ INV-77 │-50.000 │💵   │ │
│ │          (reversal)                                 │ │
│ └────────────────────────────────────────────────────┘ │
│                                                         │
│ 💵 Tiền mặt  🏦 Chuyển khoản  💳 Thẻ  🏥 BHYT  ❓ Khác│
└──────────────────────────────────────────────────────────┘
```

---

# PHẦN B: INVENTORY

---

## Sidebar (Admin + Receptionist xem limited)

Admin:
```
│ QUẢN LÝ KHO            │
│ 📦 Tồn kho             │
│ 🔄 Lịch sử xuất nhập   │
│ ⚠️ Cảnh báo tồn kho    │
```

Receptionist (read-only summary + adjust):
```
│ QUẢN LÝ KHO            │
│ 📦 Tồn kho (chỉ xem)   │
│ 🔄 Xuất nhập            │
```

---

## Screen B1: Inventory List

**Path:** `/inventory`
**Permission:** `inventory.read`

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ Tồn kho                              [+ Tạo vật tư]    │
├──────────────────────────────────────────────────────────┤
│ [🔍 Tìm tên, mã...]  [Loại ▼] [⚠️ Sắp hết]  [Trạng thái ▼]│
│                                                          │
│ ┌──────────────────────────────────────────────────────┐│
│ │ Mã         │ Tên           │ Loại │ Tồn │ Min │ Giá ││
│ ├──────────────────────────────────────────────────────┤│
│ │ MED-AMX-500│ Amoxicillin   │ Thuốc│ 100 │ 50 │50k ││
│ │ MAT-GLV-100│ Khẩu trang    │ VT   │ 200 │100 │20k ││
│ │ MED-CMP-A2 │ Composite A2  │ VT   │ 30  │50 │150k││ ⚠│
│ │ MED-IMP-X1 │ Implant X1    │ VT   │ 0   │5  │5M  ││ ❌│
│ └──────────────────────────────────────────────────────┘│
│                                                          │
│ ⚠ Dưới min stock  ❌ Hết hàng                          │
└──────────────────────────────────────────────────────────┘
```

### Row colors

- Normal: trắng
- Low stock (`currentQty < minStockLevel`): nền vàng nhạt
- Out of stock (`currentQty = 0`): nền đỏ nhạt
- Inactive: chữ xám + strikethrough

---

## Screen B2: Inventory Item Detail

**Path:** `/inventory/items/:id`
**Permission:** `inventory.read`

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ ← Quay lại    Amoxicillin 500mg  (MED-AMX-500)         │
├──────────────────────────────────────────────────────────┤
│ ┌─ Thông tin ──────────────────────────────────────┐    │
│ │ Tên:        Amoxicillin 500mg                    │    │
│ │ Loại:       Thuốc                                │    │
│ │ Đơn vị:     viên                                 │    │
│ │ Trạng thái: 🟢 Active                            │    │
│ │ Nhà cung cấp: Công ty Dược TP.HCM               │    │
│ │ Mô tả: Kháng sinh nhóm penicillin                │    │
│ └────────────────────────────────────────────────────┘    │
│                                                          │
│ ┌─ Tồn kho ──────────────────────────────────────┐     │
│ │ Tồn hiện tại:    100 viên                       │     │
│ │ Mức tối thiểu:   50 viên     ✅                  │     │
│ │ Mức tối đa:      500 viên                        │     │
│ │ Giá nhập:        30.000 ₫                        │     │
│ │ Giá bán:         50.000 ₫                        │     │
│ │                                                  │     │
│ │ [📥 Nhập kho] [📤 Xuất kho] [🔧 Điều chỉnh]    │     │
│ └──────────────────────────────────────────────────┘    │
│                                                          │
│ ┌─ Lịch sử xuất nhập (20 gần nhất) ──────────────┐    │
│ │ 2026-07-15 09:00 • 📤 Stock-out                  │    │
│ │   -2 viên • Enc ENC-2026-00045                   │    │
│ │   Còn lại: 102 → 100                             │    │
│ │ ──────────────────────────────────────────────   │    │
│ │ 2026-07-13 10:00 • 📥 Stock-in                   │    │
│ │   +200 viên • PO-2026-0078                       │    │
│ │   Còn lại: 0 → 200  (về 0 rồi nhập lại)         │    │
│ │ ──────────────────────────────────────────────   │    │
│ │ ...                                              │    │
│ └────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

---

## Screen B3: Stock Adjustment Modal

**Path:** Modal từ Item Detail hoặc Inventory List
**Permission:** `inventory.adjust`

### Wireframe

```
┌─────────────────────────────────────┐
│ Điều chỉnh tồn kho           [✕] │
├─────────────────────────────────────┤
│ Vật tư: Amoxicillin 500mg          │
│ Tồn hiện tại: 100 viên             │
│                                     │
│ Loại điều chỉnh *                   │
│ ( ) 📥 Nhập kho (Stock-in)        │
│ ( ) 📤 Xuất kho (Stock-out)       │
│ ( ) 🔧 Kiểm kê (Adjustment)       │
│ ( ) ↩️ Khách trả (Returned)       │
│ ( ) 🗓 Hết hạn (Expired)           │
│ ( ) 💥 Hư hỏng (Damaged)          │
│                                     │
│ Số lượng *                          │
│ [50                              ] │
│                                     │
│ Lý do *                             │
│ [Nhập hàng từ nhà cung cấp       ] │
│                                     │
│ Số tham chiếu                       │
│ [PO-2026-0078                    ] │
│                                     │
│ Ngày                                │
│ [2026-07-13 10:00 📅]              │
│                                     │
│ ┌─────────────────────────────────┐│
│ │ Preview:                         ││
│ │ Sau điều chỉnh: 150 viên       ││
│ │ Tăng: +50 viên                  ││
│ └─────────────────────────────────┘│
│                                     │
│ [Hủy]                  [Xác nhận]  │
└─────────────────────────────────────┘
```

### Validation

- Số lượng > 0
- Lý do required
- `stock_out`: kiểm tra `qty <= currentQty` (BR-INV-009)
- Preview real-time tổng mới

---

## Screen B4: Low Stock Alerts (Dashboard widget)

**Path:** Dashboard widget + `/inventory/alerts`
**Permission:** `inventory.read`

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ ⚠️ Cảnh báo tồn kho                  [Xem tất cả →]      │
├──────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────┐  │
│ │ ❌ Implant X1                  Hết hàng           │  │
│ │ Mã: MED-IMP-X1 • Còn: 0 / Min: 5                │  │
│ │ [📥 Nhập gấp]                                     │  │
│ ├────────────────────────────────────────────────────┤  │
│ │ ⚠ Composite A2                Sắp hết             │  │
│ │ Mã: MED-CMP-A2 • Còn: 30 / Min: 50               │  │
│ │ [📥 Nhập thêm]                                    │  │
│ ├────────────────────────────────────────────────────┤  │
│ │ ⚠ Khẩu trang                Sắp hết               │  │
│ │ Mã: MAT-GLV-100 • Còn: 20 / Min: 100             │  │
│ │ [📥 Nhập thêm]                                    │  │
│ └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Badge trên sidebar

```
│ QUẢN LÝ KHO (3)        │  ← Badge đỏ với count
│ 📦 Tồn kho             │
```

---

## Screen B5: Stock Movement History

**Path:** `/inventory/movements`
**Permission:** `inventory.read`

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ Lịch sử xuất nhập                                       │
├──────────────────────────────────────────────────────────┤
│ [🔍 Tìm...] [Vật tư ▼] [Loại ▼] [Từ 📅] [Đến 📅]    │
│                                                         │
│ ┌────────────────────────────────────────────────────┐ │
│ │ Thời gian    │ Vật tư        │ Loại      │ SL │ Tồn│ │
│ ├────────────────────────────────────────────────────┤ │
│ │ 15/07 11:00 │ Composite A2  │ Treatment  │ -2 │ 30│ │
│ │ 13/07 10:00 │ Amoxicillin   │ Stock-in   │+200│100│ │
│ │ 12/07 14:00 │ Khẩu trang    │ Adjustment │ -5 │ 20│ │
│ │ 10/07 09:00 │ Amoxicillin   │ Stock-out  │ -3 │  0│ │
│ └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Movement types & icons

| Type | Icon | Color |
| ---- | ---- | ----- |
| `initial` | 📦 | gray |
| `stock_in` | 📥 | green |
| `stock_out` | 📤 | blue |
| `treatment_usage` | 🦷 | blue |
| `adjustment` | 🔧 | gray |
| `returned` | ↩️ | yellow |
| `expired` | 🗓 | red |
| `damaged` | 💥 | red |

---

## Screen B6: Create Inventory Item

**Path:** `/inventory/items/new`
**Permission:** `inventory.create`

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ Tạo vật tư mới                                  [✕]    │
├──────────────────────────────────────────────────────────┤
│ Mã vật tư *                                             │
│ [MED-AMX-500                                      ]     │
│ (Auto-uppercase, format: AAA-XXX-NNN)                  │
│                                                         │
│ Tên *                          Loại *                   │
│ [Amoxicillin 500mg       ]    [Thuốc          ▼]      │
│                                                         │
│ Đơn vị *                                                │
│ [viên                                              ]    │
│                                                         │
│ ┌─ Tồn kho ban đầu ────────────────────────────────┐  │
│ │ Số lượng ban đầu                                  │  │
│ │ [0                                          ]     │  │
│ │ Mức tối thiểu *                                    │  │
│ │ [50                                         ]     │  │
│ │ Mức tối đa                                         │  │
│ │ [500                                        ]     │  │
│ └─────────────────────────────────────────────────┘    │
│                                                         │
│ ┌─ Giá ─────────────────────────────────────────┐     │
│ │ Giá nhập    [30.000] ₫                         │     │
│ │ Giá bán     [50.000] ₫                         │     │
│ └─────────────────────────────────────────────┘     │
│                                                         │
│ Nhà cung cấp                                            │
│ [Công ty Dược TP.HCM                            ]      │
│                                                         │
│ Mô tả                                                   │
│ [Kháng sinh nhóm penicillin                       ]    │
│                                                         │
│ [Hủy]                                  [💾 Lưu]       │
└──────────────────────────────────────────────────────────┘
```

### Validation

- Code format check (regex `/^[A-Z0-9-]+$/`)
- Code unique
- Required: name, categoryId, unit, minStockLevel

---

## Screen B7: Categories Management

**Path:** `/inventory/categories`
**Permission:** `inventory.category.upsert`

### Wireframe

```
┌──────────────────────────────────────────────────────────┐
│ Loại vật tư                          [+ Tạo loại]      │
├──────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────┐│
│ │ Mã  │ Tên         │ Mô tả              │ Items      ││
│ ├──────────────────────────────────────────────────────┤│
│ │ MED │ Thuốc       │ Thuốc các loại      │ 45         ││
│ │ MAT │ Vật tư      │ VT nha khoa         │ 30         ││
│ │ IMP │ Implant     │ Vật liệu Implant    │ 12         ││
│ └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

---

## Common Billing + Inventory patterns

### Currency formatting

```
100.000 ₫     // 6 chữ số trở xuống
1.000.000 ₫   // có dấu chấm phân cách
1.500.000.000 ₫  // tỷ
```

### Quick actions

Từ bất kỳ list nào, hover row → show action icons:
- 👁 View
- ✏️ Edit
- ⋮ More (deactivate, print, reverse payment, etc.)

### Payment reversal

Admin có thể reverse payment (BR-BILL-027) từ Invoice Detail. Không cần screen riêng — trigger từ action menu trên payment row.

### Export

Mọi list/report đều có nút "Xuất CSV" hoặc "Xuất Excel":
- Format: UTF-8 with BOM (để mở được trong Excel tiếng Việt)
- Filename: `<report>_<from>_<to>.csv`

### Print invoice

Layout in hóa đơn (80mm thermal printer):

```
┌─────────────────────────────────────────┐
│      PHÒNG KHÁM NHA KHOA SÀI GÒN      │
│       123 Lê Lợi, Q1, TP.HCM          │
│       SĐT: 028 1234 5678            │
├─────────────────────────────────────────┤
│ HÓA ĐƠN: INV-2026-00078               │
│ Ngày: 2026-07-15 11:30                 │
│ BN: Nguyễn Văn A (PAT-2026-00012)     │
├─────────────────────────────────────────┤
│ STT│ Mô tả              │ SL│ Giá│ Tổng│
│ ─────────────────────────────────────────  │
│ 1  │ Hàn Composite 16   │  1│350k│350k│
│ 2  │ Nhổ răng sữa 26    │  1│150k│150k│
├─────────────────────────────────────────┤
│              Tổng: 500.000 ₫           │
│           Giảm giá:       0 ₫           │
│           Phải thu: 500.000 ₫           │
│          Đã thanh toán: 200.000 ₫       │
│             Còn nợ: 300.000 ₫           │
├─────────────────────────────────────────┤
│ Cảm ơn quý khách!                      │
│ Hẹn gặp lại                            │
└─────────────────────────────────────────┘
```

---

## Related

- [`design-system.md`](../design-system.md)
- [`../../05_API/billing.md`](../../05_API/billing.md)
- [`../../05_API/inventory.md`](../../05_API/inventory.md)
- [`receptionist.md`](receptionist.md)