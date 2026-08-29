import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { medicalRecordsApi } from '@/features/medical-records/imperativeApi';
import type {
  Encounter,
  EncounterListItem,
  ToothStatus,
} from '@/types/medical-records';

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
  pageSize?: number;
  includeCancelled?: boolean;
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

function asNumber(toothNumber: number | string): number | null {
  if (typeof toothNumber === 'number' && Number.isFinite(toothNumber)) return toothNumber;
  if (typeof toothNumber === 'string') {
    const n = Number(toothNumber);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function sanitizeStatus(value: unknown): ToothStatus | null {
  if (typeof value !== 'string') return null;
  return ALLOWED_STATUSES.includes(value as ToothStatus) ? (value as ToothStatus) : null;
}

function statusIsProblematic(status: ToothStatus | null | undefined): boolean {
  if (!status) return false;
  return status !== 'healthy';
}

export function useToothHistory({ patientId, fdi, pageSize = 50, includeCancelled = false }: Options) {
  const encountersQuery = useQuery({
    enabled: !!patientId,
    queryKey: ['patients', patientId, 'encounters', { pageSize }],
    queryFn: () => medicalRecordsApi.listEncounters({ patientId: patientId!, pageSize }).then((r) => r.data),
    staleTime: 60_000,
  });

  const filteredItems = useMemo(
    () => ((encountersQuery.data as EncounterListItem[] | undefined) ?? []).filter((it) => (includeCancelled ? true : it.status !== 'cancelled')),
    [encountersQuery.data, includeCancelled],
  );

  // For each encounter, fetch the full payload to read treatments + dental chart + clinical note.
  const detailQueries = useQueries({
    queries: filteredItems.map((it) => ({
      queryKey: ['encounter', it.id],
      queryFn: () => medicalRecordsApi.getEncounter(it.id),
      staleTime: 60_000,
      enabled: !!it.id,
    })),
  });

  // Mirror query data into a plain Encounter[] so useMemo deps stay stable.
  const [detailResults, setDetailResults] = useState<Encounter[]>([]);
  useEffect(() => {
    setDetailResults(
      detailQueries.map((q) => q.data).filter((d): d is Encounter => !!d),
    );
  }, [detailQueries]);

  const history = useMemo<ToothHistory>(() => {
    if (!patientId || !fdi) return { ...EMPTY, fdi };
    const fdiKey = String(fdi);
    const timeline: ToothTimelineEntry[] = [];
    const treatments: ToothTreatmentEntry[] = [];
    let upcomingPlan: ToothUpcomingPlan | null = null;
    let lastVisitAt: string | undefined;

    for (const encounter of detailResults) {
      // Snapshot timeline (most recent encounter with snapshot wins).
      // Accept both array form (teeth: ToothRecord[]) and dict form (teeth: { fdi: { status, notes } }).
      const teeth: unknown = (encounter as { dentalChart?: { teeth?: unknown } }).dentalChart?.teeth;
      if (Array.isArray(teeth)) {
        const record = (teeth as Array<{ number?: string | number; surface?: unknown; status?: unknown; notes?: string | null }>).find(
          (t) => Number(t.number) === fdi || t.number === fdiKey,
        );
        if (record) {
          const status = sanitizeStatus(record.status) ?? sanitizeStatus(record.surface);
          if (status) {
            timeline.push({
              encounterId: encounter.id,
              encounterCode: encounter.code,
              dentistName: encounter.dentistName ?? encounter.dentist?.fullName,
              closedAt: encounter.closedAt ?? encounter.completedAt ?? undefined,
              status,
              notes: record.notes ?? '',
              fromChart: true,
            });
          }
        }
      } else if (teeth && typeof teeth === 'object') {
        const record = (teeth as Record<string, { status?: unknown; notes?: string | null }>)[fdiKey];
        if (record) {
          const status = sanitizeStatus(record.status);
          if (status) {
            timeline.push({
              encounterId: encounter.id,
              encounterCode: encounter.code,
              dentistName: encounter.dentistName ?? encounter.dentist?.fullName,
              closedAt: encounter.closedAt ?? encounter.completedAt ?? undefined,
              status,
              notes: record.notes ?? '',
              fromChart: true,
            });
          }
        }
      }

      // Treatments.
      for (const line of encounter.treatments ?? []) {
        if (asNumber(line.toothNumber) !== fdi) continue;
        treatments.push({
          id: line.id,
          encounterId: encounter.id,
          encounterCode: encounter.code,
          dentistName: encounter.dentistName ?? encounter.dentist?.fullName,
          closedAt: encounter.closedAt ?? encounter.completedAt,
          treatmentName: line.treatmentName ?? line.procedureName ?? line.treatmentCode,
          treatmentCode: line.treatmentCode ?? line.procedureCode,
          description: line.description ?? line.notes,
          priceCents: line.priceCents ?? line.unitPrice ?? 0,
          quantity: line.quantity,
          performedAt: (line as { performedAt?: string | null }).performedAt,
          createdAt: line.createdAt,
        });
      }

      // Upcoming plan: encounter in_progress with treatments or plan mentioning the tooth.
      if (encounter.status === 'in_progress') {
        const hasTreatment = (encounter.treatments ?? []).some((t) => asNumber(t.toothNumber) === fdi);
        const plan = encounter.clinicalNote?.plan ?? undefined;
        const diagnosis = encounter.diagnosis ?? encounter.clinicalNote?.assessment;
        if (hasTreatment || (plan && new RegExp(`\\b${fdi}\\b`).test(plan))) {
          if (!upcomingPlan) {
            upcomingPlan = {
              encounterId: encounter.id,
              encounterCode: encounter.code,
              dentistName: encounter.dentistName ?? encounter.dentist?.fullName,
              startedAt: encounter.startedAt,
              status: 'in_progress',
              treatmentPlan: plan ?? null,
              diagnosis: diagnosis ?? null,
              chiefComplaint: encounter.chiefComplaint ?? encounter.clinicalNote?.subjective ?? null,
            };
          }
        }
      }

      const visitAt = encounter.closedAt ?? encounter.completedAt ?? encounter.startedAt;
      if (visitAt && (!lastVisitAt || new Date(visitAt) > new Date(lastVisitAt))) {
        lastVisitAt = visitAt;
      }
    }

    timeline.sort((a, b) => {
      const at = a.closedAt ? new Date(a.closedAt).getTime() : 0;
      const bt = b.closedAt ? new Date(b.closedAt).getTime() : 0;
      return bt - at;
    });
    treatments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const current = timeline[0];
    // Fallback: infer status from most recent treatment if no chart snapshot.
    let currentStatus: ToothStatus | null = current?.status ?? null;
    const currentNotes: string = current?.notes ?? '';
    if (!currentStatus) {
      const latestTx = treatments[0];
      if (latestTx) {
        const code = (latestTx.treatmentCode ?? '').toLowerCase();
        if (code.includes('extract') || code.includes('nhổ')) currentStatus = 'extraction_needed';
        else if (code.includes('implant')) currentStatus = 'implant';
        else if (code.includes('crown') || code.includes('mão')) currentStatus = 'crowned';
        else if (code.includes('filling') || code.includes('trám') || code.includes('endo')) currentStatus = 'filled';
        else if (code.includes('cavity') || code.includes('sâu')) currentStatus = 'cavity';
        else currentStatus = 'filled';
      }
    }

    return {
      fdi,
      currentStatus,
      currentNotes,
      timeline,
      treatments,
      upcomingPlan,
      totalEncountersWithTreatments: new Set(treatments.map((t) => t.encounterId)).size,
      lastVisitAt,
    };
  }, [detailResults, patientId, fdi]);

  return {
    history,
    isLoading: encountersQuery.isLoading,
    isFetchingDetails: detailQueries.some((d) => d.isFetching),
    items: filteredItems,
    hasProblem: statusIsProblematic(history.currentStatus),
  };
}

export function toothIsProblematic(status: ToothStatus | null | undefined): boolean {
  return statusIsProblematic(status);
}