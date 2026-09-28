import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";

/** Photos the landing page shows (GET /public/media/site). */
export interface SiteMedia {
  hero: { id: string; caption: string | null } | null;
  gallery: Array<{ id: string; caption: string | null }>;
  /** dentist user id → photo id */
  dentists: Record<string, string>;
}

export const SITE_MEDIA_KEY = ["site-media"] as const;

export const mediaUrl = (id: string) =>
  `${api.defaults.baseURL ?? "/api/v1"}/public/media/${id}`;

export function useSiteMedia() {
  return useQuery({
    queryKey: SITE_MEDIA_KEY,
    queryFn: async () =>
      (await api.get<{ data: SiteMedia }>("/public/media/site")).data.data,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

const MAX_SIDE = 1600;

/**
 * Shrinks a photo in the browser before upload: phone pictures are often
 * 4000 px and several MB, the page never shows them larger than ~1600 px.
 * Always re-encodes as JPEG, which also drops EXIF data such as GPS position.
 */
export async function prepareImage(
  file: File,
  maxSide = MAX_SIDE,
): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Không đọc được ảnh này. Hãy chọn ảnh JPG hoặc PNG.");
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không hỗ trợ xử lý ảnh.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  );
  if (!blob) throw new Error("Không nén được ảnh.");
  return blob;
}

async function upload(
  url: string,
  file: File,
  fields: Record<string, string> = {},
  maxSide?: number,
) {
  const form = new FormData();
  form.append("file", await prepareImage(file, maxSide), "photo.jpg");
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  // The shared client defaults to JSON; multipart lets the browser add the boundary.
  return api.post(url, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export function useMediaMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: SITE_MEDIA_KEY });
  return {
    uploadClinic: useMutation({
      mutationFn: (v: {
        file: File;
        purpose: "CLINIC_HERO" | "CLINIC_GALLERY";
        caption?: string;
      }) =>
        upload("/media/clinic", v.file, {
          purpose: v.purpose,
          ...(v.caption ? { caption: v.caption } : {}),
        }),
      onSuccess: refresh,
    }),
    uploadDentistPhoto: useMutation({
      mutationFn: (v: { dentistId: string; file: File }) =>
        upload(`/media/dentists/${v.dentistId}/photo`, v.file, {}, 800),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/media/${id}`),
      onSuccess: refresh,
    }),
  };
}

/** Server errors carry their own message; resizing errors are plain Errors. */
export const mediaErrorMessage = (e: unknown, fallback: string) =>
  isAxiosError(e)
    ? getApiErrorMessage(e, fallback)
    : e instanceof Error
      ? e.message
      : fallback;
