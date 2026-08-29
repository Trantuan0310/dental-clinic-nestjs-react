# Calendar Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Display and manage appointments in calendar view.

## Props

```typescript
interface CalendarProps {
  view?: 'day' | 'week' | 'month';
  selectedDate?: Date;
  onDateChange?: (date: Date) => void;
  events?: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  onSlotClick?: (slot: TimeSlot) => void;
  slotDuration?: number; // minutes, default 30
  startHour?: number; // 0-23, default 8
  endHour?: number; // 0-23, default 18
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status: AppointmentStatus;
  patient?: { name: string; code: string };
  dentistId?: string;
  color?: string;
}
```

## Views

### Day View
- Hour rows (configurable)
- Time column on left
- Events positioned by time

### Week View
- 7 day columns
- Condensed day headers
- Scrollable if many events

### Month View
- Traditional calendar grid
- Event count per day
- Click to see day detail

## Event Display
- Color-coded by status
- Patient name + time
- Duration determines height
- Overlap handling

## Interaction
- Click event → detail view
- Click empty slot → new appointment
- Drag event → reschedule (future)
- Resize event → change duration (future)

## Accessibility
- Keyboard navigation
- Screen reader events list alternative
- Focus management

## Related
- Design system: [../design-system.md](../design-system.md)
- Appointments: [../../03_Specification/Appointments/SPEC.md](../../03_Specification/Appointments/SPEC.md)
