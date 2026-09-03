export type SummarySource = 'gemini' | 'fallback';
export type SummaryIcon = 'alert' | 'clock' | 'stethoscope';

export interface SummaryBullet {
  id: 'allergy' | 'open' | 'next';
  icon: SummaryIcon;
  label: string;
  text: string;
  /**
   * Human-readable pointer to where this bullet's content came from in the
   * patient's record, so staff can verify it themselves instead of taking
   * the AI's word for it (per the card's own "AI có thể sai" disclaimer).
   */
  basis: string;
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
