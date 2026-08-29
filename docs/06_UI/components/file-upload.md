# FileUpload Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
File selection and upload interface.

## Variants
- Drag-and-drop zone
- Button-based file picker
- With preview (for images)

## Props

```typescript
interface FileUploadProps {
  label?: string;
  accept?: string; // e.g., 'image/*', '.pdf'
  maxSize?: number; // in bytes
  maxFiles?: number;
  files?: File[];
  onFilesChange?: (files: File[]) => void;
  isMultiple?: boolean;
  showPreview?: boolean;
  isDisabled?: boolean;
  error?: string;
}
```

## Features
- Drag-and-drop support
- File type validation
- Size limit enforcement
- Progress indicator
- Preview for images
- Remove file button

## States
- Default (dashed border zone)
- Drag over (highlighted)
- Uploading (progress bar)
- Uploaded (file list)
- Error (file type/size exceeded)

## Accessibility
- Keyboard accessible
- Screen reader announcements for drag-drop
- Status updates during upload

## Related
- Design system: [../design-system.md](../design-system.md)
