import { Link } from 'react-router-dom';
import { Phone } from 'lucide-react';
import { clinic } from '@/config/clinic';

/** Header shared by the public booking pages: logo back to the home page, hotline. */
export function PublicTopBar({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <Link to="/" className="flex items-center gap-2" aria-label={`${clinic.name} — Trang chủ`}>
        <img src="/logo-icon.svg" alt="" className="h-8 w-8" />
        <span className="text-lg font-bold tracking-wide text-brand-600">GENSMILE</span>
      </Link>
      <div className="flex items-center gap-4 text-sm font-medium">
        {children}
        {clinic.phone && (
          <a href={`tel:${clinic.phoneHref}`} className="inline-flex items-center gap-1.5 text-brand-600">
            <Phone className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{clinic.phone}</span>
            <span className="sm:hidden">Gọi</span>
          </a>
        )}
      </div>
    </div>
  );
}
