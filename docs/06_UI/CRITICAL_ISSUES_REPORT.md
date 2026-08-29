# CRITICAL ISSUES REPORT — Phase 7 UI Specification
**Auditor:** Senior Solution Architect
**Date:** 2026-07-15
**Files Audited:** design-system.md, admin.md, receptionist.md, dentist.md, billing-inventory.md, navigation-map.md
**Cross-referenced:** 6 module SPECs, actor-permissions-matrix.md, business-decisions.md, PROJECT_RULES.md
**Total Critical Issues:** 22 (after deduplication)

---

## Summary

These issues must be resolved by the Product Owner / Architecture Lead before implementation. They fall into four categories:

| Category | Count |
| ------- | ----- |
| Missing routes not in navigation-map | 8 |
| Permission contradictions with SPECs/matrix | 6 |
| Route parameter naming inconsistencies (`:id` vs `:code`/`:sku`) | 3 |
| Missing UI edge-case handling | 5 |

---

## Group 1: Missing Routes (8 issues)

These routes are defined in SPEC module §4 Screens tables but have NO entry in `navigation-map.md`.

### CR-01: Missing route `/patients/:id/phones`
- **File:** navigation-map.md
- **Current:** Not listed
- **Should be:** Listed as route `/patients/:id/phones` for phone history view
- **SPEC Reference:** Patient SPEC §4 (Screen: Patient phone history)
- **Decision Needed:** Confirm this screen is in scope for MVP UI

### CR-02: Missing route `/patients/:id/invoices`
- **File:** navigation-map.md
- **Current:** Not listed
- **Should be:** Listed as route `/patients/:id/invoices` (tab in Patient Detail)
- **SPEC Reference:** Billing SPEC §8.9 (Proxy endpoint: GET /patients/:id/invoices)
- **Decision Needed:** Confirm whether this tab is in MVP scope

### CR-03: Missing route `/patients/lookup`
- **File:** navigation-map.md
- **Current:** Not listed
- **Should be:** Listed as modal route `/patients/lookup`
- **SPEC Reference:** Patient SPEC §4 (Screen: Patient lookup modal)
- **Decision Needed:** Confirm this is a modal (no page route) — if so, document as `(modal)` in route table

### CR-04: Missing route `/admin/patients/deleted`
- **File:** navigation-map.md
- **Current:** Not listed
- **Should be:** Listed as route `/admin/patients/deleted`
- **SPEC Reference:** Patient SPEC §4 (Screen: Patient soft-deleted list)
- **Decision Needed:** Confirm Admin-only deleted patient management is in MVP scope

### CR-05: Missing route `/admin/patients/merge`
- **File:** navigation-map.md
- **Current:** Not listed
- **Should be:** Listed as route `/admin/patients/merge`
- **SPEC Reference:** Patient SPEC §4 (Screen: Patient merge)
- **Decision Needed:** Confirm patient merge feature is in MVP scope

### CR-06: Missing route `/encounters/:id/readonly`
- **File:** navigation-map.md
- **Current:** Not listed
- **Should be:** Listed as route `/encounters/:id` (when status=completed, renders read-only view)
- **SPEC Reference:** Medical Records SPEC §4 (Screen: Encounter detail read-only)
- **Decision Needed:** Confirm read-only encounter view for Receptionist is in MVP scope

### CR-07: Missing routes `/admin/inventory/items/new` and `/admin/inventory/categories`
- **File:** navigation-map.md
- **Current:** Not listed
- **Should be:** Listed as `/admin/inventory/items/new` and `/admin/inventory/categories`
- **SPEC Reference:** Inventory SPEC §4 (Screens: Item create/edit, Category manager)
- **Decision Needed:** Confirm Admin-only inventory management is in MVP scope

### CR-08: Missing route `/admin/encounters/:id/audit`
- **File:** navigation-map.md
- **Current:** Not listed
- **Should be:** Listed as route `/admin/encounters/:id/audit`
- **SPEC Reference:** Medical Records SPEC §4 (Screen: Encounter audit)
- **Decision Needed:** Confirm Admin-only encounter audit view is in MVP scope

---

## Group 2: Permission Contradictions (6 issues)

### CR-09: Admin Settings uses wrong permission `system.settings.read`
- **Files:** admin.md Screen 7, navigation-map.md
- **Current:** Permission = `system.settings.read`
- **Should be:** `settings.read` per actor-permissions-matrix §3.7
- **SPEC Reference:** actor-permissions-matrix.md §3.7
- **Decision Needed:** Either (A) Change UI spec to `settings.read`, or (B) Add `system.settings.read` to the permission matrix
- **Action:** Align permission name between UI spec and permission matrix

### CR-10: Role List uses `role.upsert` for viewing
- **File:** admin.md Screen 5
- **Current:** Route `/admin/roles` permission = `role.upsert`
- **Should be:** `role.read` for listing (only upsert for creating/editing)
- **SPEC Reference:** Auth SPEC §7.2: GET /admin/roles = `role.upsert` (but this is inconsistent with naming convention — `role.read` would be more appropriate)
- **Decision Needed:** Clarify: should listing roles require `role.upsert` or should there be a separate `role.read` permission?

