import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/errors";
import { clinicParts, clinicToday } from "@/lib/clinicTime";
import { Button, Card } from "@/components/ui";
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
  period: string;
  note: string;
  patient: { fullName: string };
  service: { name: string };
  dentist: { fullName: string } | null;
}
interface Slot {
  startAt: string;
  dentistId: string;
}
const periods: Record<string, string> = {
  ANY: "Cả ngày",
  AM: "Sáng",
  PM: "Chiều",
};
const blank = () => ({
  patientId: "",
  serviceId: "",
  dentistId: "",
  fromDate: clinicToday(),
  toDate: clinicToday(),
  period: "ANY",
  note: "",
});
export default function WaitlistPage() {
  const qc = useQueryClient(),
    [params, setParams] = useSearchParams();
  const [form, setForm] = useState(blank),
    [editing, edit] = useState<string | null>(null),
    [search, setSearch] = useState(""),
    [name, setName] = useState("");
  const [service, setService] = useState(""),
    [doctor, setDoctor] = useState(""),
    [time, setTime] = useState("");
  const [book, setBook] = useState<Entry | null>(null),
    [invite, setInvite] = useState<Entry | null>(null);
  const dentists = useDentistOptions(),
    services = useCatalogServices(),
    patients = usePatientSearch(search);
  const rows = useQuery({
    queryKey: ["waitlist", params.toString()],
    queryFn: async () =>
      (
        await api.get<{ data: Entry[]; slot: Slot | null }>("/waitlist", {
          params,
        })
      ).data,
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
      return editing
        ? api.patch("/waitlist/" + editing, data)
        : api.post("/waitlist", data);
    },
    onSuccess: () => {
      clear();
      void qc.invalidateQueries({ queryKey: ["waitlist"] });
    },
  });
  const serviceOptions = services.data?.map((s) => (
    <option key={s.id} value={s.id}>
      {s.name}
    </option>
  ));
  const doctorOptions = dentists.data?.map((d) => (
    <option key={d.id} value={d.id}>
      {d.fullName}
    </option>
  ));
  const slot = rows.data?.slot;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Danh sách chờ</h1>
      <Card title={editing ? "Sửa yêu cầu chờ" : "Thêm người chờ"}>
        <form
          className="grid gap-3 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(undefined);
          }}
        >
          <label>
            Bệnh nhân
            <input
              className="block w-full rounded border p-2"
              placeholder="Tìm theo tên hoặc mã"
              value={name || search}
              onChange={(e) => {
                setForm({ ...form, patientId: "" });
                setName("");
                setSearch(e.target.value);
              }}
            />
          </label>
          {search && (
            <div>
              {patients.data?.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setForm({ ...form, patientId: p.id });
                    setName(p.fullName);
                    setSearch("");
                  }}
                >
                  {p.fullName} · {p.code}
                </Button>
              ))}
            </div>
          )}
          <label>
            Dịch vụ{" "}
            <select
              required
              value={form.serviceId}
              onChange={(e) => setForm({ ...form, serviceId: e.target.value })}
            >
              <option value="">Chọn dịch vụ</option>
              {serviceOptions}
            </select>
          </label>
          <label>
            Bác sĩ mong muốn{" "}
            <select
              value={form.dentistId}
              onChange={(e) => setForm({ ...form, dentistId: e.target.value })}
            >
              <option value="">Bất kỳ</option>
              {doctorOptions}
            </select>
          </label>
          <label>
            Từ ngày{" "}
            <input
              required
              type="date"
              value={form.fromDate}
              onChange={(e) => setForm({ ...form, fromDate: e.target.value })}
            />
          </label>
          <label>
            Đến ngày{" "}
            <input
              required
              type="date"
              min={form.fromDate}
              value={form.toDate}
              onChange={(e) => setForm({ ...form, toDate: e.target.value })}
            />
          </label>
          <label>
            Buổi{" "}
            <select
              value={form.period}
              onChange={(e) => setForm({ ...form, period: e.target.value })}
            >
              {Object.entries(periods).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Ghi chú{" "}
            <input
              value={form.note}
              maxLength={500}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </label>
          <div>
            <Button disabled={!form.patientId || save.isPending}>
              Lưu yêu cầu
            </Button>
            {editing && (
              <Button type="button" variant="outline" onClick={clear}>
                Hủy sửa
              </Button>
            )}
          </div>
        </form>
        {save.isError && (
          <p role="alert">
            {getApiErrorMessage(save.error, "Không lưu được yêu cầu")}
          </p>
        )}
      </Card>
      <Card title="Gợi ý theo giờ trống">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setParams({
              dentistId: doctor,
              serviceId: service,
              startAt: new Date(time + ":00+07:00").toISOString(),
            });
          }}
        >
          <select
            aria-label="Dịch vụ cần tìm"
            required
            value={service}
            onChange={(e) => setService(e.target.value)}
          >
            <option value="">Dịch vụ</option>
            {serviceOptions}
          </select>
          <select
            aria-label="Bác sĩ có giờ trống"
            required
            value={doctor}
            onChange={(e) => setDoctor(e.target.value)}
          >
            <option value="">Bác sĩ</option>
            {doctorOptions}
          </select>
          <input
            aria-label="Giờ trống"
            required
            type="datetime-local"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <Button>Tìm người phù hợp</Button>
          <Button type="button" variant="outline" onClick={() => setParams({})}>
            Xem tất cả
          </Button>
        </form>
      </Card>
      {rows.isError ? (
        <p role="alert">Không tải được danh sách chờ.</p>
      ) : rows.isPending ? (
        <p>Đang tải…</p>
      ) : !rows.data.data.length ? (
        <p>Không có yêu cầu phù hợp.</p>
      ) : (
        rows.data.data.map((r) => (
          <Card key={r.id} title={r.patient.fullName}>
            <p>
              {r.service.name} · {r.dentist?.fullName || "Bất kỳ bác sĩ"} ·{" "}
              {periods[r.period]} · {r.fromDate.slice(0, 10)} —{" "}
              {r.toDate.slice(0, 10)}
            </p>
            {r.note && <p>{r.note}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => setBook(r)}>Đặt lịch</Button>
              <Button variant="outline" onClick={() => setInvite(r)}>
                Soạn tin mời
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
                }}
              >
                Sửa
              </Button>
              <Button
                disabled={save.isPending}
                variant="ghost"
                onClick={() => {
                  if (window.confirm("Xóa yêu cầu chờ này?")) save.mutate(r.id);
                }}
              >
                Xóa
              </Button>
            </div>
          </Card>
        ))
      )}
      {invite && (
        <MessageDraftModal
          open
          context={{ kind: "waitlist_invite", waitlistId: invite.id }}
          onClose={() => setInvite(null)}
        />
      )}
      {book && (
        <AppointmentFormModal
          open
          waitlistEntryId={book.id}
          defaultPatientId={book.patientId}
          defaultServiceId={book.serviceId}
          defaultDentistId={slot?.dentistId ?? book.dentistId ?? undefined}
          defaultDate={
            slot
              ? clinicParts(slot.startAt).date
              : [clinicToday(), book.fromDate.slice(0, 10)].sort()[1]
          }
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
