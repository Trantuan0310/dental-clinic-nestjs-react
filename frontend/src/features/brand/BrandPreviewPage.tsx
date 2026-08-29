import { Logo } from '@/components/brand';

/**
 * Internal brand preview page — không link từ navigation, dùng để xem nhanh
 * tất cả variants logo khi dev. Truy cập: /__brand-preview
 *
 * Ưu tiên: chỉ dành cho designer / dev review. KHÔNG ship ngoài dev mode.
 */
export default function BrandPreviewPage() {
  const variants = ['full', 'icon', 'icon-mono'] as const;
  const sizes = ['xs', 'sm', 'md', 'lg', 'xl'] as const;

  return (
    <div className="mx-auto max-w-5xl space-y-12 p-8">
      <header>
        <h1 className="text-3xl font-bold text-brand-700">GENSMILE — Brand Preview</h1>
        <p className="mt-2 text-sm text-gray-600">
          Trang preview nội bộ để kiểm tra variants logo và color tokens.
        </p>
      </header>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Logo variants</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {variants.map((v) => (
            <div key={v} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <p className="mb-4 text-xs uppercase tracking-wider text-gray-500">variant = {v}</p>
              <div className="flex flex-wrap items-end gap-4">
                {sizes.map((s) => (
                  <div key={s} className="flex flex-col items-center gap-2">
                    <Logo variant={v} size={s} theme={v === 'full' ? 'light' : 'light'} />
                    <span className="text-xs text-gray-500">{s}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Theme: light vs dark</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <p className="mb-4 text-xs uppercase tracking-wider text-gray-500">On light bg</p>
            <Logo variant="full" size="lg" theme="light" />
          </div>
          <div className="rounded-lg bg-brand-900 p-6" style={{ backgroundColor: '#082E2E' }}>
            <p className="mb-4 text-xs uppercase tracking-wider text-brand-200">On dark bg</p>
            <Logo variant="full" size="lg" theme="dark" />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">Color palette (brand-*)</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 md:grid-cols-9">
          {([50, 100, 200, 400, 500, 600, 700, 800, 900] as const).map((step) => (
            <div key={step} className={`rounded-md bg-brand-${step} p-4 text-center text-xs shadow-sm`}>
              <span className={step >= 600 ? 'text-white' : 'text-brand-900'}>
                brand-{step}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-md bg-accent p-4 text-center text-xs text-brand-900 shadow-sm">accent #F4B860</div>
          <div className="rounded-md bg-accent-dark p-4 text-center text-xs text-white shadow-sm">accent-dark #D49644</div>
        </div>
      </section>
    </div>
  );
}
