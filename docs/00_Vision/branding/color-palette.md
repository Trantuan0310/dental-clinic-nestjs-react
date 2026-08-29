# GENSMILE — Color Palette

> Quick-reference cho frontend devs. Token chính thức ở `frontend/tailwind.config.js`.

---

## Primary teal (`brand-*`)

```
brand-50   #E6FAF8   ███  ← light surface, hover background
brand-100  #C5EFEC   ███  ← selected row
brand-200  #A8D8D6   ███  ← border, badge
brand-400  #5CBDB9   ███  ← secondary accent
brand-500  #2BA3A0   ███  ← PRIMARY, button, link, icon
brand-600  #1B7A78   ███  ← hover on primary, wordmark text
brand-700  #155F5E   ███  ← pressed, dark heading
brand-800  #0F4746   ███  ← dark mode surface
brand-900  #082E2E   ███  ← dark mode background
```

## Warm accent (`accent-*`)

```
accent       #F4B860   ███  ← sparkle motif, "new" badge, celebration
accent-dark  #D49644   ███  ← sparkle hover
```

## Khuyến nghị dùng

| Ngữ cảnh | Token |
|---|---|
| Primary button | `bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white` |
| Selected nav item | `bg-brand-50 text-brand-700` |
| Icon trong logo | `fill-brand-500` (mặc định logo SVG đã set) |
| Wordmark text trong header | `text-brand-700 font-bold` |
| Focus ring | `ring-2 ring-brand-500 ring-offset-2 ring-offset-white` |
| Border accent / divider | `border-brand-200` |

## Accessibility (WCAG 2.1 AA)

| Combination | Ratio | Pass |
|---|---|---|
| `brand-700` text trên `white` | 9.5:1 | ✅ AAA |
| `brand-600` text trên `white` | 7.0:1 | ✅ AAA |
| `brand-500` text trên `white` | 3.4:1 | ⚠ chỉ dùng cho UI controls lớn, không dùng body text |
| `brand-500` button bg + white text | 3.4:1 | ✅ đủ cho graphics (UIAA 3:1) |
| `brand-500` border trên white (form input) | — | ✅ dùng cho non-text contrast |
