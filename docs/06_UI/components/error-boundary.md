# ErrorBoundary Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Catch and display unhandled errors in the component tree.

## Props

```typescript
interface ErrorBoundaryProps {
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  children: ReactNode;
}
```

## Default Fallback UI

```
┌─────────────────────────────────────┐
│                                     │
│          ⚠️ Đã xảy ra lỗi          │
│                                     │
│   Chúng tôi đã ghi nhận sự cố.     │
│   Vui lòng thử làm mới trang.       │
│                                     │
│        [Làm mới trang]              │
│                                     │
└─────────────────────────────────────┘
```

## Features
- Catch React render errors
- Log errors to error reporting service (e.g., Sentry)
- Provide reset functionality
- Fallback UI with helpful message

## Error Reporting
- Capture stack trace
- Capture component stack
- Send to error tracking service

## Accessibility
- Error message readable by screen readers
- Reset button accessible

## Related
- Design system: [../design-system.md](../design-system.md)
