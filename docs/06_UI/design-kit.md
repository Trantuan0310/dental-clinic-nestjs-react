<!-- design-kit:generated — do not edit by hand; regenerate with generate_design_md -->
<!-- dsfp:01hnjano vars:19 text:5 paint:0 effect:0 components:7 -->

# Đồ Án Tốt Nghiệp Design System

Extraction scope: Entire document
Current page when extracted: UI Screens
Pages discovered: Page 1, UI Screens

## Overview
Đồ Án Tốt Nghiệp exposes 0 component set(s), 7 standalone component(s), and 0 set variant node(s), plus 19 variables across 1 collection(s) and 5 local styles.

**Key Characteristics To Confirm:**
- Primary brand colors: see the Colors section. Confirm semantic roles from screenshots before assigning brand meaning.
- Type system: see Typography. Numeric/display roles must be inferred from text style names and actual UI usage.
- Theme model: inspect color collection modes and page usage; do not assume light/dark behavior unless variables or screens show it.
- Component reuse: components below list exact property keys where Figma exposes them.

## Extraction Coverage
- Pages scanned: 2
- Local components returned: 7/7
- Screens summarized: 0/53
- Instances inspected: 0/0
- Component anatomy depth: 2; screen evidence depth: 4
- Screen evidence: not requested; component usage: included
- Partial extraction: 0 component(s), 53 screen(s), and 0 instance(s) omitted by limits.

> Evidence labels: IDs, keys, properties, values, counts, and geometry are direct Figma facts. Pattern summaries are observations from the scanned nodes. Product meaning, UX intent, and breakpoint semantics remain unknown unless explicitly named or described in Figma.

## Colors
### Variable Colors
#### brand
- **50** (`{brand/50}`): Mode 1: #e6faf8
- **100** (`{brand/100}`): Mode 1: #c5efec
- **500** (`{brand/500}`): Mode 1: #2ba3a0
- **600** (`{brand/600}`): Mode 1: #1b7a78
#### primary
- **100** (`{primary/100}`): Mode 1: #dbeafe
- **500** (`{primary/500}`): Mode 1: #3b82f6
#### gray
- **50** (`{gray/50}`): Mode 1: #f9fafb
- **100** (`{gray/100}`): Mode 1: #f3f4f6
- **200** (`{gray/200}`): Mode 1: #e5e7eb
- **500** (`{gray/500}`): Mode 1: #6b7280
- **700** (`{gray/700}`): Mode 1: #374151
- **900** (`{gray/900}`): Mode 1: #111827
#### Other
- **white** (`{white}`): Mode 1: #ffffff
#### red
- **50** (`{red/50}`): Mode 1: #fef2f2
- **600** (`{red/600}`): Mode 1: #dc2626
#### green
- **50** (`{green/50}`): Mode 1: #f0fdf4
- **600** (`{green/600}`): Mode 1: #16a34a
#### amber
- **50** (`{amber/50}`): Mode 1: #fffbeb
- **600** (`{amber/600}`): Mode 1: #d97706

## Typography
| Token | Family | Style | Size | Line Height | Letter Spacing | Use |
|---|---|---:|---:|---:|---:|---|
| `{typography.h1}` | Inter | Semi Bold | 24 | {"unit":"AUTO"} | {"unit":"PERCENT","value":0} | Section headings |
| `{typography.h2}` | Inter | Semi Bold | 18 | {"unit":"AUTO"} | {"unit":"PERCENT","value":0} | Section headings |
| `{typography.body}` | Inter | Regular | 14 | {"unit":"AUTO"} | {"unit":"PERCENT","value":0} | Body copy |
| `{typography.label}` | Inter | Medium | 13 | {"unit":"AUTO"} | {"unit":"PERCENT","value":0} | Labels and metadata |
| `{typography.small}` | Inter | Regular | 12 | {"unit":"AUTO"} | {"unit":"PERCENT","value":0} | Confirm usage from component/page context |

### Typography Principles
- Use the named text styles above before hardcoding font values.
- If multiple number/table styles exist, reserve them for prices, counts, totals, metrics and dense tabular data.
- If a font is unavailable locally, check `get_fonts` before substituting; keep size/line-height close to the extracted style.

