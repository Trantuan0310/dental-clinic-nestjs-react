import { useTranslation } from 'react-i18next';
import { clinic } from '@/config/clinic';

/**
 * The clinic's name, address and hotline at the top of printed documents
 * (invoice, prescription), from the same build-time config as the landing
 * page (CLINIC_* in .env.production). Empty values are left out.
 */
export function ClinicPrintHeading() {
  const { t } = useTranslation();
  const contact = [clinic.address, clinic.phone && t('uiWorkforce.printPhone', { phone: clinic.phone })]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      <p className="text-lg font-bold uppercase">{clinic.name}</p>
      {contact && <p className="text-xs">{contact}</p>}
    </>
  );
}
