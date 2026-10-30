import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { formatDateTime } from '@/lib/format';
import { vi } from 'date-fns/locale';
import { Plus, Sparkles } from 'lucide-react';
import { medicalRecordsApi } from './imperativeApi';
import { Button, Modal, Select, Textarea } from '@/components/ui';
import { notify } from '@/components/ui/Toast';
import { getApiErrorMessage } from '@/lib/errors';
import { AddendumModal } from './AddendumModal';
import { QuickNoteModal } from '@/features/ai/QuickNoteModal';
import type { Encounter, ClinicalNote, NoteType } from '@/types/medical-records';
import { useAuthStore } from '@/stores/authStore';
import { useIsOwnEncounterScope } from './encounterUtils';

interface ClinicalNotesTabProps {
  encounter: Encounter;
}

// Map the "note type" selector to the field on the upsert clinical-note
// payload. The backend treats the note as a single resource with
// chiefComplaint / diagnosis / treatmentPlan / notes sections rather than a
// list of typed entries; each section is written back to its own column.
type NoteField = 'chiefComplaint' | 'diagnosis' | 'treatmentPlan' | 'notes';
const NOTE_TYPE_TO_FIELD: Record<NoteType, NoteField> = {
  chief_complaint: 'chiefComplaint',
  diagnosis: 'diagnosis',
  treatment_plan: 'treatmentPlan',
  progress_note: 'notes',
  other: 'notes',
};


// "Thêm" never replaces what is already written: the server appends the text
// to that section with a time + author stamp (under the encounter lock, so
// two quick saves both survive). "Sửa" edits one section, pre-filled with its
// full current value, and only sends that section.
function buildNotePayload(type: NoteType, content: string, mode: 'add' | 'edit') {
  const field = NOTE_TYPE_TO_FIELD[type];
  if (mode === 'edit') return { [field]: content };
  return { appendNote: content, appendTo: field };
}

