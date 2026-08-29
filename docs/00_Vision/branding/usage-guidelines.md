# GENSMILE — Brand Usage Guidelines

> **Source of truth** for the visual identity. Mọi UI mới phải dùng tokens từ file này.
> Cập nhật ngày 2026-07-15 (chuyển đổi từ "ClinicFlow" → **GENSMILE**).

---

## 1. Brand name & tagline

| | |
|---|---|
| **Tên chính thức** | **GENSMILE** |
| **Tagline** | Nha khoa thẩm mỹ |
| **Tên tiếng Anh (nếu cần)** | GENSMILE Aesthetic Dentistry |
| **Tên viết tắt** | GSM (chỉ dùng nội bộ khi không gian hẹp, ví dụ URL `/gsm/...` không khuyến khích) |

**Quy ước đặt tên:**
- Luôn viết in hoa toàn bộ: `GENSMILE` (KHÔNG `Gensmile`, `GenSmile`, `gen smile`).
- Tagline luôn kèm dấu: `Nha khoa thẩm mỹ` (KHÔNG `nha khoa tham my`).
- Khoảng trắng tagline = chuẩn Unicode NFC.

---

## 2. Logo files

Tất cả file SVG đặt tại `frontend/public/`:

| File | Dùng cho |
|---|---|
| `logo-full.svg` | Default — header, tài liệu, email templates, PDF invoice |
| `logo-full-light.svg` | Chữ trắng — header khi nền tối, dark mode, in trên ảnh |
| `logo-icon.svg` | Favicon, PWA, sidebar (collapsed), loading screen, app icon |
| `logo-icon-mono.svg` | Inline icon, color theo `currentColor` |
| `favicon.svg` | Tab favicon, Apple touch icon |

> **Không crop, không xoay, không kéo méo logo.** Dùng component `<Logo />` để render — nó enforce kích thước tỉ lệ.

---

## 3. Color palette

### 3.1 Primary teal (brand)

| Token | Hex | Dùng cho |
|---|---|---|
| `brand-50`  | `#E6FAF8` | Page background, hover bg, surface |
| `brand-100` | `#C5EFEC` | Selected row, light highlight |
| `brand-200` | `#A8D8D6` | Borders, badges, decorative dividers |
| `brand-400` | `#5CBDB9` | Secondary accents, hover state |
| `brand-500` | `#2BA3A0` | **PRIMARY** — buttons, links, icon, đường viền focus |
| `brand-600` | `#1B7A78` | Hover trên primary button, wordmark text |
| `brand-700` | `#155F5E` | Pressed state, dark headings |
| `brand-800` | `#0F4746` | Dark mode surface |
| `brand-900` | `#082E2E` | Dark mode background |

### 3.2 Warm accent (sparkle motif)

| Token | Hex | Dùng cho |
|---|---|---|
| `accent`     | `#F4B860` | Sparkle, badge "new", celebratory accents |
| `accent-dark`| `#D49644` | Sparkle khi hover |

### 3.3 Neutral (giữ nguyên Tailwind gray)

Giữ scale `gray-50` → `gray-900` của Tailwind mặc định (xem `frontend/tailwind.config.js`).

### 3.4 Semantic (giữ nguyên)

| Token | Màu | Dùng cho |
|---|---|---|
| `success` | `#10B981` | Paid, completed |
| `warning` | `#F59E0B` | Pending, low stock |
| `danger`  | `#EF4444` | Error, delete, cancelled |
| `info`    | `#3B82F6` | Informational |
| `lowStock` | `#F59E0B` | Below minStockLevel |
| `depleted` | `#EF4444` | Out of stock |

### 3.5 Quy tắc dùng màu

1. **Brand color = GENSMILE teal**, KHÔNG dùng `primary-*` (blue) cho brand assets — `primary-*` chỉ còn cho backward compat với screens cũ.
2. Buttons primary: nền `brand-500`, text trắng, hover `brand-600`, pressed `brand-700`.
3. Focus ring: `ring-2 ring-brand-500 ring-offset-2 ring-offset-white`.
4. Selected nav item: `bg-brand-50 text-brand-700`.
5. Logo wordmark dùng `brand-600` trên nền sáng, `white` trên nền tối.

