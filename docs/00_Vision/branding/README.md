# Branding — GENSMILE

Visual identity assets và guidelines cho **GENSMILE — Nha khoa thẩm mỹ**.

## Files trong thư mục này

| File | Mục đích |
|---|---|
| `usage-guidelines.md` | **Single source of truth** — logo rules, color tokens, typography, clear-space, do/don't |
| `color-palette.md` | Quick-reference cho frontend devs (brand-* tokens + WCAG ratios) |
| `logo-full.svg` | Full logo (icon + wordmark + tagline) — nền sáng |
| `logo-full-light.svg` | Full logo với text trắng — nền tối |
| `logo-icon.svg` | Icon only (tooth + sparkles) — favicon, PWA |
| `logo-icon-mono.svg` | Icon currentColor — inline theo text color |
| `favicon.svg` | Tab favicon |

## Quy tắc vàng

1. **Logo chỉ render qua component** — `<Logo />` từ `frontend/src/components/brand/Logo.tsx`. Không embed SVG inline ngoài component.
2. **Màu brand chỉ lấy từ tokens** — `brand-*` (teal) hoặc `accent` (sparkle gold). Đừng hardcode hex.
3. **Wordmark luôn viết HOA toàn bộ** — `GENSMILE`, không `Gensmile` / `Gen Smile`.
4. **Tagline** — `Nha khoa thẩm mỹ` (giữ dấu đầy đủ NFC).

## Liên kết

- Source code: `frontend/src/components/brand/Logo.tsx`
- Tailwind config: `frontend/tailwind.config.js` (phần `brand`)
- Design system reference: `docs/06_UI/design-system.md`
- Active usage examples: `Header.tsx`, `Sidebar.tsx`, `LoginPage.tsx`
