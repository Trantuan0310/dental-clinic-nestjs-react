import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";
import { clinicParts, clinicToday } from "@/lib/clinicTime";
import { Alert, Button, Card, EmptyState, Input, Select, Spinner } from "@/components/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import { useCatalogServices } from "../catalog/catalogApi";
import { useDentistOptions, usePatientSearch } from "./appointmentApi";
import { AppointmentFormModal } from "./AppointmentFormModal";
import { MessageDraftModal } from "../ai/MessageDraftModal";

interface Entry {
  id: string;
  patientId: string;
  serviceId: string;
  dentistId: string | null;
  fromDate: string;
  toDate: string;
  period: "ANY" | "AM" | "PM";
  note: string;
  patient: { fullName: string };
  service: { name: string };
  dentist: { fullName: string } | null;
}
interface Slot {
  startAt: string;
  dentistId: string;
}
const PERIODS = ["ANY", "AM", "PM"] as const;
const blank = () => ({
  patientId: "",
  serviceId: "",
  dentistId: "",
  fromDate: clinicToday(),
  toDate: clinicToday(),
  period: "ANY" as Entry["period"],
  note: "",
});

export default function WaitlistPage() {
  const { t } = useTranslation();
  const l = (key: string, opts?: Record<string, unknown>) => t(`uiScheduling.waitlistPage.${key}`, opts);
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState(blank);
  const [editing, edit] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [service, setService] = useState("");
  const [doctor, setDoctor] = useState("");
  const [time, setTime] = useState("");
  const [book, setBook] = useState<Entry | null>(null);
  const [invite, setInvite] = useState<Entry | null>(null);
  const dentists = useDentistOptions();
  const services = useCatalogServices();
  const patients = usePatientSearch(search);
  const rows = useQuery({
    queryKey: ["waitlist", params.toString()],
    queryFn: async () => (await api.get<{ data: Entry[]; slot: Slot | null }>("/waitlist", { params })).data,
  });
  const clear = () => {
    edit(null);
    setForm(blank());
    setName("");
    setSearch("");
  };
  const save = useMutation({
    mutationFn: async (removeId?: string) => {
      if (removeId) return api.delete("/waitlist/" + removeId);
      const data = { ...form, dentistId: form.dentistId || null };
      return editing ? api.patch("/waitlist/" + editing, data) : api.post("/waitlist", data);
    },
    onSuccess: () => {
      clear();
      void qc.invalidateQueries({ queryKey: ["waitlist"] });
    },
  });
  // Grouped by service category, so the list is not one long flat run.
  const serviceOptions = (services.data ?? []).map((s) => ({ value: s.id, label: s.name, group: s.category?.name }));
  const doctorOptions = (dentists.data ?? []).map((d) => ({ value: d.id, label: d.fullName }));
  const periodLabel = (p: Entry["period"]) => l(`period${p}`);
  const slot = rows.data?.slot;

  return (
    <div className="space-y-5">
      <PageHeader title={l("title")} description={l("subtitle")} />
      <Card title={editing ? l("editTitle") : l("addTitle")}>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(undefined);
          }}
        >
          <div className="space-y-2">
            <Input
              label={l("patient")}
              required
              placeholder={l("patientPlaceholder")}
              value={name || search}
              onChange={(e) => {
                setForm({ ...form, patientId: "" });
                setName("");
                setSearch(e.target.value);
              }}
              hint={form.patientId && name ? l("patientChosen", { name }) : undefined}
            />
            {search && (patients.data?.length ?? 0) > 0 && (
              <ul className="max-h-48 overflow-y-auto rounded-md border border-gray-200 bg-white text-sm shadow-sm dark:border-surface-700 dark:bg-surface-800">
                {patients.data?.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-surface-700"
                      onClick={() => {
                        setForm({ ...form, patientId: p.id });
                        setName(p.fullName);
                        setSearch("");
                      }}
                    >
                      {p.fullName} <span className="text-gray-500 dark:text-surface-400">· {p.code}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Select
            label={l("service")}
            required
            value={form.serviceId}
            onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
            placeholder={l("servicePlaceholder")}
            options={serviceOptions}
          />
          <Select
            label={l("dentist")}
            value={form.dentistId}
            onChange={(e) => setForm({ ...form, dentistId: e.target.value })}
            options={[{ value: "", label: l("anyDentist") }, ...doctorOptions]}
          />
          <Select
            label={l("period")}
            value={form.period}
            onChange={(e) => setForm({ ...form, period: e.target.value as Entry["period"] })}
            options={PERIODS.map((p) => ({ value: p, label: periodLabel(p) }))}
          />
          <Input
            label={l("fromDate")}
            required
            type="date"
            value={form.fromDate}
            onChange={(e) => setForm({ ...form, fromDate: e.target.value })}
          />
          <Input
            label={l("toDate")}
            required
            type="date"
            min={form.fromDate}
            value={form.toDate}
            onChange={(e) => setForm({ ...form, toDate: e.target.value })}
          />
          <div className="md:col-span-2">
            <Input
              label={l("note")}
              placeholder={l("notePlaceholder")}
              value={form.note}
              maxLength={500}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button type="submit" disabled={!form.patientId || !form.serviceId || save.isPending} isLoading={save.isPending}>
              {l("save")}
            </Button>
            {editing && (
              <Button type="button" variant="outline" onClick={clear}>
                {l("cancelEdit")}
              </Button>
            )}
          </div>
        </form>
        {save.isError && (
          <div className="mt-3">
            <Alert type="danger">{getApiErrorMessage(save.error, l("saveError"))}</Alert>
          </div>
        )}
      </Card>
      <Card title={l("matchTitle")} description={l("matchSubtitle")}>
        <form
          className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            setParams({ dentistId: doctor, serviceId: service, startAt: new Date(time + ":00+07:00").toISOString() });
          }}
        >
          <Select
            label={l("matchService")}
            required
            value={service}
            onChange={(e) => setService(e.target.value)}
            placeholder={l("servicePlaceholder")}
            options={serviceOptions}
          />
          <Select
            label={l("matchDentist")}
            required
            value={doctor}
            onChange={(e) => setDoctor(e.target.value)}
            placeholder={l("matchDentistPlaceholder")}
            options={doctorOptions}
          />
          <Input label={l("matchTime")} required type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} />
          <div className="flex items-end gap-2">
            <Button type="submit">{l("find")}</Button>
            <Button type="button" variant="outline" onClick={() => setParams({})}>
              {l("showAll")}
            </Button>
          </div>
        </form>
      </Card>
      {rows.isError ? (
        <Alert type="danger">{l("loadError")}</Alert>
      ) : rows.isPending ? (
        <div className="flex justify-center p-8">
          <Spinner />
        </div>
      ) : !rows.data.data.length ? (
        <EmptyState title={l("empty")} />
      ) : (
        rows.data.data.map((r) => (
          <Card key={r.id} title={r.patient.fullName}>
            <p className="text-sm text-gray-700 dark:text-surface-200">
              {r.service.name} · {r.dentist?.fullName || l("anyDentistShort")} · {periodLabel(r.period)} ·{" "}
              {r.fromDate.slice(0, 10)} — {r.toDate.slice(0, 10)}
            </p>
            {r.note && <p className="mt-1 text-sm text-gray-500 dark:text-surface-400">{r.note}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => setBook(r)}>{l("book")}</Button>
              <Button variant="outline" onClick={() => setInvite(r)}>
                {l("invite")}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  edit(r.id);
                  setForm({
                    patientId: r.patientId,
                    serviceId: r.serviceId,
                    dentistId: r.dentistId ?? "",
                    fromDate: r.fromDate.slice(0, 10),
                    toDate: r.toDate.slice(0, 10),
                    period: r.period,
                    note: r.note ?? "",
                  });
                  setName(r.patient.fullName);
                  setSearch("");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                {l("edit")}
              </Button>
              <Button
                disabled={save.isPending}
                variant="ghost"
                onClick={() => {
                  if (window.confirm(l("deleteConfirm"))) save.mutate(r.id);
                }}
              >
                {l("delete")}
              </Button>
            </div>
          </Card>
        ))
      )}
      {invite && (
        <MessageDraftModal open context={{ kind: "waitlist_invite", waitlistId: invite.id }} onClose={() => setInvite(null)} />
      )}
      {book && (
        <AppointmentFormModal
          open
          waitlistEntryId={book.id}
          defaultPatientId={book.patientId}
          defaultServiceId={book.serviceId}
          defaultDentistId={slot?.dentistId ?? book.dentistId ?? undefined}
          defaultDate={slot ? clinicParts(slot.startAt).date : [clinicToday(), book.fromDate.slice(0, 10)].sort()[1]}
          defaultStartTime={slot ? clinicParts(slot.startAt).time : undefined}
          onClose={() => {
            setBook(null);
            void rows.refetch();
          }}
        />
      )}
    </div>
  );
}
