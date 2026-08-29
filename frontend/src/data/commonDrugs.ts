// Common dental prescription drugs (Vietnamese names + default dosage/frequency/duration).
// Used by PrescriptionFormModal to autocomplete drugName + pre-fill dosage/frequency/durationDays
// when those fields are still empty.

export interface CommonDrug {
  name: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  category: 'antibiotic' | 'analgesic' | 'anti-inflammatory' | 'antiseptic' | 'other';
}

export const COMMON_DRUGS: CommonDrug[] = [
  { name: 'Amoxicillin 500mg', dosage: '500mg', frequency: '3 lần/ngày', durationDays: 5, category: 'antibiotic' },
  { name: 'Amoxicillin 250mg', dosage: '250mg', frequency: '3 lần/ngày', durationDays: 5, category: 'antibiotic' },
  { name: 'Augmentin 625mg (Amoxicillin + Clavulanic acid)', dosage: '625mg', frequency: '2 lần/ngày', durationDays: 5, category: 'antibiotic' },
  { name: 'Cefalexin 500mg', dosage: '500mg', frequency: '3 lần/ngày', durationDays: 5, category: 'antibiotic' },
  { name: 'Cefadroxil 500mg', dosage: '500mg', frequency: '2 lần/ngày', durationDays: 5, category: 'antibiotic' },
  { name: 'Metronidazole 250mg', dosage: '250mg', frequency: '3 lần/ngày', durationDays: 5, category: 'antibiotic' },
  { name: 'Metronidazole 500mg', dosage: '500mg', frequency: '2 lần/ngày', durationDays: 5, category: 'antibiotic' },
  { name: 'Tinidazole 500mg', dosage: '500mg', frequency: '2 lần/ngày', durationDays: 3, category: 'antibiotic' },
  { name: 'Clindamycin 300mg', dosage: '300mg', frequency: '3 lần/ngày', durationDays: 5, category: 'antibiotic' },
  { name: 'Azithromycin 500mg', dosage: '500mg', frequency: '1 lần/ngày', durationDays: 3, category: 'antibiotic' },
  { name: 'Ibuprofen 400mg', dosage: '400mg', frequency: 'Khi đau, tối đa 3 lần/ngày', durationDays: 3, category: 'analgesic' },
  { name: 'Ibuprofen 200mg', dosage: '200mg', frequency: 'Khi đau, tối đa 3 lần/ngày', durationDays: 3, category: 'analgesic' },
  { name: 'Paracetamol 500mg', dosage: '500mg', frequency: 'Khi đau, tối đa 3 lần/ngày', durationDays: 5, category: 'analgesic' },
  { name: 'Paracetamol 650mg', dosage: '650mg', frequency: 'Khi đau, tối đa 3 lần/ngày', durationDays: 5, category: 'analgesic' },
  { name: 'Efferalgan 500mg (Paracetamol sủi)', dosage: '500mg', frequency: 'Khi đau, tối đa 3 lần/ngày', durationDays: 5, category: 'analgesic' },
  { name: 'Diclofenac 50mg', dosage: '50mg', frequency: '2 lần/ngày sau ăn', durationDays: 3, category: 'anti-inflammatory' },
  { name: 'Diclofenac 75mg', dosage: '75mg', frequency: '2 lần/ngày sau ăn', durationDays: 3, category: 'anti-inflammatory' },
  { name: 'Meloxicam 7.5mg', dosage: '7.5mg', frequency: '1 lần/ngày sau ăn', durationDays: 5, category: 'anti-inflammatory' },
  { name: 'Celecoxib 200mg', dosage: '200mg', frequency: '2 lần/ngày', durationDays: 5, category: 'anti-inflammatory' },
  { name: 'Piroxicam 20mg', dosage: '20mg', frequency: '1 lần/ngày sau ăn', durationDays: 3, category: 'anti-inflammatory' },
  { name: 'Nước súc miệng Chlorhexidine 0.12%', dosage: '15ml', frequency: '2 lần/ngày', durationDays: 7, category: 'antiseptic' },
  { name: 'Nước súc miệng Listerine', dosage: '20ml', frequency: '2 lần/ngày', durationDays: 7, category: 'antiseptic' },
  { name: 'Gel bôi viêm lợi Bonjela', dosage: 'Bôi tại chỗ', frequency: '3 lần/ngày sau ăn', durationDays: 5, category: 'other' },
  { name: 'Vitamin C 500mg', dosage: '500mg', frequency: '1 lần/ngày', durationDays: 7, category: 'other' },
  { name: 'Calcium D3', dosage: '1 viên', frequency: '1 lần/ngày', durationDays: 14, category: 'other' },
];

export function findCommonDrug(name: string): CommonDrug | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase().trim();
  return COMMON_DRUGS.find((d) => d.name.toLowerCase() === lower);
}
