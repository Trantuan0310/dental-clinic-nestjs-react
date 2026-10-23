import { api } from '@/lib/api';

/**
 * Fetches a server-made PDF with the session's token and saves it. A plain
 * link cannot carry the bearer token, so the bytes come through axios.
 */
export async function downloadPdf(url: string, filename: string): Promise<void> {
  const { data, headers } = await api.get<Blob>(url, { responseType: 'blob' });
  const disposition = String(headers['content-disposition'] ?? '');
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? filename;
  const href = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
