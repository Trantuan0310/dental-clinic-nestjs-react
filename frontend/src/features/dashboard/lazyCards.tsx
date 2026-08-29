// =============================================================================
// Lazy-loaded Dashboard cards
// Code-splitting entrypoint: defers loading recharts-heavy cards until they
// are actually rendered on the page.
// =============================================================================
import { lazy, Suspense, type ComponentProps } from 'react';
import { CardSkeleton } from '@/components/ui';

// Lightweight cards stay in the main bundle.
export { KpiRow } from './cards';

// Heavy recharts-based cards are split into separate chunks.
const CustomerTypeCard = lazy(() =>
  import('./cards').then((m) => ({ default: m.CustomerTypeCard })),
);
const ProcedureCard = lazy(() =>
  import('./cards').then((m) => ({ default: m.ProcedureCard })),
);
const DailyChartCard = lazy(() =>
  import('./cards').then((m) => ({ default: m.DailyChartCard })),
);
const MonthlyChartCard = lazy(() =>
  import('./cards').then((m) => ({ default: m.MonthlyChartCard })),
);

// Wrappers with Suspense fallback so consumers don't need to handle loading.
export function LazyCustomerTypeCard(props: ComponentProps<typeof CustomerTypeCard>) {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <CustomerTypeCard {...props} />
    </Suspense>
  );
}

export function LazyProcedureCard(props: ComponentProps<typeof ProcedureCard>) {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <ProcedureCard {...props} />
    </Suspense>
  );
}

export function LazyDailyChartCard(props: ComponentProps<typeof DailyChartCard>) {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <DailyChartCard {...props} />
    </Suspense>
  );
}

export function LazyMonthlyChartCard(props: ComponentProps<typeof MonthlyChartCard>) {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <MonthlyChartCard {...props} />
    </Suspense>
  );
}
