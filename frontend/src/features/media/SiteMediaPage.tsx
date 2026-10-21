import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
          notify.success(t("uiEntry.siteMediaUploaded"));
          setCaption("");
        },
        onError: (e) =>
          notify.error(mediaErrorMessage(e, t("uiEntry.mediaUploadError"))),
        onSettled: () => setTarget(null),
      },
    );
  };
  const drop = (id: string) =>
    remove.mutate(id, {
      onSuccess: () => notify.success(t("uiEntry.mediaDeleted")),
      onError: (e) =>
        notify.error(mediaErrorMessage(e, t("uiEntry.mediaDeleteError"))),
    });

  const gallery = data?.gallery ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.SiteMedia")}
        description={t("uiEntry.siteMediaDescription")}
        actions={
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
          >
            {t("uiEntry.siteMediaViewHome")}{" "}
            <ExternalLink className="h-4 w-4" />
          </a>
        }
      />
      <Alert type="info">{t("uiEntry.siteMediaPublicNotice")}</Alert>

      <Card title={t("uiEntry.siteMediaHeroTitle")}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          {data?.hero ? (
            <img
              src={mediaUrl(data.hero.id)}
              alt={t("uiEntry.siteMediaHeroAlt")}
              className="aspect-[4/3] w-full max-w-md rounded-xl object-cover"
            />
          ) : (
            <p className="text-sm text-gray-500">
              {isLoading
                ? t("uiCommon.table.loading")
                : t("uiEntry.siteMediaHeroEmpty")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <PickButton
              label={
                data?.hero
                  ? t("uiEntry.siteMediaHeroChange")
                  : t("uiEntry.siteMediaHeroUpload")
              }
              busy={uploadClinic.isPending && target === "hero"}
              onPick={(f) => add("CLINIC_HERO", f)}
            />
            {data?.hero && (
              <Button
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => drop(data.hero!.id)}
              >
                <Trash2 className="h-4 w-4" /> {t("common.delete")}
              </Button>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          {t("uiEntry.siteMediaHeroTip")}
        </p>
      </Card>

      <Card
        title={t("uiEntry.siteMediaGalleryTitle", {
          current: gallery.length,
          max: GALLERY_MAX,
        })}
      >
        {gallery.length === 0 ? (
          <p className="text-sm text-gray-500">
            {t("uiEntry.siteMediaGalleryEmpty")}
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
                  alt={g.caption ?? t("uiEntry.landing.galleryImage")}
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
                  aria-label={`${t("uiEntry.mediaDeletePhoto")} ${g.caption ?? ""}`.trim()}
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
                label={t("uiEntry.siteMediaCaption")}
                value={caption}
                maxLength={200}
                placeholder={t("uiEntry.siteMediaCaptionPlaceholder")}
                onChange={(e) => setCaption(e.target.value)}
              />
            </div>
            <PickButton
              label={t("uiEntry.siteMediaAddPhoto")}
              busy={uploadClinic.isPending && target === "gallery"}
              onPick={(f) => add("CLINIC_GALLERY", f)}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