### CR-11: Queue access permission contradiction (Dentist)
- **Files:** dentist.md Screen 2, navigation-map.md, receptionist.md Screen 7
- **Current:** Dentist sidebar shows `/my-queue`; no permission defined for route guard. Receptionist sidebar shows `/queue` with `appointment.check_in`
- **Should be:** Route guard must have explicit `requiredPermission`. For Dentist: `/my-queue` should require some permission (likely `appointment.read` since it reads appointments). Note: Dentist does NOT have `appointment.check_in` per matrix §3.2
- **SPEC Reference:** actor-permissions-matrix §3.2: Dentist has `appointment.cancel` (own) but NOT `appointment.check_in`. Queue content is fetched via `GET /appointments/waiting-queue` which requires `appointment.check_in` per Appointments SPEC §7.2
- **Decision Needed:** Option A: Add `appointment.read` permission to Dentist. Option B: Create a new `queue.read` permission. Option C: Queue is accessible to all authenticated users (no specific permission).
- **Impact:** If Dentist cannot access queue data via API, the `/my-queue` route serves no purpose

### CR-12: Inventory Alerts route has no permission
- **File:** navigation-map.md
- **Current:** `/inventory/alerts` route has no `requiredPermission` defined
- **Should be:** Must require `inventory.read` per Inventory SPEC §7.2
- **Decision Needed:** Confirm permission enforcement for alerts route

### CR-13: Stock Adjustment (Adjustment) shown to Receptionist
- **Files:** billing-inventory.md Screen B3, receptionist.md sidebar
- **Current:** Receptionist sidebar shows "Xuất nhập" (stock-in/out/adjust). Screen B3 shows all 4 adjustment types including Adjustment, which requires `inventory.adjust` (Admin-only per Inventory SPEC §7.1)
- **Should be:** Receptionist should only see stock-in and stock-out (which they have permission for), NOT adjustment
- **Decision Needed:** Clarify Receptionist's actual inventory permissions:
  - If Receptionist can only stock-in/out: adjust modal must be Admin-only
  - If Receptionist can adjust: add `inventory.adjust` to Receptionist's permission set

### CR-14: Dentist access to Revenue Report
- **Files:** navigation-map.md (Dentist section), billing-inventory.md Screen A1
- **Current:** Navigation map says `/reports/revenue` accessible to "Dentist" (with "own only" note); Screen A1 shows no permission
- **Should be:** Billing SPEC §7.1: `report.revenue.read` = Admin only. Dentist should NOT see revenue reports. Invoice access for Dentist is row-level (only invoices from their own encounters)
- **Decision Needed:** Either (A) Remove revenue report from Dentist sidebar, or (B) Add a separate `report.own_revenue.read` permission for Dentist
- **Impact:** If Dentist sidebar shows reports but backend denies, users get 403 errors

---

## Group 3: Route Parameter Naming Inconsistencies (3 issues)

### CR-15: Patient route uses `/patients/:id` vs `/patients/:code`
- **Files:** navigation-map.md, all patient-related screens
- **Current:** Route table shows `/patients/:id`; Patient SPEC §4 uses `/patients/:code`
- **Should be:** Use `/patients/:code` for human-readable, bookmarkable URLs (matches BD-0006 decision)
- **Decision Needed:** Choose `:id` (UUID) or `:code` (PAT-YYYY-NNNNN) for patient routes. Recommend `:code` for display routes.

### CR-16: Invoice route uses `/invoices/:id` vs `/invoices/:code`
- **Files:** navigation-map.md, all invoice screens
- **Current:** Route table shows `/invoices/:id`; Billing SPEC §4 uses `/invoices/:code`
- **Should be:** Use `/invoices/:code` for human-readable URLs
- **Decision Needed:** Choose `:id` or `:code`. Recommend `:code` for display routes.

### CR-17: Inventory Item route uses `/inventory/items/:id` vs `/inventory/items/:sku`
- **Files:** navigation-map.md, billing-inventory.md Screen B2
- **Current:** Route table shows `/inventory/items/:id`; Inventory SPEC §4 uses `/inventory/items/:sku`
- **Should be:** Use `/inventory/items/:sku` for human-readable URLs
- **Decision Needed:** Choose `:id` or `:sku`. Recommend `:sku` for display routes.

---

## Group 4: Missing UI Edge-Case Handling (5 issues)

### CR-18: No optimistic locking UI documented
- **Files:** design-system.md, billing-inventory.md Screen A2
- **Current:** No mention of optimistic locking UX pattern anywhere in UI specs
- **Should be:** design-system.md should document optimistic locking UX: when server returns 409 (version conflict), show "This record was modified by another user" dialog with options to reload or overwrite
- **SPEC Reference:** Billing SPEC §8.3: `If-Match: <version>` header for optimistic lock; BR-BILL-023
- **Decision Needed:** Document optimistic locking UX pattern in design-system.md

