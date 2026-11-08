import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { Button } from "@/components/ui";
import { bookingErrorMessage } from "./errorMessage";

const labels = {
  vi: {
    title: "Phiếu khai trước khi đến",
    reason: "Lý do khám",
    allergies: "Dị ứng",
    currentMedications: "Thuốc đang dùng",
    chronicDiseases: "Bệnh nền",
    emergencyContact: "Liên hệ khẩn cấp",
    send: "Gửi phiếu",
    sent: "Đã nhận phiếu khai. Nhân viên sẽ xem trước khi cập nhật hồ sơ.",
    note: "Mỗi mục thuốc, bệnh hoặc dị ứng ghi trên một dòng.",
    pending: "Có phiếu khai chờ duyệt",
    approve: "Duyệt phiếu",
    discard: "Bỏ phiếu",
    approved: "Đã duyệt phiếu khai",
    discarded: "Đã bỏ phiếu khai",
    current: "Hồ sơ hiện tại",
    reported: "Khách đã khai",
    error: "Không thể xử lý phiếu khai. Vui lòng thử lại.",
    next: "Tiếp tục",
    back: "Quay lại",
  },
  en: {
    title: "Pre-visit form",
    reason: "Reason for visit",
    allergies: "Allergies",
    currentMedications: "Current medications",
    chronicDiseases: "Chronic conditions",
    emergencyContact: "Emergency contact",
    send: "Submit form",
    sent: "Form received. Staff will review it before updating your record.",
    note: "Enter each medication, condition or allergy on a separate line.",
    pending: "Intake form awaiting review",
    approve: "Approve form",
    discard: "Discard form",
    approved: "Intake approved",
    discarded: "Intake discarded",
    current: "Current record",
    reported: "Patient reported",
    error: "Could not process this form. Please try again.",
    next: "Continue",
    back: "Back",
  },
};
const lists = ["allergies", "chronicDiseases", "currentMedications"] as const;
type Answers = Record<(typeof lists)[number], string[]> & {
  reason: string;
  emergencyContact: string;
};
function useLabels() {
  return labels[useTranslation().i18n.language.startsWith("en") ? "en" : "vi"];
}
const lines = (value: string) =>
  value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
export function PatientIntake({ token }: { token: string }) {
  const t = useLabels();
  const [step, setStep] = useState(1);
  const [f, set] = useState({
    reason: "",
    emergencyContact: "",
    allergies: "",
    chronicDiseases: "",
    currentMedications: "",
  });
  const send = useMutation({
    mutationFn: () =>
      api.post(
        "/public/appointment-links/" + encodeURIComponent(token) + "/intake",
        {
          ...f,
          allergies: lines(f.allergies),
          chronicDiseases: lines(f.chronicDiseases),
          currentMedications: lines(f.currentMedications),
        },
      ),
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (step === 1) setStep(2);
    else send.mutate();
  }
  if (send.isSuccess) return <p role="status">{t.sent}</p>;
  return (
    <details className="rounded border p-4">
      <summary>{t.title}</summary>
      <form onSubmit={submit} className="mt-3 space-y-3">
        {step === 2 && <p>{t.note}</p>}
        {(step === 1 ? (["reason", "emergencyContact"] as const) : lists).map(
          (k) => (
            <label key={k} className="block">
              {t[k]}
              <textarea
                className="block w-full rounded border p-2"
                value={f[k]}
                required={k === "reason"}
                maxLength={
                  k === "reason" ? 500 : k === "emergencyContact" ? 200 : 2420
                }
                onChange={(e) => set({ ...f, [k]: e.target.value })}
              />
            </label>
          ),
        )}
        {send.isError && (
          <p role="alert">{bookingErrorMessage(send.error, t.error)}</p>
        )}
        {step === 2 && (
          <Button type="button" variant="outline" onClick={() => setStep(1)}>
            {t.back}
          </Button>
        )}
        <Button type="submit" disabled={send.isPending}>
          {step === 1 ? t.next : t.send}
        </Button>
      </form>
    </details>
  );
}
type Review = {
  status: "PENDING" | "APPROVED" | "DISCARDED";
  answers: Answers;
  current: Pick<Answers, (typeof lists)[number]>;
};
export function ReviewIntake({ appointmentId }: { appointmentId: string }) {
  const t = useLabels(),
    qc = useQueryClient();
  const url = "/appointments/" + appointmentId + "/intake",
    key = ["appointment-intake", appointmentId];
  const query = useQuery({
    queryKey: key,
    queryFn: async () =>
      (await api.get<{ data: Review | null }>(url)).data.data,
  });
  const decision = useMutation({
    mutationFn: (action: "approve" | "discard") => api.post(url + "/" + action),
    onSuccess: () => qc.invalidateQueries(),
  });
  if (query.isError) return <p role="alert">{t.error}</p>;
  const form = query.data;
  if (!form) return null;
  if (form.status !== "PENDING")
    return (
      <p role="status">
        {form.status === "APPROVED" ? t.approved : t.discarded}
      </p>
    );
  return (
    <details className="rounded border p-4">
      <summary>{t.pending}</summary>
      <dl>
        {lists.map((k) => (
          <div key={k} className="my-2">
            <dt className="font-medium">{t[k]}</dt>
            <dd>
              {t.current}: {form.current[k]?.join(", ") || "—"}
            </dd>
            <dd>
              {t.reported}: {form.answers[k].join(", ") || "—"}
            </dd>
          </div>
        ))}
        {(["reason", "emergencyContact"] as const).map((k) => (
          <div key={k}>
            <dt>{t[k]}</dt>
            <dd>{form.answers[k] || "—"}</dd>
          </div>
        ))}
      </dl>
      {decision.isError && (
        <p role="alert">{bookingErrorMessage(decision.error, t.error)}</p>
      )}
      <Button
        disabled={decision.isPending}
        onClick={() => decision.mutate("approve")}
      >
        {t.approve}
      </Button>{" "}
      <Button
        variant="outline"
        disabled={decision.isPending}
        onClick={() => decision.mutate("discard")}
      >
        {t.discard}
      </Button>
    </details>
  );
}
