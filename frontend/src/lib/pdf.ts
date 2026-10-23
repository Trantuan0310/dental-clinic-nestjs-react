import { api } from '@/lib/api';

/**
 * Fetches a server-made PDF with the session's token and saves it. A plain
 * link cannot carry the bearer token, so the bytes come through axios.
 */
export async function downloadPdf(url: string, filename: string): Promise<void> {
  let response;
  try {
    response = await api.get<Blob>(url, { responseType: 'blob' });
  } catch (error) {
    // With responseType blob the server's JSON error arrives as a Blob too:
    // read it back so getApiErrorMessage can show the server's message.
    const res = (error as { response?: { data?: unknown } }).response;
    if (res?.data instanceof Blob) {
      try {
        res.data = JSON.parse(await res.data.text());
      } catch {
        // Not JSON: keep the generic message.
      }
    }
    throw error;
  }
  const { data, headers } = response;
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
