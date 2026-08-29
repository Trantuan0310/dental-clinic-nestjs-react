export type SummarySource = 'gemini' | 'fallback';
export type SummaryIcon = 'alert' | 'clock' | 'stethoscope';

export interface SummaryBullet {
  id: 'allergy' | 'open' | 'next';
  icon: SummaryIcon;
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