## Layout
### Component Layout Patterns
- `Button/Primary`: layoutMode=HORIZONTAL, itemSpacing=8, padding={"left":16,"right":16,"top":0,"bottom":0}, primaryAxisSizingMode=AUTO, counterAxisSizingMode=FIXED, primaryAxisAlignItems=CENTER, counterAxisAlignItems=CENTER, clipsContent=false
- `Button/Secondary`: layoutMode=HORIZONTAL, itemSpacing=8, padding={"left":16,"right":16,"top":0,"bottom":0}, primaryAxisSizingMode=AUTO, counterAxisSizingMode=FIXED, primaryAxisAlignItems=CENTER, counterAxisAlignItems=CENTER, clipsContent=false
- `Badge/Happy`: layoutMode=HORIZONTAL, itemSpacing=8, padding={"left":10,"right":10,"top":4,"bottom":4}, primaryAxisSizingMode=AUTO, counterAxisSizingMode=AUTO, primaryAxisAlignItems=MIN, counterAxisAlignItems=MIN, clipsContent=false
- `Badge/Warning`: layoutMode=HORIZONTAL, itemSpacing=8, padding={"left":10,"right":10,"top":4,"bottom":4}, primaryAxisSizingMode=AUTO, counterAxisSizingMode=AUTO, primaryAxisAlignItems=MIN, counterAxisAlignItems=MIN, clipsContent=false
- `Badge/Neutral`: layoutMode=HORIZONTAL, itemSpacing=8, padding={"left":10,"right":10,"top":4,"bottom":4}, primaryAxisSizingMode=AUTO, counterAxisSizingMode=AUTO, primaryAxisAlignItems=MIN, counterAxisAlignItems=MIN, clipsContent=false
- `Badge/Error`: layoutMode=HORIZONTAL, itemSpacing=8, padding={"left":10,"right":10,"top":4,"bottom":4}, primaryAxisSizingMode=AUTO, counterAxisSizingMode=AUTO, primaryAxisAlignItems=MIN, counterAxisAlignItems=MIN, clipsContent=false
- `Input/Default`: layoutMode=VERTICAL, itemSpacing=6, padding={"left":0,"right":0,"top":0,"bottom":0}, primaryAxisSizingMode=AUTO, counterAxisSizingMode=FIXED, primaryAxisAlignItems=MIN, counterAxisAlignItems=MIN, clipsContent=false

## Observed Layout & Visual Patterns
_No repeated raw-node patterns were extracted. Token/style sections remain authoritative where present._

## Elevation & Depth
_No local effect styles found. Treat elevation as flat unless component anatomy shows shadows._

## Shapes
### Observed Component Radii
- `Button/Primary`: cornerRadius=8, topLeftRadius=8, topRightRadius=8, bottomRightRadius=8, bottomLeftRadius=8
- `Button/Secondary`: cornerRadius=8, topLeftRadius=8, topRightRadius=8, bottomRightRadius=8, bottomLeftRadius=8
- `Badge/Happy`: cornerRadius=999, topLeftRadius=999, topRightRadius=999, bottomRightRadius=999, bottomLeftRadius=999
- `Badge/Warning`: cornerRadius=999, topLeftRadius=999, topRightRadius=999, bottomRightRadius=999, bottomLeftRadius=999
- `Badge/Neutral`: cornerRadius=999, topLeftRadius=999, topRightRadius=999, bottomRightRadius=999, bottomLeftRadius=999
- `Badge/Error`: cornerRadius=999, topLeftRadius=999, topRightRadius=999, bottomRightRadius=999, bottomLeftRadius=999

## Agent Rules
- Reuse listed components before drawing equivalent new UI.
- Use component properties and variants when available; use layer overrides only as a fallback.
- Use variables/styles by name instead of hardcoded values when a matching token exists.
- Treat node IDs as bindings to this exact Figma file. After duplicating/migrating a file, resolve by component key/name and refresh IDs before writing.
- Treat frequency observations as candidates, not semantic tokens, unless a matching Figma variable/style or explicit description confirms them.
- After creating or modifying UI, run `layout_audit` on the changed frame.
- Treat this file as source-grounded. Fill narrative gaps only after reading screenshots, selected nodes, or additional Figma pages.