---

## 4. Typography

| Token | Size | Weight | Dùng cho |
|---|---|---|---|
| `text-xs` | 12px | 400 | Helper, labels |
| `text-sm` | 14px | 400 | Body, table cells |
| `text-base` | 16px | 400 | Default body |
| `text-lg` | 18px | 500 | Sub-headings |
| `text-xl` | 20px | 600 | Card titles |
| `text-2xl` | 24px | 600 | Page titles |
| `text-3xl` | 30px | 700 | Dashboard KPI |

**Font stack:** `'Inter', system-ui, -apple-system, sans-serif` — cho cả UI và wordmark "GENSMILE" trên logo (giữ đồng nhất).

> Brand wordmark trong logo SVG dùng weight **800** — Inter ExtraBold. Trong UI có thể dùng `font-bold` (700) hoặc `font-extrabold` (800) để gần với wordmark nhất.

---

## 5. Logo clear-space & minimum size

### 5.1 Clear-space

Khoảng trống tối thiểu quanh logo = **chiều cao của một ngôi sao sparkle** trong logo (~10% chiều rộng logo).

```
┌─────────────────────────┐
│                         │
│   ┌──[SPACE]──┐        │
│   │           │        │
│   │  LOGO     │        │
│   │           │        │
│   └───────────┘        │
│                         │
└─────────────────────────┘
```

### 5.2 Minimum size

| Variant | Min width khi in (mm) | Min width khi digital (px) |
|---|---|---|
| Full (icon + wordmark + tagline) | 35mm | 120px |
| Icon only | 8mm | 24px |

Dưới mức này → chuyển sang variant phù hợp (vd: full → icon).

### 5.3 Không được

- ❌ Thay đổi tỉ lệ logo (stretch / squash)
- ❌ Đổi màu wordmark thành màu không phải `brand-600` / `white`
- ❌ Đặt logo trên nền có độ tương phản thấp (< 4.5:1)
- ❌ Xoay, lật, thêm hiệu ứng glow / shadow cho logo
- ❌ Tách rời icon khỏi wordmark rồi đặt xa nhau

---

## 6. Component usage

### 6.1 React component

```tsx
import { Logo, BrandBadge } from '@/components/brand';

// Header
<Logo variant="full" size="md" />             // 180×75px
<Logo variant="icon" size="sm" />             // 28×28px
<Logo variant="icon-mono" size="xs" inline /> // inline, currentColor
```

### 6.2 Tailwind

```tsx
// Primary button
<button className="bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white">

// Selected nav
<a className="bg-brand-50 text-brand-700">

// Heading
<h1 className="text-brand-700">
```

---

## 7. Tone of voice

- **Chuyên nghiệp nhưng gần gũi.** Nha khoa là lĩnh vực y tế, nhưng phải làm bệnh nhân thoải mái.
- **Tập trung "thẩm mỹ + an toàn + đẳng cấp"** — đừng dùng từ kỹ thuật quá nặng nề với bệnh nhân.
- **Tiếng Việt là chính** — giữ tagline `Nha khoa thẩm mỹ` trong mọi touchpoint tiếng Việt; tiếng Anh chỉ dùng khi xuất bản quốc tế.

---

## 8. Where to find what

| Asset | Path |
|---|---|
| Brand guidelines (file này) | `docs/00_Vision/branding/usage-guidelines.md` |
| Color palette reference | `docs/00_Vision/branding/color-palette.md` |
| Logo SVG (source of truth) | `frontend/public/logo-full.svg`, `logo-icon.svg` |
| React component | `frontend/src/components/brand/Logo.tsx` |
| Tailwind config | `frontend/tailwind.config.js` (phần `brand.*`) |
| Design system reference | `docs/06_UI/design-system.md` §1, §2 |
