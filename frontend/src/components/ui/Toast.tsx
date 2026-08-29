import { Toaster, toast } from 'react-hot-toast';
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';

const iconFor = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const colorFor = {
  success: 'border-l-4 border-emerald-500',
  error: 'border-l-4 border-red-500',
  warning: 'border-l-4 border-amber-500',
  info: 'border-l-4 border-blue-500',
} as const;

export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      gutter={8}
      toastOptions={{
        duration: 5000,
        style: {
          background: '#ffffff',
          color: '#111827',
          border: '1px solid #e5e7eb',
          padding: '12px 14px',
          fontSize: 14,
          minWidth: 280,
          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        },
        success: { iconTheme: { primary: '#10B981', secondary: '#fff' } },
        error: { duration: 8000 },
      }}
    >
      {(t) => {
        const kind = (t.type ?? 'info') as keyof typeof iconFor;
        const Icon = iconFor[kind] ?? Info;
        const ariaRole = kind === 'error' ? 'alert' : 'status';
        return (
          <div
            role={ariaRole}
            aria-live={kind === 'error' ? 'assertive' : 'polite'}
            className={`flex items-start gap-2 ${colorFor[kind] ?? ''}`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="flex-1">
              <div className="text-sm">{String(t.message)}</div>
            </div>
          </div>
        );
      }}
    </Toaster>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const notify = {
  success: (msg: string) => toast.success(msg),
  error: (msg: string) => toast.error(msg),
  warning: (msg: string) => toast(msg, { icon: '⚠️', style: { borderLeft: '4px solid #F59E0B' } }),
  info: (msg: string) => toast(msg, { icon: 'ℹ️' }),
};