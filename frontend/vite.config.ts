import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const escapeAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** "08:00 – 12:00 · 13:30 – 19:00" → opening ranges for those days ("Nghỉ" → none). */
function openingHours(hours: string, dayOfWeek: string[]) {
  return [...hours.matchAll(/(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})/g)].map((m) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek,
    opens: m[1].padStart(5, '0'),
    closes: m[2].padStart(5, '0'),
  }));
}

/**
 * Link previews (Facebook, Zalo) and Google read index.html without running
 * the app, so the absolute URLs and the clinic's details are written into it
 * at build time from VITE_SITE_URL and VITE_CLINIC_* (see src/config/clinic.ts,
 * whose defaults these mirror). %CLINIC_NAME% in index.html is the name.
 */
function seoHead(env: Record<string, string>): Plugin {
  const site = (env.VITE_SITE_URL || 'https://gensmile.online').replace(/\/+$/, '');
  const name = env.VITE_CLINIC_NAME?.trim() || 'Nha khoa GENSMILE';
  const image = `${site}/og-image.jpg`;
  const hours = env.VITE_CLINIC_HOURS?.trim() || '08:00 – 12:00 · 13:30 – 19:00';
  const sundayHours = env.VITE_CLINIC_SUNDAY_HOURS?.trim() || 'Nghỉ';
  const ranges = [
    ...openingHours(hours, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']),
    ...openingHours(sundayHours, ['Sunday']),
  ];
  const address = env.VITE_CLINIC_ADDRESS?.trim();
  const phone = env.VITE_CLINIC_PHONE?.trim();
  const sameAs = [env.VITE_CLINIC_FACEBOOK_URL?.trim()].filter(Boolean);
  const business = {
    '@context': 'https://schema.org',
    '@type': 'Dentist',
    name,
    url: `${site}/`,
    image,
    logo: `${site}/logo-full.png`,
    ...(phone ? { telephone: phone } : {}),
    ...(address
      ? { address: { '@type': 'PostalAddress', streetAddress: address, addressCountry: 'VN' } }
      : {}),
    ...(ranges.length ? { openingHoursSpecification: ranges } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
  const tags = [
    `<link rel="canonical" href="${escapeAttr(site)}/" />`,
    `<meta property="og:site_name" content="${escapeAttr(name)}" />`,
    `<meta property="og:url" content="${escapeAttr(site)}/" />`,
    `<meta property="og:image" content="${escapeAttr(image)}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${escapeAttr(name)} — Đặt lịch khám online" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    // "<" is escaped so no field can close the script element.
    `<script type="application/ld+json">${JSON.stringify(business).replace(/</g, '\\u003c')}</script>`,
  ];
  return {
    name: 'seo-head',
    transformIndexHtml: (html) =>
      html
        .replaceAll('%CLINIC_NAME%', escapeAttr(name))
        .replace('</head>', `    ${tags.join('\n    ')}\n  </head>`),
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), seoHead(loadEnv(mode, process.cwd(), 'VITE_'))],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: 'localhost',
      },
    },
  },
}));
