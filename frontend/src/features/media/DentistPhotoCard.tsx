import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Trash2, UserRound } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { notify } from "@/components/ui/Toast";
import {
  mediaErrorMessage,
  mediaUrl,
  useMediaMutations,
  useSiteMedia,
} from "./mediaApi";

/** Portrait shown on the public home page ("Đội ngũ bác sĩ"). */
export function DentistPhotoCard({
  dentistId,
  canEdit,
}: {
  dentistId: string;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const { data } = useSiteMedia();
  const { uploadDentistPhoto, remove } = useMediaMutations();
  const input = useRef<HTMLInputElement>(null);
  const photoId = data?.dentists[dentistId];
  const busy = uploadDentistPhoto.isPending || remove.isPending;

  const pick = (file: File | undefined) => {
    if (!file) return;
    uploadDentistPhoto.mutate(
      { dentistId, file },
      {
        onSuccess: () => notify.success(t("uiEntry.dentistPhotoUpdated")),
        onError: (e) =>
          notify.error(mediaErrorMessage(e, t("uiEntry.mediaUploadError"))),
      },
    );
  };

  return (
    <Card title={t("uiEntry.dentistPhotoTitle")}>
      <div className="flex items-center gap-4">
        {photoId ? (
          <img
            src={mediaUrl(photoId)}
            alt={t("uiEntry.dentistPhotoAlt")}
            className="h-24 w-24 rounded-full object-cover ring-2 ring-brand-100"
          />
        ) : (
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-surface-800">
            <UserRound className="h-10 w-10" aria-hidden />
          </span>
        )}
        <div className="space-y-2">
          <p className="text-xs text-gray-500 dark:text-surface-400">
            {t("uiEntry.dentistPhotoHint")}
          </p>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                aria-label={t("uiEntry.dentistPhotoPick")}
                onChange={(e) => {
                  pick(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button
                size="sm"
                variant="outline"
                isLoading={uploadDentistPhoto.isPending}
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                <Camera className="h-4 w-4" />{" "}
                {photoId
                  ? t("uiEntry.dentistPhotoChange")
                  : t("uiWorkforce.uploadPhoto")}
              </Button>
              {photoId && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    remove.mutate(photoId, {
                      onSuccess: () => notify.success(t("uiEntry.mediaDeleted")),
                      onError: (e) =>
                        notify.error(
                          mediaErrorMessage(e, t("uiEntry.mediaDeleteError")),
                        ),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" /> {t("uiEntry.mediaDeletePhoto")}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
