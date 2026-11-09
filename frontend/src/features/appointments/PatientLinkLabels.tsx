export function PatientLinkLabels({ confirmedByPatient, rescheduleRequestedAt }: { confirmedByPatient?: boolean; rescheduleRequestedAt?: string | null }) {
  if (!confirmedByPatient && !rescheduleRequestedAt) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1.5">
      {confirmedByPatient && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Khách đã xác nhận</span>}
      {rescheduleRequestedAt && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">Khách xin dời</span>}
    </span>
  );
}