## Variables
### Reqwise Tokens (Mode 1)
- `brand/50` (COLOR) = Mode 1: #e6faf8
- `brand/100` (COLOR) = Mode 1: #c5efec
- `brand/500` (COLOR) = Mode 1: #2ba3a0
- `brand/600` (COLOR) = Mode 1: #1b7a78
- `primary/100` (COLOR) = Mode 1: #dbeafe
- `primary/500` (COLOR) = Mode 1: #3b82f6
- `gray/50` (COLOR) = Mode 1: #f9fafb
- `gray/100` (COLOR) = Mode 1: #f3f4f6
- `gray/200` (COLOR) = Mode 1: #e5e7eb
- `gray/500` (COLOR) = Mode 1: #6b7280
- `gray/700` (COLOR) = Mode 1: #374151
- `gray/900` (COLOR) = Mode 1: #111827
- `white` (COLOR) = Mode 1: #ffffff
- `red/50` (COLOR) = Mode 1: #fef2f2
- `red/600` (COLOR) = Mode 1: #dc2626
- `green/50` (COLOR) = Mode 1: #f0fdf4
- `green/600` (COLOR) = Mode 1: #16a34a
- `amber/50` (COLOR) = Mode 1: #fffbeb
- `amber/600` (COLOR) = Mode 1: #d97706

## Styles
### Text
- `H1` - font={"family":"Inter","style":"Semi Bold","variationSettings":{"slnt":0,"wght":600}} 24
- `H2` - font={"family":"Inter","style":"Semi Bold","variationSettings":{"slnt":0,"wght":600}} 18
- `Body` - font={"family":"Inter","style":"Regular","variationSettings":{"slnt":0,"wght":400}} 14
- `Label` - font={"family":"Inter","style":"Medium","variationSettings":{"slnt":0,"wght":500}} 13
- `Small` - font={"family":"Inter","style":"Regular","variationSettings":{"slnt":0,"wght":400}} 12

## Components
### Button/Primary
- Type: COMPONENT (UI Screens/Frame/Button/Primary)
- Figma node ID: `6:4324`
- Figma component key: `56497cbff59e817ff6836be0da04cde944dd65c3`
- Source page: UI Screens
- Layout: layoutMode=HORIZONTAL, itemSpacing=8, padding={"left":16,"right":16,"top":0,"bottom":0}, primaryAxisSizingMode=AUTO, counterAxisSizingMode=FIXED, primaryAxisAlignItems=CENTER, counterAxisAlignItems=CENTER, clipsContent=false
- Shape: cornerRadius=8, topLeftRadius=8, topRightRadius=8, bottomRightRadius=8, bottomLeftRadius=8
- Text layers:
  - `Button/Primary/Tạo mới`: "Tạo mới" constraints={"horizontal":"MIN","vertical":"MIN"}
