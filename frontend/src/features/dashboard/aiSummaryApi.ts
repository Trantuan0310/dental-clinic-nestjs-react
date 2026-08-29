// AI summary imperative API. The DashboardPage renders an
// `AiSummaryCard` that hits `/ai/summary/patient/:id` directly via
// React Query. Located under features/dashboard/ as the canonical
// home (the legacy src/api/aiSummary.ts was a re-export).

import { api, unwrap } from '@/lib/api';

export type SummarySource = 'gemini' | 'fallback';

export interface SummaryBullet {
  id: 'allergy' | 'open' | 'next';
  icon: 'alert' | 'clock' | 'stethoscope';
  label: string;
  text: string;
}

export interface AiPatientSummary {
  patientId: string;
  generatedAt: string;
  source: SummarySource;
  model?: string;
  bullets: SummaryBullet[];
  asOf: {
    encounterCount: number;
    lastVisitAt?: string;
  };
  cached: boolean;
}

export const aiSummaryApi = {
  async getPatientSummary(patientId: string, options: { top?: number; refresh?: boolean } = {}): Promise<AiPatientSummary> {
    const params: Record<string, string> = {};
    if (options.top !== undefined) params.top = String(options.top);
    if (options.refresh) params.refresh = 'true';
    const { data } = await api.get<{ data: AiPatientSummary }>(`/ai/summary/patient/${patientId}`, {
      params,
    });
    return unwrap(data);
  },
};