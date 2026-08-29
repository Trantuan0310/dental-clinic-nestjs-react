# Design System — Dental Clinic UI

> **Mục đích:** Tập hợp design tokens, typography, color palette, spacing, component library chung cho toàn bộ UI.
> **Bắt buộc cho mọi screen.** Mỗi screen spec phải dùng tokens từ đây.
> **Ngày tạo:** 2026-07-13

---

## 1. Brand & Theme

**Brand name:** **GENSMILE** (Nha khoa thẩm mỹ)

**Logo files:** `frontend/public/logo-full.svg`, `logo-full-light.svg`, `logo-icon.svg`, `logo-icon-mono.svg`, `favicon.svg`. Xem chi tiết tại `docs/00_Vision/branding/usage-guidelines.md`.

**Theme philosophy:**
- Medical-grade cleanliness kết hợp với **GENSMILE signature teal** (#2BA3A0)
- Thể hiện **nha khoa thẩm mỹ cao cấp** — tone pastel, accent amber sparkle
- Information density cao (data table là first-class citizen)
- Role-aware navigation (ẩn menu không dùng)
- Mobile-responsive (Admin chủ yếu desktop, Dentist cần tablet)

**Color tokens:** Dùng class `brand-*` cho GENSMILE palette (xem §2.1). Class `primary-*` cũ (blue) chỉ còn cho backward compat với screens chưa migrate.

---

## 2. Color palette

### 2.1 GENSMILE primary colors (brand-*)

```
brand-50:   #E6FAF8  /* Lightest teal — page bg, hover background */
brand-100:  #C5EFEC  /* Selected row, light highlight */
brand-200:  #A8D8D6  /* Borders, badges, dividers */
brand-400:  #5CBDB9  /* Secondary accent */
brand-500:  #2BA3A0  /* PRIMARY — buttons, links, logo icon */
brand-600:  #1B7A78  /* Hover — wordmark text */
brand-700:  #155F5E  /* Pressed, dark headings */
brand-800:  #0F4746  /* Dark mode surface */
brand-900:  #082E2E  /* Dark mode background */
```

### 2.2 Warm accent (logo sparkle)

```
accent:      #F4B860  /* Sparkle motif, "new" badge */
accent-dark: #D49644  /* Sparkle hover */
```

### 2.3 Legacy primary colors (primary-*)

> **Deprecated cho screens mới.** Giữ lại để tương thích với code cũ. Migrate dần sang `brand-*`.

```
primary-50:  #EFF6FF
primary-100: #DBEAFE
primary-500: #3B82F6
primary-600: #2563EB
primary-700: #1D4ED8
primary-900: #1E3A8A
```

### 2.4 Neutral colors (gray scale)

```
gray-50:  #F9FAFB  /* Page background */
gray-100: #F3F4F6  /* Card background alt */
gray-200: #E5E7EB  /* Borders, dividers */
gray-300: #D1D5DB  /* Disabled controls */
gray-400: #9CA3AF  /* Placeholder text */
gray-500: #6B7280  /* Secondary text */
gray-600: #4B5563  /* Body text */
gray-700: #374151  /* Headings */
gray-800: #1F2937  /* Strong text */
gray-900: #111827  /* Black-ish */
```

### 2.5 Semantic colors

```
success: #10B981 (green-500) — completed, paid
warning: #F59E0B (amber-500) — pending, low stock
danger:  #EF4444 (red-500)   — cancelled, error, delete
info:    #3B82F6 (blue-500)  — informational
lowStock: #F59E0B (amber-500)  — below minStockLevel
depleted: #EF4444 (red-500)    — out of stock (qty = 0)
```

### 2.6 Status colors (per module)

#### Appointment status

| Status | Color | Background |
| ------ | ----- | ---------- |
| `scheduled` | gray-500 | gray-100 |
| `confirmed` | brand-600 | brand-50 |
| `checked_in` | info | blue-100 |
| `in_progress` | warning | amber-100 |
| `completed` | success | green-100 |
| `cancelled` | danger | red-100 |
| `no_show` | danger | red-100 |

#### Invoice status

| Status | Color | Notes |
| ------ | ----- | ----- |
| `draft` | gray-500 | — |
| `issued` | brand-600 | — |
| `partial` | warning (amber-500) | partially paid, outstanding balance |
| `paid` | success (green-500) | — |
| `void` | danger (red-500) | — |

---

## 3. Typography

### 3.1 Font stack

```
Primary:   'Inter', system-ui, -apple-system, sans-serif
Monospace: 'JetBrains Mono', monospace
```

**Tại sao Inter?** Medical data cần font dễ đọc, hỗ trợ tốt số + ký tự đặc biệt (₫, °, %).

### 3.2 Type scale

| Token | Size | Weight | Line height | Use case |
| ----- | ---- | ------ | ----------- | -------- |
| `text-xs` | 12px | 400 | 1.5 | Helper text, labels |
| `text-sm` | 14px | 400 | 1.5 | Body, table cells |
| `text-base` | 16px | 400 | 1.5 | Default body |
| `text-lg` | 18px | 500 | 1.5 | Sub-headings |
| `text-xl` | 20px | 600 | 1.4 | Card titles |
| `text-2xl` | 24px | 600 | 1.3 | Page titles |
| `text-3xl` | 30px | 700 | 1.2 | Dashboard KPI |
| `text-4xl` | 36px | 700 | 1.1 | Hero numbers |

### 3.3 Headings

```
h1: text-2xl font-semibold (600)   /* Page title */
h2: text-xl font-semibold (600)      /* Section */
h3: text-lg font-medium (500)        /* Sub-section */
h4: text-base font-semibold (600)    /* Card title */
```

> **Note:** Use numeric weights (400, 500, 600, 700) consistently throughout the codebase. "semibold" = 600, "medium" = 500.

---

## 4. Spacing

### 4.1 Spacing scale (Tailwind-like)

```
0: 0
1: 4px
2: 8px
3: 12px
4: 16px   /* Base unit */
5: 20px
6: 24px
8: 32px
10: 40px
12: 48px
16: 64px
20: 80px
24: 96px
```

### 4.2 Component padding

| Component | Padding |
| --------- | :-----: |
| Button | `px-4 py-2` (16px, 8px) |
| Card | `p-6` (24px) |
| Modal | `p-8` (32px) |
| Form input | `px-3 py-2` (12px, 8px) |
| Table cell | `px-4 py-3` (16px, 12px) |

---

## 5. Layout & Breakpoints

### 5.1 Container max-widths

| Breakpoint | Width | Use |
| ---------- | ----- | --- |
| `sm` | 640px | Mobile |
| `md` | 768px | Tablet |
| `lg` | 1024px | Small desktop |
| `xl` | 1280px | Desktop |
| `2xl` | 1536px | Wide desktop (Dashboard) |

### 5.2 App layout

```
┌──────────────────────────────────────────────────────┐
│ Header (h: 56px) — Logo | Search | Notifications | User│
├────────┬─────────────────────────────────────────────┤
│        │                                              │
│  Side  │   Main content area                          │
│  nav   │   (max-width 1536px, p-6)                    │
│ (240px)│                                              │
│        │                                              │
│        │                                              │
└────────┴─────────────────────────────────────────────┘
```

- **Header:** fixed top
- **Sidebar:** fixed left, collapsible (240px ↔ 64px icon-only)
- **Main:** scrollable, padding `p-6`

---

## 6. Components inventory

> Danh sách component shared dùng chung. Mỗi component có file spec riêng trong `docs/06_UI/components/`.

| Component | File | Status |
| --------- | ---- | ------ |
| Button | [`components/button.md`](components/button.md) | 📝 Placeholder |
| Input | [`components/input.md`](components/input.md) | 📝 Placeholder |
| Select | [`components/select.md`](components/select.md) | 📝 Placeholder |
| DatePicker | [`components/date-picker.md`](components/date-picker.md) | 📝 Placeholder |
| DataTable | [`components/data-table.md`](components/data-table.md) | 📝 Placeholder |
| Modal | [`components/modal.md`](components/modal.md) | 📝 Placeholder |
| Toast | [`components/toast.md`](components/toast.md) | 📝 Placeholder |
| StatusBadge | [`components/status-badge.md`](components/status-badge.md) | 📝 Placeholder |
| ConfirmDialog | [`components/confirm-dialog.md`](components/confirm-dialog.md) | 📝 Placeholder |
| EmptyState | [`components/empty-state.md`](components/empty-state.md) | 📝 Placeholder |

**Common props tất cả components:**
- `variant: 'primary' | 'secondary' | 'danger' | 'ghost'`
- `size: 'sm' | 'md' | 'lg'`
- `isLoading?: boolean`
- `isDisabled?: boolean`

---

## 7. Icons

**Icon library:** Lucide React (`lucide-react`)

**Quy ước:**
- Default size: 20px
- Stroke width: 2

| Use | Icon |
| --- | ---- |
| Create | `Plus` |
| Edit | `Pencil` |
| Delete | `Trash2` |
| View | `Eye` |
| Search | `Search` |
| Filter | `Filter` |
| Sort asc | `ChevronUp` |
| Sort desc | `ChevronDown` |
| Calendar | `Calendar` |
| User | `User` |
| Patients | `Users` |
| Settings | `Settings` |
| Logout | `LogOut` |
| Bell | `Bell` |
| Warning | `AlertTriangle` |
| Success | `CheckCircle2` |
| Error | `XCircle` |

---

## 8. Accessibility (a11y)

### 8.1 WCAG 2.1 Level AA

- Color contrast ≥ 4.5:1 for text
- Focus visible (ring-2 ring-primary-500)
- Keyboard navigation support
- `aria-label` cho icon-only buttons
- Form labels always visible (no placeholder-only)

### 8.2 Keyboard shortcuts

| Shortcut | Action |
| -------- | ------ |
| `Ctrl + K` | Open search |
| `Ctrl + N` | New (per current screen) |
| `Ctrl + S` | Save |
| `Esc` | Close modal |
| `Tab` / `Shift+Tab` | Navigate fields |

---

## 9. Internationalization (i18n)

**Default:** Vietnamese (`vi`)
**Future:** English (`en`)

**Convention:**
- Tất cả UI text trong file `messages/vi.json`
- Dùng `next-intl` hoặc `react-i18next`
- Date format: `dd/MM/yyyy HH:mm`
- Currency: `₫` (VND), format `1.000.000 ₫`

---

## 10. State management

- **Server state:** TanStack Query (React Query) — cache, refetch, optimistic update
- **Client state:** Zustand — small stores per feature
- **Forms:** React Hook Form + Zod resolver (re-use schema từ backend)
- **Auth state:** JWT trong memory + refresh token httpOnly cookie

---

## 11. Tech stack

- **Framework:** React 18 + Vite
- **UI library:** shadcn/ui (Radix primitives + Tailwind)
- **Routing:** React Router 6
- **State:** TanStack Query + Zustand
- **Forms:** React Hook Form + Zod
- **Tables:** TanStack Table
- **Charts:** Recharts (Dashboard)
- **Date:** date-fns
- **Icons:** lucide-react

> **Tại sao shadcn/ui?** Copy-paste components, không vendor lock-in, full a11y compliance.

---

## 12. Loading & Error states

### 12.1 Loading

- **Skeleton screens** cho page-level loading
- **Spinner nhỏ** cho action-level (button click)
- **Optimistic update** cho create/edit (rollback nếu error)

### 12.2 Error

- **Toast** cho action errors (create failed, network error)
- **Empty state component** cho empty list
- **Error boundary** cho unhandled errors → fallback UI
- **Inline error** cho form validation

---

## 13. URL conventions

- Resource routes: `/<resource>` (plural)
- Detail: `/<resource>/:id`
- Action: `/<resource>/:id/<action>` (e.g., `/patients/:id/edit`)
- Filters via query string: `/patients?status=active&q=nguyen`

---

## Related

- [PROJECT_RULES.md](../../PROJECT_RULES.md) — nguyên tắc thiết kế
- [ARCHITECTURE.md](../../ARCHITECTURE.md) — kiến trúc tổng thể
- [TECH_STACK.md](../../TECH_STACK.md) — tech stack backend