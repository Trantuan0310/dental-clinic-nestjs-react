# KPICard Component

> **Status:** TODO — Spec will be created during Phase 7 (UI Implementation)

## Purpose
Highlight key metrics with trend indicators for dashboards.

## Props

```typescript
interface KPICardProps {
  title: string;
  value: string | number;
  previousValue?: string | number;
  format?: 'number' | 'currency' | 'percentage';
  currencyCode?: string; // 'VND' default
  icon?: ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  accentColor?: string;
}
```

## Usage Example

```tsx
<KPICard
  title="Doanh thu hôm nay"
  value={12500000}
  format="currency"
  previousValue={10000000}
  trend="up"
  trendLabel="+25% so với hôm qua"
  icon={<DollarSign />}
/>
```

## Display

```
┌─────────────────────────────────────┐
│ 💰 Doanh thu hôm nay                │
│                                     │
│    12.500.000 ₫                    │
│                                     │
│    ↑ +25% so với hôm qua           │
└─────────────────────────────────────┘
```

## Features
- Formatted numbers (1.000.000 ₫)
- Trend indicator (up/down arrow)
- Percentage change
- Comparison with previous period

## Colors
- Up: green (success)
- Down: red (danger)
- Neutral: gray

## Accessibility
- Screen reader format for numbers
- Trend announced properly

## Related
- Design system: [../design-system.md](../design-system.md)
