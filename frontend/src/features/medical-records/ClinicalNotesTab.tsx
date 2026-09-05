import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Plus } from 'lucide-react';
import { medicalRecordsApi } from './imperativeApi';
import { Button, Modal, Select, Textarea } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { AddendumModal } from './AddendumModal';
import type { Encounter, ClinicalNote, NoteType } from '@/types/medical-records';

interface ClinicalNotesTabProps {
  encounter: Encounter;
}

// Map the legacy "note type" selector to the field on the upsert
// clinical-note payload. The backend treats the note as a single
// resource with chiefComplaint / diagnosis / treatmentPlan / notes
// sections rather than a list of typed entries.
const NOTE_TYPE_TO_FIELD: Record<NoteType, 'chiefComplaint' | 'diagnosis' | 'treatmentPlan' | 'notes'> = {
  chief_complaint: 'chiefComplaint',
  diagnosis: 'diagnosis',
  progress_note: 'notes',
  other: 'notes',
};

export function ClinicalNotesTab({ encounter }: ClinicalNotesTabProps) {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingNote, setEditingNote] = useState<ClinicalNote | null>(null);
  const [noteType, setNoteType] = useState<NoteType>('progress_note');
  const [noteContent, setNoteContent] = useState('');

  // The clinical note is a single upsert per encounter — overwrite the
  // selected section and preserve the other sections from the encounter
  // snapshot.
  const upsertMutation = useMutation({
    mutationFn: (payload: { type: NoteType; content: string }) => {
      const field = NOTE_TYPE_TO_FIELD[payload.type];
      const existing = encounter.clinicalNote ?? null;
      return medicalRecordsApi.upsertClinicalNote(encounter.id, {
        // Backend fields: chiefComplaint, diagnosis, treatmentPlan, notes.
        chiefComplaint:
          field === 'chiefComplaint'
            ? payload.content
            : (existing?.chiefComplaint ?? undefined),
        diagnosis:
          field === 'diagnosis'
            ? payload.content
            : (existing?.diagnosis ?? undefined),
        treatmentPlan:
          field === 'treatmentPlan'
            ? payload.content
            : (existing?.treatmentPlan ?? undefined),
        notes:
          field === 'notes'
            ? payload.content
            : (existing?.notes ?? undefined),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['encounter', encounter.id] });
      queryClient.invalidateQueries({ queryKey: ['medical-records'] });
      setShowAddModal(false);
      setShowEditModal(false);
      setEditingNote(null);
      setNoteContent('');
      setNoteType('progress_note');
    },
    onError: (err) => {
      notify.error(getApiErrorMessage(err, 'Không thể lưu ghi chú lâm sàng'));
    },
  });

  // After the encounter is closed, edits go through addendums only —
  // see the AddendumModal render below (isCompleted branch).
  const [showAddendumModal, setShowAddendumModal] = useState(false);

  const notes = encounter.notes || [];
  const chiefComplaintNotes = notes.filter((n) => n.type === 'chief_complaint');
  const diagnosisNotes = notes.filter((n) => n.type === 'diagnosis');
  const otherNotes = notes.filter((n) => n.type !== 'chief_complaint' && n.type !== 'diagnosis');

  const handleAddNote = () => {
    upsertMutation.mutate({ type: noteType, content: noteContent });
  };

  const handleEditNote = () => {
    if (editingNote) {
      upsertMutation.mutate({ type: editingNote.type, content: noteContent });
    }
  };

  const openEditModal = (note: ClinicalNote) => {
    setEditingNote(note);
    setNoteContent(note.content ?? '');
    setShowEditModal(true);
  };

  const isCompleted = encounter.status === 'completed';

  return (
    <div className="space-y-4">
      {/* Chief Complaint */}
      {chiefComplaintNotes.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-gray-700">Lý do khám</h4>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <p className="text-sm text-gray-900">{chiefComplaintNotes[0].content}</p>
            <p className="mt-2 text-xs text-gray-500">
              {format(new Date(chiefComplaintNotes[0].createdAt), 'HH:mm', { locale: vi })} •{' '}
              {chiefComplaintNotes[0].createdByUserName}
            </p>
          </div>
        </div>
      )}

      {/* Diagnosis */}
      {diagnosisNotes.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-gray-700">Chẩn đoán</h4>
          {diagnosisNotes.map((note) => (
            <div
              key={note.id}
              className="mb-2 rounded-lg border border-gray-100 bg-white p-4"
            >
              <p className="text-sm text-gray-900">{note.content}</p>
              <p className="mt-2 text-xs text-gray-500">
                {format(new Date(note.createdAt), 'HH:mm', { locale: vi })} •{' '}
                {note.createdByUserName}
              </p>
              {!isCompleted && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => openEditModal(note)}
                    className="text-xs text-brand-600 hover:text-brand-700"
                  >
                    Sửa
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Other Notes */}
      {otherNotes.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-gray-700">Ghi chú khác</h4>
          {otherNotes.map((note) => (
            <div
              key={note.id}
              className="mb-2 rounded-lg border border-gray-100 bg-white p-4"
            >
              <p className="text-sm text-gray-900">{note.content}</p>
              <p className="mt-2 text-xs text-gray-500">
                {format(new Date(note.createdAt), 'HH:mm', { locale: vi })} •{' '}
                {note.createdByUserName}
              </p>
              {!isCompleted && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => openEditModal(note)}
                    className="text-xs text-brand-600 hover:text-brand-700"
                  >
                    Sửa
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Note Button */}
      {!isCompleted && (
        <div className="flex gap-2">
          <Select
            options={[
              { value: 'chief_complaint', label: 'Lý do khám' },
              { value: 'diagnosis', label: 'Chẩn đoán' },
              { value: 'progress_note', label: 'Ghi chú tiến triển' },
              { value: 'other', label: 'Khác' },
            ]}
            value={noteType}
            onChange={(e) => setNoteType(e.target.value as NoteType)}
            className="w-48"
          />
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4" />
            Thêm ghi chú
          </Button>
        </div>
      )}

      {isCompleted && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setShowAddendumModal(true)}>
            <Plus className="h-4 w-4" />
            Thêm addendum
          </Button>
        </div>
      )}

      <AddendumModal
        encounter={encounter}
        open={showAddendumModal}
        onClose={() => setShowAddendumModal(false)}
      />

      {/* Add Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setNoteContent('');
        }}
        title="Thêm ghi chú"
      >
        <div className="space-y-4">
          <Textarea
            label="Nội dung"
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            rows={4}
            placeholder="Nhập nội dung ghi chú..."
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Hủy
            </Button>
            <Button
              onClick={handleAddNote}
              isLoading={upsertMutation.isPending}
              disabled={!noteContent.trim()}
            >
              Thêm
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingNote(null);
        }}
        title="Sửa ghi chú"
      >
        <div className="space-y-4">
          <Textarea
            label="Nội dung"
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            rows={4}
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Hủy
            </Button>
            <Button
              onClick={handleEditNote}
              isLoading={upsertMutation.isPending}
              disabled={!noteContent.trim()}
            >
              Lưu
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}