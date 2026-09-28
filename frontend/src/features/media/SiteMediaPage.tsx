import { useRef, useState } from "react";
import { ExternalLink, ImagePlus, Trash2 } from "lucide-react";
import { Alert, Button, Card, Input } from "@/components/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { notify } from "@/components/ui/Toast";
import {
  mediaErrorMessage,
  mediaUrl,
  useMediaMutations,
  useSiteMedia,
} from "./mediaApi";

const GALLERY_MAX = 12;

function PickButton({
  label,
  busy,
  onPick,
}: {
  label: string;
  busy: boolean;
  onPick: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        aria-label={label}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />
      <Button isLoading={busy} onClick={() => input.current?.click()}>
        <ImagePlus className="h-4 w-4" /> {label}
      </Button>
    </>
  );
}

/** Admin screen for the photos on the public home page. */
export default function SiteMediaPage() {
  const { data, isLoading } = useSiteMedia();
  const { uploadClinic, remove } = useMediaMutations();
  const [caption, setCaption] = useState("");
  const [target, setTarget] = useState<"hero" | "gallery" | null>(null);

  const add = (purpose: "CLINIC_HERO" | "CLINIC_GALLERY", file: File) => {
    setTarget(purpose === "CLINIC_HERO" ? "hero" : "gallery");
    uploadClinic.mutate(
      {
        purpose,
        file,
        caption: purpose === "CLINIC_GALLERY" ? caption.trim() : undefined,
      },
      {
        onSuccess: () => {
          notify.success("Đã tải ảnh lên trang chủ");
          setCaption("");
        },
        onError: (e) =>
          notify.error(mediaErrorMessage(e, "Không tải được ảnh")),
        onSettled: () => setTarget(null),
      },
    );
  };
  const drop = (id: string) =>
    remove.mutate(id, {
      onSuccess: () => notify.success("Đã xóa ảnh"),
      onError: (e) => notify.error(mediaErrorMessage(e, "Không xóa được ảnh")),
    });

  const gallery = data?.gallery ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ảnh trang chủ"
        description="Ảnh hiện trên trang giới thiệu cho khách (gensmile.online). Ảnh được tự thu nhỏ trước khi tải lên."
        actions={
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
          >
            Xem trang chủ <ExternalLink className="h-4 w-4" />
          </a>
        }
      />
      <Alert type="info">
        Mọi ảnh ở đây đều công khai. Không dùng ảnh có mặt bệnh nhân hoặc giấy
        tờ nếu chưa được đồng ý. Ảnh bác sĩ tải ở trang hồ sơ của từng bác sĩ
        (Nhân sự → Bác sĩ).
      </Alert>

      <Card title="Ảnh chính (đầu trang)">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          {data?.hero ? (
            <img
              src={mediaUrl(data.hero.id)}
              alt="Ảnh chính của trang chủ"
              className="aspect-[4/3] w-full max-w-md rounded-xl object-cover"
            />
          ) : (
            <p className="text-sm text-gray-500">
              {isLoading
                ? "Đang tải…"
                : "Chưa có ảnh. Trang chủ đang hiện logo ở vị trí này."}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <PickButton
              label={data?.hero ? "Đổi ảnh chính" : "Tải ảnh chính"}
              busy={uploadClinic.isPending && target === "hero"}
              onPick={(f) => add("CLINIC_HERO", f)}
            />
            {data?.hero && (
              <Button
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => drop(data.hero!.id)}
              >
                <Trash2 className="h-4 w-4" /> Xóa
              </Button>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Gợi ý: ảnh ngang, sáng, chụp mặt tiền hoặc phòng điều trị.
        </p>
      </Card>

      <Card title={`Không gian phòng khám (${gallery.length}/${GALLERY_MAX})`}>
        {gallery.length === 0 ? (
          <p className="text-sm text-gray-500">
            Chưa có ảnh. Khi có ảnh, trang chủ hiện thêm mục “Không gian phòng
            khám”.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {gallery.map((g) => (
              <li
                key={g.id}
                className="group relative overflow-hidden rounded-xl bg-gray-100"
              >
                <img
                  src={mediaUrl(g.id)}
                  alt={g.caption ?? "Ảnh phòng khám"}
                  className="aspect-square w-full object-cover"
                />
                {g.caption && (
                  <p className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-1 text-xs text-white">
                    {g.caption}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => drop(g.id)}
                  disabled={remove.isPending}
                  className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-red-600 shadow hover:bg-white"
                  aria-label={`Xóa ảnh ${g.caption ?? ""}`.trim()}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {gallery.length < GALLERY_MAX && (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="sm:w-72">
              <Input
                label="Chú thích (không bắt buộc)"
                value={caption}
                maxLength={200}
                placeholder="VD: Phòng điều trị"
                onChange={(e) => setCaption(e.target.value)}
              />
            </div>
            <PickButton
              label="Thêm ảnh"
              busy={uploadClinic.isPending && target === "gallery"}
              onPick={(f) => add("CLINIC_GALLERY", f)}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