### CR-19: Invoice Void button state not tied to payment existence
- **Files:** receptionist.md Screen 9, billing-inventory.md
- **Current:** Invoice Detail shows "Hủy HĐ" button unconditionally. Screen 9 doesn't address BR-BILL-015 (void blocked if payments exist)
- **Should be:** "Hủy HĐ" button should be disabled/hidden when invoice has payments. Show tooltip "Không thể hủy hóa đơn đã có thanh toán"
- **Decision Needed:** Confirm: should the "Hủy" button be hidden or disabled when payments exist?

### CR-20: Toast auto-dismiss inconsistency
- **Files:** design-system.md §12.2, admin.md Toast notifications section
- **Current:** design-system says error = không auto-dismiss. Admin spec says success/error/warning durations but no spec for warning
- **Should be:** All screens must use consistent toast durations: success=5s, error=manual, warning=8s, info=5s
- **Decision Needed:** Confirm warning auto-dismiss duration (recommend 8s)

### CR-21: Missing tooth status `watch` from Dental Chart legend
- **Files:** dentist.md Screen 5.4, design-system.md
- **Current:** Dental Chart legend shows: normal, filled, caries, broken, extracted, crown, implant. Medical Records SPEC §5.1 defines enum also includes `watch` status
- **Should be:** Add `watch` (🌟 yellow?) to the dental chart legend and design-system tooth colors
- **Decision Needed:** What color should `watch` status use? Recommend `💛` yellow/amber

### CR-22: Check-in BR reference wrong
- **File:** receptionist.md Screen 6 Behavior
- **Current:** "Check-in time window: `[startAt - 15min, startAt + 30min]` (BR-APPT-018)"
- **Should be:** BR-APPT-006 (Appointments SPEC §6)
- **Decision Needed:** Just a documentation fix — update the BR reference number

---

## Recommended Priority Order

| Priority | Issue | Description |
| ------- | ----- | ----------- |
| P0 | CR-11 | Queue permission — blocks Dentist from using queue |
| P0 | CR-13 | Receptionist stock adjust — gives UI for forbidden action |
| P0 | CR-14 | Dentist revenue report — UI shows but backend denies |
| P1 | CR-15/16/17 | Route parameter naming — affects all routes |
| P1 | CR-09/10 | Permission name mismatches — will cause 403 errors |
| P1 | CR-18 | Optimistic locking — risk of data loss on concurrent edits |
| P1 | CR-19 | Void button state — UI allows action backend rejects |
| P2 | CR-01..08 | Missing routes — 8 features inaccessible |
| P2 | CR-20 | Toast consistency |
| P2 | CR-21 | Missing tooth status |
| P3 | CR-22 | Wrong BR reference |

---

## Files Modified During Audit (Major + Minor fixes only)

| File | Issues Fixed |
| ---- | ------------ |
| docs/06_UI/design-system.md | 4 (M1, M8, M17, N21) |
| docs/06_UI/navigation-map.md | 5 (M2, M10, M11, M12, CR-12) |
| docs/06_UI/screens/admin.md | 4 (M3, M4, M16, N3, N17) |
| docs/06_UI/screens/receptionist.md | 7 (M6, M13, M14, N4, N6, N7, N10) |
| docs/06_UI/screens/dentist.md | 1 (M15) |
| docs/06_UI/screens/billing-inventory.md | 4 (M9, M14, M18, N20) |

**Total: 18 Major + Minor fixes applied across 6 files.**

---

*This report was generated as part of Phase 7 UI Specification audit. All Critical issues require human decision before implementation.*

---

## 📌 Phase 10 Update (22/07/2026)

22 Critical Issues ở trên được tracked tiếp trong **Giai đoạn 10 — Code Quality & Documentation Cleanup** ([`ROADMAP.md`](../../ROADMAP.md)):

| Priority | Issues | Phase 10 outcome |
|---|---|---|
| **P0** | CR-11, CR-13, CR-14 | ⏳ Decision logged — đang pending Product Owner review; FE MVP không bị block (dùng canonical permission list) |
| **P1** | CR-09, CR-10, CR-15, CR-16, CR-17, CR-18, CR-19 | ⏳ Decision logged — backend đã enforce 403 đúng, FE có thể dựa vào đó |
| **P2** | CR-01 → CR-08, CR-20, CR-21 | ✅ Routes/edge-cases đã được cover bằng file component spec mới trong `docs/06_UI/components/` (28 file) |
| **P3** | CR-22 | ✅ Fixed (BR reference updated) |

**Tóm lại Phase 10:**
- Toàn bộ broken links trong `design-system.md` và `navigation-map.md` đã được fix bằng cách tạo 28 file component spec mới → CR-12 (missing permission), CR-20 (toast), CR-21 (tooth status `watch`) đã có reference đầy đủ.
- CR-15/16/17 (route param naming) → quyết định nghiêng về `:code`/`:sku` cho display routes (FE implement theo đó).
- CR-11/13/14 (permission conflict) → không thay đổi business rule; FE handle bằng `PermissionGuard` dựa trên seed canonical list.

> Xem chi tiết: [`ROADMAP.md` § Giai đoạn 10.1](../../ROADMAP.md), [`md_errors_report.md`](../../md_errors_report.md).