export function ClinicalNotesTab({ encounter }: ClinicalNotesTabProps) {
  const { t } = useTranslation();
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
    mutationFn: (payload: { type: NoteType; content: string; mode: 'add' | 'edit' }) =>
      medicalRecordsApi.upsertClinicalNote(
        encounter.id,
        buildNotePayload(payload.type, payload.content, payload.mode),
      ),
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
      notify.error(getApiErrorMessage(err, t('uiClinical.noteSaveError')));
    },
  });

  // After the encounter is closed, edits go through addendums only —
  // see the AddendumModal render below (isCompleted branch).
  const [showAddendumModal, setShowAddendumModal] = useState(false);
  const [showQuickNote, setShowQuickNote] = useState(false);

  const notes = encounter.notes || [];
  const chiefComplaintNotes = notes.filter((n) => n.type === 'chief_complaint');
  const diagnosisNotes = notes.filter((n) => n.type === 'diagnosis');
  const otherNotes = notes.filter((n) => n.type !== 'chief_complaint' && n.type !== 'diagnosis');

  const handleAddNote = () => {
    upsertMutation.mutate({ type: noteType, content: noteContent.trim(), mode: 'add' });
  };

  const handleEditNote = () => {
    if (editingNote) {
      upsertMutation.mutate({ type: editingNote.type, content: noteContent, mode: 'edit' });
    }
  };

  const openEditModal = (note: ClinicalNote) => {
    setEditingNote(note);
    setNoteContent(note.content ?? '');
    setShowEditModal(true);
  };

  // Writing the record is the dentist's act (clinical_note.*); an admin or
  // front desk reading it gets no edit controls instead of a 403 on save.
  const canWrite = useAuthStore((s) => s.hasPermission('clinical_note.write'));
  const canAddendum = useAuthStore((s) => s.hasPermission('clinical_note.addendum'));
  const ownScope = useIsOwnEncounterScope(encounter);
  const isCompleted = encounter.status === 'completed' && canAddendum && ownScope;
  const isEditable = encounter.status === 'in_progress' && canWrite && ownScope;

  return (
    <div className="space-y-4">
      {/* Chief Complaint */}
      {chiefComplaintNotes.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-gray-700">{t('uiClinical.reasonForVisit')}</h4>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <p className="whitespace-pre-wrap text-sm text-gray-900">{chiefComplaintNotes[0].content}</p>
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
          <h4 className="mb-2 text-sm font-medium text-gray-700">{t('uiClinical.diagnosis')}</h4>
          {diagnosisNotes.map((note) => (
            <div
              key={note.id}
              className="mb-2 rounded-lg border border-gray-100 bg-white p-4"
            >
              <p className="whitespace-pre-wrap text-sm text-gray-900">{note.content}</p>
              <p className="mt-2 text-xs text-gray-500">
                {format(new Date(note.createdAt), 'HH:mm', { locale: vi })} •{' '}
                {note.createdByUserName}
              </p>
              {isEditable && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => openEditModal(note)}
                    className="text-xs text-brand-600 hover:text-brand-700"
                  >
                    {t('uiClinical.edit')}
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
          <h4 className="mb-2 text-sm font-medium text-gray-700">{t('uiClinical.noteOther')}</h4>
          {otherNotes.map((note) => (
            <div
              key={note.id}
              className="mb-2 rounded-lg border border-gray-100 bg-white p-4"
            >
              {(note.type === 'treatment_plan' || note.type === 'progress_note') && (
                <p className="mb-1 text-xs font-medium text-gray-500">{t(note.type === 'treatment_plan' ? 'uiClinical.plan' : 'uiClinical.progressNote')}</p>
              )}
              <p className="whitespace-pre-wrap text-sm text-gray-900">{note.content}</p>
              <p className="mt-2 text-xs text-gray-500">
                {format(new Date(note.createdAt), 'HH:mm', { locale: vi })} •{' '}
                {note.createdByUserName}
              </p>
              {isEditable && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => openEditModal(note)}
                    className="text-xs text-brand-600 hover:text-brand-700"
                  >
                    {t('uiClinical.edit')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {encounter.clinicalNote?.addendums?.map((addendum) => (
        <div key={addendum.id} className="rounded-lg border border-gray-100 bg-gray-50 p-4">
          <h4 className="mb-2 text-sm font-medium text-gray-700">{t('uiClinical.noteAdditional')}</h4>
          <p className="whitespace-pre-wrap text-sm text-gray-900">{addendum.content}</p>
          <p className="mt-2 text-xs text-gray-500">
            {formatDateTime(addendum.addedAt)}
          </p>
        </div>
      ))}

      {/* Add Note Button */}
      {isEditable && (
        <div className="flex gap-2">
          <Select
            options={[
              { value: 'chief_complaint', label: t('uiClinical.reasonForVisit') },
              { value: 'diagnosis', label: t('uiClinical.diagnosis') },
              { value: 'treatment_plan', label: t('uiClinical.plan') },
              { value: 'progress_note', label: t('uiClinical.progressNote') },
            ]}
            value={noteType}
            onChange={(e) => setNoteType(e.target.value as NoteType)}
            className="w-48"
          />
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4" />
            {t('uiClinical.noteAdd')}
          </Button>
          <Button variant="outline" onClick={() => setShowQuickNote(true)}>
            <Sparkles className="h-4 w-4" />
            {t('uiAi.note.open')}
          </Button>
        </div>
      )}

      {isEditable && (
        <QuickNoteModal encounterId={encounter.id} open={showQuickNote} onClose={() => setShowQuickNote(false)} />
      )}

      {isCompleted && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setShowAddendumModal(true)}>
            <Plus className="h-4 w-4" />
            {t('uiClinical.addendumTitle')}
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
        title={t('uiClinical.noteAdd')}
      >
        <div className="space-y-4">
          <Textarea
            label={t('uiClinical.noteContent')}
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            rows={4}
            placeholder={t('uiClinical.notePlaceholder')}
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              {t('uiClinical.cancel')}
            </Button>
            <Button
              onClick={handleAddNote}
              isLoading={upsertMutation.isPending}
              disabled={!noteContent.trim()}
            >
              {t('uiClinical.add')}
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
        title={t('uiClinical.noteEdit')}
      >
        <div className="space-y-4">
          <Textarea
            label={t('uiClinical.noteContent')}
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            rows={4}
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              {t('uiClinical.cancel')}
            </Button>
            <Button
              onClick={handleEditNote}
              isLoading={upsertMutation.isPending}
              disabled={!noteContent.trim()}
            >
              {t('uiClinical.save')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