- Anatomy:
  - `Button/Primary` (COMPONENT; 86x40; layout=HORIZONTAL; fill=#2ba3a0; refs={})
  -   `Button/Primary/Tạo mới` (TEXT; 54x21; fill=#ffffff; text="Tạo mới"; refs={})
- Usage:
  - Find it with figma.findComponent("Button/Primary").
  - Instantiate with figma.instantiate("6:4324", { parentId, props, overrides }).
- Instantiate:
```js
await figma.instantiate("6:4324", {
  parentId: screen.id,
});
```

### Button/Secondary
- Type: COMPONENT (UI Screens/Frame/Button/Secondary)
- Figma node ID: `6:4328`
- Figma component key: `254ef5877c4b9084cad03f386080c2098bb8694f`
- Source page: UI Screens
- Layout: layoutMode=HORIZONTAL, itemSpacing=8, padding={"left":16,"right":16,"top":0,"bottom":0}, primaryAxisSizingMode=AUTO, counterAxisSizingMode=FIXED, primaryAxisAlignItems=CENTER, counterAxisAlignItems=CENTER, clipsContent=false
- Shape: cornerRadius=8, topLeftRadius=8, topRightRadius=8, bottomRightRadius=8, bottomLeftRadius=8
- Text layers:
  - `Button/Secondary/Huỷ`: "Huỷ" constraints={"horizontal":"MIN","vertical":"MIN"}
- Anatomy:
  - `Button/Secondary` (COMPONENT; 61x40; layout=HORIZONTAL; fill=#ffffff; refs={})
  -   `Button/Secondary/Huỷ` (TEXT; 27x21; fill=#374151; text="Huỷ"; refs={})
- Usage:
  - Find it with figma.findComponent("Button/Secondary").
  - Instantiate with figma.instantiate("6:4328", { parentId, props, overrides }).
- Instantiate:
```js
await figma.instantiate("6:4328", {
  parentId: screen.id,
});
```

### Badge/Happy
- Type: COMPONENT (UI Screens/Frame/Badge/Happy)
- Figma node ID: `6:4332`
- Figma component key: `8576e72ea2442a58a07e2dd8a40665398619199a`
- Source page: UI Screens
- Layout: layoutMode=HORIZONTAL, itemSpacing=8, padding={"left":10,"right":10,"top":4,"bottom":4}, primaryAxisSizingMode=AUTO, counterAxisSizingMode=AUTO, primaryAxisAlignItems=MIN, counterAxisAlignItems=MIN, clipsContent=false
- Shape: cornerRadius=999, topLeftRadius=999, topRightRadius=999, bottomRightRadius=999, bottomLeftRadius=999
- Text layers:
  - `Badge/Happy/PAID`: "PAID" constraints={"horizontal":"MIN","vertical":"MIN"}
- Anatomy:
  - `Badge/Happy` (COMPONENT; 48x26; layout=HORIZONTAL; fill=#f0fdf4; refs={})
  -   `Badge/Happy/PAID` (TEXT; 28x18; fill=#16a34a; text="PAID"; refs={})
- Usage:
  - Find it with figma.findComponent("Badge/Happy").
  - Instantiate with figma.instantiate("6:4332", { parentId, props, overrides }).
- Instantiate:
```js
await figma.instantiate("6:4332", {
  parentId: screen.id,
});
```

### Badge/Warning
- Type: COMPONENT (UI Screens/Frame/Badge/Warning)
- Figma node ID: `6:4336`
- Figma component key: `73dc5a4ef03649a3057f019a72dcac7af2d27a05`
- Source page: UI Screens
- Layout: layoutMode=HORIZONTAL, itemSpacing=8, padding={"left":10,"right":10,"top":4,"bottom":4}, primaryAxisSizingMode=AUTO, counterAxisSizingMode=AUTO, primaryAxisAlignItems=MIN, counterAxisAlignItems=MIN, clipsContent=false
- Shape: cornerRadius=999, topLeftRadius=999, topRightRadius=999, bottomRightRadius=999, bottomLeftRadius=999
- Text layers:
  - `Badge/Warning/PARTIAL`: "PARTIAL" constraints={"horizontal":"MIN","vertical":"MIN"}
- Anatomy:
  - `Badge/Warning` (COMPONENT; 70x26; layout=HORIZONTAL; fill=#fffbeb; refs={})
  -   `Badge/Warning/PARTIAL` (TEXT; 50x18; fill=#d97706; text="PARTIAL"; refs={})
- Usage:
  - Find it with figma.findComponent("Badge/Warning").
  - Instantiate with figma.instantiate("6:4336", { parentId, props, overrides }).
- Instantiate:
```js
await figma.instantiate("6:4336", {
  parentId: screen.id,
});
```

### Badge/Neutral
- Type: COMPONENT (UI Screens/Frame/Badge/Neutral)
- Figma node ID: `6:4340`
- Figma component key: `5914bb564eeee16543a69dc43235a495ee1c4d47`
- Source page: UI Screens
- Layout: layoutMode=HORIZONTAL, itemSpacing=8, padding={"left":10,"right":10,"top":4,"bottom":4}, primaryAxisSizingMode=AUTO, counterAxisSizingMode=AUTO, primaryAxisAlignItems=MIN, counterAxisAlignItems=MIN, clipsContent=false
- Shape: cornerRadius=999, topLeftRadius=999, topRightRadius=999, bottomRightRadius=999, bottomLeftRadius=999
- Text layers:
  - `Badge/Neutral/DRAFT`: "DRAFT" constraints={"horizontal":"MIN","vertical":"MIN"}
- Anatomy:
  - `Badge/Neutral` (COMPONENT; 60x26; layout=HORIZONTAL; fill=#f3f4f6; refs={})
  -   `Badge/Neutral/DRAFT` (TEXT; 40x18; fill=#374151; text="DRAFT"; refs={})
- Usage:
  - Find it with figma.findComponent("Badge/Neutral").
  - Instantiate with figma.instantiate("6:4340", { parentId, props, overrides }).
- Instantiate:
```js
await figma.instantiate("6:4340", {
  parentId: screen.id,
});
```

### Badge/Error
- Type: COMPONENT (UI Screens/Frame/Badge/Error)
- Figma node ID: `6:4344`
- Figma component key: `69f514951b8a76c8f46ccb5e18dba9ce31216ac1`
- Source page: UI Screens
- Layout: layoutMode=HORIZONTAL, itemSpacing=8, padding={"left":10,"right":10,"top":4,"bottom":4}, primaryAxisSizingMode=AUTO, counterAxisSizingMode=AUTO, primaryAxisAlignItems=MIN, counterAxisAlignItems=MIN, clipsContent=false
- Shape: cornerRadius=999, topLeftRadius=999, topRightRadius=999, bottomRightRadius=999, bottomLeftRadius=999
- Text layers:
  - `Badge/Error/VOIDED`: "VOIDED" constraints={"horizontal":"MIN","vertical":"MIN"}
- Anatomy:
  - `Badge/Error` (COMPONENT; 65x26; layout=HORIZONTAL; fill=#fef2f2; refs={})
  -   `Badge/Error/VOIDED` (TEXT; 45x18; fill=#dc2626; text="VOIDED"; refs={})
- Usage:
  - Find it with figma.findComponent("Badge/Error").
  - Instantiate with figma.instantiate("6:4344", { parentId, props, overrides }).
- Instantiate:
```js
await figma.instantiate("6:4344", {
  parentId: screen.id,
});
```

### Input/Default
- Type: COMPONENT (UI Screens/Frame/Input/Default)
- Figma node ID: `6:4348`
- Figma component key: `11925247088b38b0bbabb7589357a09cc5f5f9fc`
- Source page: UI Screens
- Layout: layoutMode=VERTICAL, itemSpacing=6, padding={"left":0,"right":0,"top":0,"bottom":0}, primaryAxisSizingMode=AUTO, counterAxisSizingMode=FIXED, primaryAxisAlignItems=MIN, counterAxisAlignItems=MIN, clipsContent=false
- Text layers:
  - `Input/Default/Label`: "Label" constraints={"horizontal":"MIN","vertical":"MIN"}
  - `Input/Default/Frame/Placeholder`: "Placeholder" constraints={"horizontal":"MIN","vertical":"MIN"}
- Anatomy:
  - `Input/Default` (COMPONENT; 280x65; layout=VERTICAL; refs={})
  -   `Input/Default/Label` (TEXT; 34x19; fill=#374151; text="Label"; refs={})
  -   `Input/Default/Frame` (FRAME; 93x40; layout=HORIZONTAL; fill=#f9fafb; refs={})
  -     `Input/Default/Frame/Placeholder` (TEXT; 79x21; fill=#6b7280; text="Placeholder"; refs={})
- Usage:
  - Find it with figma.findComponent("Input/Default").
  - Instantiate with figma.instantiate("6:4348", { parentId, props, overrides }).
- Instantiate:
```js
await figma.instantiate("6:4348", {
  parentId: screen.id,
});
```

## External & Library Components
_No remote-library component instances were identified in the inspected instance range._

## Screen Evidence
_No screen summaries were extracted. Do not infer page composition or responsive behavior from the component catalog alone._

## Do's and Don'ts
### Do
- Do use the extracted component names and property keys exactly as written.
- Do bind or reference color variables instead of hardcoding equivalent hex values.
- Do run `layout_audit` after non-trivial edits and fix overflow/clipping structurally.

### Don't
- Don't create look-alike components when an equivalent component is listed above.
- Don't infer brand semantics from token names alone; confirm with actual screens or screenshots.
- Don't use hidden/truncated text layers as stable selectors unless component properties expose the same control.
- Don't treat this document as exhaustive when Known Gaps lists missing pages, screenshots or anatomy.

## Responsive Evidence
- Some component children expose Figma constraints. Preserve those resize rules when recreating components.
- Frame widths are observations, not breakpoints. Only document a responsive transformation when matching screens or explicit constraints support it.

## Iteration Guide
1. Start from the Figma IDs/keys in this document, then confirm the chosen binding with `get_component` before a large write.
2. Use exact component property keys from this file in `figma.instantiate(..., { props })`; use a variant ID when the desired set variant is explicit.
3. Use layer overrides only when a desired change has no component property.
4. For code implementation, map Figma variables/styles to design tokens first, then compose components.
5. After generating or editing UI, run `layout_audit`; after major visual changes, take a screenshot for human review.

## Known Gaps
- No component property definitions were found; component customization may rely on layer overrides.
- 53 screen(s) were omitted by extraction limits.
- Screen evidence was not included, so page composition, hierarchy and responsive behavior are unknown.

## Notes
- Generated from local Figma styles, variables and components plus bounded screen/instance evidence.
- Component property names are the exact API keys to pass to instance.setProperties.
- Observed frequency patterns are evidence, not automatically approved semantic tokens.
