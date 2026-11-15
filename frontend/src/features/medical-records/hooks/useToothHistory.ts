import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ToothStatus } from '@/types/medical-records';

export interface ToothTimelineEntry {
  encounterId: string;
  encounterCode?: string;
  dentistName?: string;
  closedAt?: string;
  status: ToothStatus;
  notes: string;
  fromChart?: boolean;
}

export interface ToothTreatmentEntry {
  id: string;
  encounterId: string;
  encounterCode?: string;
  dentistName?: string;
  closedAt?: string | null;
  treatmentName: string;
  treatmentCode?: string;
  description?: string | null;
  priceCents: number;
  quantity: number;
  performedAt?: string | null;
  createdAt: string;
}

export interface ToothUpcomingPlan {
  encounterId: string;
  encounterCode?: string;
  dentistName?: string;
  startedAt: string;
  status: 'in_progress';
  treatmentPlan?: string | null;
  diagnosis?: string | null;
  chiefComplaint?: string | null;
}

export interface ToothHistory {
  fdi: number;
  currentStatus: ToothStatus | null;
  currentNotes: string;
  timeline: ToothTimelineEntry[];
  treatments: ToothTreatmentEntry[];
  upcomingPlan: ToothUpcomingPlan | null;
  totalEncountersWithTreatments: number;
  lastVisitAt?: string;
}

interface Options {
  patientId?: string | null;
  fdi: number;
}

/** One encounter as GET /patients/:id/teeth/:fdi/history returns it: only this tooth. */
interface ToothVisit {
  id: string;
  status: string;
  startedAt: string;
  closedAt: string | null;
  dentistName: string;
  treatmentPlan: string | null;
  diagnosis: string | null;
  chiefComplaint: string | null;
  toothChart: { status?: unknown; surface?: unknown; notes?: string | null } | null;
  treatments: Array<{
    id: string;
    encounterId: string;
    treatmentName: string;
    treatmentCode: string;
    description: string | null;
    priceCents: number;
    quantity: number;
    createdAt: string;
  }>;
}

const EMPTY: ToothHistory = {
  fdi: 0,
  currentStatus: null,
  currentNotes: '',
  timeline: [],
  treatments: [],
  upcomingPlan: null,
  totalEncountersWithTreatments: 0,
};

const ALLOWED_STATUSES: ToothStatus[] = [
  'healthy',
  'cavity',
  'filled',
  'crowned',
  'missing',
  'implant',
  'extraction_needed',
];

function sanitizeStatus(value: unknown): ToothStatus | null {
  if (typeof value !== 'string') return null;
  return ALLOWED_STATUSES.includes(value as ToothStatus) ? (value as ToothStatus) : null;
}

function statusIsProblematic(status: ToothStatus | null | undefined): boolean {
  return !!status && status !== 'healthy';
}

/** Everything recorded about one tooth, from a single request (not one per encounter). */
export function useToothHistory({ patientId, fdi }: Options) {
  const query = useQuery({
    enabled: !!patientId && fdi > 0,
    queryKey: ['patients', patientId, 'tooth-history', fdi],
    queryFn: () =>
      api.get<{ data: ToothVisit[] }>(`/patients/${patientId}/teeth/${fdi}/history`).then((r) => r.data.data),
    staleTime: 30_000,
  });

  const history = useMemo<ToothHistory>(() => {
    if (!patientId || !fdi) return { ...EMPTY, fdi };
    const timeline: ToothTimelineEntry[] = [];
    const treatments: ToothTreatmentEntry[] = [];
    let upcomingPlan: ToothUpcomingPlan | null = null;
    let lastVisitAt: string | undefined;

    for (const visit of query.data ?? []) {
      const closedAt = visit.closedAt ?? undefined;
      const status = visit.toothChart && (sanitizeStatus(visit.toothChart.status) ?? sanitizeStatus(visit.toothChart.surface));
      if (status) {
        timeline.push({ encounterId: visit.id, dentistName: visit.dentistName, closedAt, status, notes: visit.toothChart?.notes ?? '', fromChart: true });
      }
      for (const line of visit.treatments) {
        treatments.push({ ...line, dentistName: visit.dentistName, closedAt: visit.closedAt });
      }
      const plan = visit.treatmentPlan ?? undefined;
      if (
        !upcomingPlan &&
        visit.status === 'in_progress' &&
        (visit.treatments.length > 0 || (plan && new RegExp(`\\b${fdi}\\b`).test(plan)))
      ) {
        upcomingPlan = {
          encounterId: visit.id,
          dentistName: visit.dentistName,
          startedAt: visit.startedAt,
          status: 'in_progress',
          treatmentPlan: plan ?? null,
          diagnosis: visit.diagnosis,
          chiefComplaint: visit.chiefComplaint,
        };
      }
      const visitAt = visit.closedAt ?? visit.startedAt;
      if (visitAt && (!lastVisitAt || new Date(visitAt) > new Date(lastVisitAt))) lastVisitAt = visitAt;
    }

    timeline.sort((a, b) => (b.closedAt ? new Date(b.closedAt).getTime() : 0) - (a.closedAt ? new Date(a.closedAt).getTime() : 0));
    treatments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Fallback: infer status from the most recent treatment when nothing was charted.
    let currentStatus: ToothStatus | null = timeline[0]?.status ?? null;
    if (!currentStatus && treatments[0]) {
      const code = (treatments[0].treatmentCode ?? '').toLowerCase();
      if (code.includes('extract') || code.includes('nhổ')) currentStatus = 'extraction_needed';
      else if (code.includes('implant')) currentStatus = 'implant';
      else if (code.includes('crown') || code.includes('mão')) currentStatus = 'crowned';
      else if (code.includes('cavity') || code.includes('sâu')) currentStatus = 'cavity';
      else currentStatus = 'filled';
    }

    return {
      fdi,
      currentStatus,
      currentNotes: timeline[0]?.notes ?? '',
      timeline,
      treatments,
      upcomingPlan,
      totalEncountersWithTreatments: new Set(treatments.map((t) => t.encounterId)).size,
      lastVisitAt,
    };
  }, [query.data, patientId, fdi]);

  return {
    history,
    isLoading: query.isLoading,
    isFetchingDetails: query.isFetching,
    hasProblem: statusIsProblematic(history.currentStatus),
  };
}

export function toothIsProblematic(status: ToothStatus | null | undefined): boolean {
  return statusIsProblematic(status);
}
