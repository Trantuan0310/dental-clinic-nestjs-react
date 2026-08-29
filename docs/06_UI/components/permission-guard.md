# PermissionGuard Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Conditionally render UI based on user permissions.

## Props

```typescript
interface PermissionGuardProps {
  permission: string; // e.g., 'patient.create'
  fallback?: ReactNode;
  children: ReactNode;
}

// Also supports multiple permissions
interface MultiPermissionGuardProps {
  permissions: string[];
  mode?: 'all' | 'any'; // default: 'any'
  fallback?: ReactNode;
  children: ReactNode;
}
```

## Usage

```tsx
// Single permission
<PermissionGuard permission="patient.create">
  <Button onClick={handleAddPatient}>
    Thêm bệnh nhân
  </Button>
</PermissionGuard>

// Multiple permissions
<PermissionGuard
  permissions={['patient.read', 'patient.update']}
  mode="all"
  fallback={<Text>Không có quyền</Text>}
>
  <PatientEditor />
</PermissionGuard>
```

## Common Permission Codes

| Permission | Description |
|------------|-------------|
| `user.*` | All user operations |
| `patient.create` | Create patients |
| `patient.read` | View patients |
| `patient.update` | Edit patients |
| `appointment.check_in` | Check in appointments |
| `invoice.create` | Create invoices |
| `inventory.adjust` | Adjust inventory |

## Features
- Wraps any children
- Shows fallback when no permission
- No permission = no render (not 403 page)
- Server-side guard as backup

## Security Note
> **Important:** This is UX-only hiding. Server MUST enforce permissions with NestJS Guards. This component is for UI experience only.

## Accessibility
- Fallback content accessible
- No visual indication of missing permission

## Related
- Design system: [../design-system.md](../design-system.md)
- RBAC: [../../ADR/0004-permission-based-rbac.md](../../ADR/0004-permission-based-rbac.md)
