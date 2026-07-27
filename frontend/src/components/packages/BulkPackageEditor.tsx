import { useEffect, useMemo, useState } from 'react'
import { LoaderCircle, Save, X } from 'lucide-react'
import type { ColumnConfig, InputColumnField, Package, PackageInput, WorkflowConfig } from '../../types/package'
import { SubmissionSlider } from './SubmissionSlider'

type BulkField = Extract<InputColumnField, 'document_type' | 'initiator' | 'discipline' | 'number_of_documents'> | 'notes'

const bulkFields: Array<{ name: BulkField; label: string; placeholder?: string }> = [
  { name: 'document_type', label: 'Document type' },
  { name: 'initiator', label: 'Initiator', placeholder: 'Leave blank to keep existing' },
  { name: 'discipline', label: 'Discipline' },
  { name: 'number_of_documents', label: 'Number of documents' },
  { name: 'notes', label: 'Notes', placeholder: 'Leave blank to keep existing' },
]

const fallback: Partial<Record<BulkField, string[]>> = {
  document_type: ['Drawing', 'Technical Report', 'Method Statement', 'Specification', 'Calculation'],
  discipline: ['Civil', 'Structural', 'Architectural', 'Electrical', 'Mechanical', 'Geotechnical'],
}

export type BulkPackagePatch = Partial<Pick<PackageInput, 'document_type' | 'initiator' | 'discipline' | 'number_of_documents' | 'notes' | 'has_attachment' | 'is_abandoned' | 'workflow_terminated' | 'submission_progress'>>

interface Props {
  items: Package[]
  configs: ColumnConfig[]
  workflowConfig: WorkflowConfig
  open: boolean
  saving: boolean
  onClose: () => void
  onSave: (patch: BulkPackagePatch) => void
}

export function BulkPackageEditor({ items, configs, workflowConfig, open, saving, onClose, onSave }: Props) {
  const steps = workflowConfig.submission_steps
  const [documentType, setDocumentType] = useState('')
  const [initiator, setInitiator] = useState('')
  const [discipline, setDiscipline] = useState('')
  const [numberOfDocuments, setNumberOfDocuments] = useState('')
  const [notes, setNotes] = useState('')
  const [hasAttachment, setHasAttachment] = useState<'keep' | 'yes' | 'no'>('keep')
  const [isAbandoned, setIsAbandoned] = useState<'keep' | 'yes' | 'no'>('keep')
  const [workflowTerminated, setWorkflowTerminated] = useState<'keep' | 'yes' | 'no'>('keep')
  const [updateSubmissionProgress, setUpdateSubmissionProgress] = useState(false)
  const [submissionStage, setSubmissionStage] = useState(0)

  const configMap = useMemo(
    () => Object.fromEntries(configs.map((c) => [c.field_name, c])) as Partial<Record<BulkField, ColumnConfig>>,
    [configs],
  )

  useEffect(() => {
    if (!open) return
    setDocumentType('')
    setInitiator('')
    setDiscipline('')
    setNumberOfDocuments('')
    setNotes('')
    setHasAttachment('keep')
    setIsAbandoned('keep')
    setWorkflowTerminated('keep')
    setUpdateSubmissionProgress(false)
    setSubmissionStage(0)
  }, [open, items])

  if (!open) return null

  const buildPatch = (): BulkPackagePatch | null => {
    const patch: BulkPackagePatch = {}
    if (documentType) patch.document_type = documentType
    if (initiator.trim()) patch.initiator = initiator.trim()
    if (discipline) patch.discipline = discipline
    if (numberOfDocuments.trim()) {
      const value = Number(numberOfDocuments)
      if (!Number.isInteger(value) || value < 1) {
        window.alert('Number of documents must be a positive integer')
        return null
      }
      patch.number_of_documents = value
    }
    if (notes.trim()) patch.notes = notes.trim()
    if (hasAttachment !== 'keep') patch.has_attachment = hasAttachment === 'yes'
    if (isAbandoned !== 'keep') patch.is_abandoned = isAbandoned === 'yes'
    if (workflowTerminated !== 'keep') patch.workflow_terminated = workflowTerminated === 'yes'
    if (updateSubmissionProgress) {
      patch.submission_progress = Object.fromEntries(steps.map((step, index) => [step, index < submissionStage]))
    }
    if (!Object.keys(patch).length) {
      window.alert('Choose at least one field to update')
      return null
    }
    return patch
  }

  const fieldValue = (name: BulkField) => {
    if (name === 'document_type') return documentType
    if (name === 'initiator') return initiator
    if (name === 'discipline') return discipline
    if (name === 'number_of_documents') return numberOfDocuments
    return notes
  }

  const setField = (name: BulkField, value: string) => {
    if (name === 'document_type') setDocumentType(value)
    else if (name === 'initiator') setInitiator(value)
    else if (name === 'discipline') setDiscipline(value)
    else if (name === 'number_of_documents') setNumberOfDocuments(value)
    else setNotes(value)
  }

  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <div className="modal-backdrop" onClick={onClose} />
      <form
        className="editor-modal bulk-editor-modal"
        onSubmit={(e) => {
          e.preventDefault()
          const patch = buildPatch()
          if (patch) onSave(patch)
        }}
      >
        <header>
          <div>
            <span className="eyebrow">Bulk edit</span>
            <h2>Edit {items.length} document{items.length === 1 ? '' : 's'}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </header>
        <div className="editor-body">
          <div className="bulk-selected-list">
            <strong>Selected documents</strong>
            <div>{items.map((item) => item.document_number).join(', ')}</div>
            <p>Only filled fields are applied. Leave a field blank to keep each document’s current value.</p>
          </div>
          <div className="form-grid">
            {bulkFields.map((field) => {
              const config = configMap[field.name]
              const options = config?.input_type === 'select' ? config.options : fallback[field.name]
              const value = fieldValue(field.name)
              const inputType = field.name === 'number_of_documents' ? 'number' : 'text'
              return (
                <label key={field.name} className={field.name === 'notes' ? 'span-2' : undefined}>
                  <span>{field.label}</span>
                  {options?.length ? (
                    <select value={value} onChange={(e) => setField(field.name, e.target.value)}>
                      <option value="">Keep existing</option>
                      {options.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  ) : (
                    <input
                      type={inputType}
                      min={inputType === 'number' ? 1 : undefined}
                      value={value}
                      placeholder={field.placeholder || 'Leave blank to keep existing'}
                      onChange={(e) => setField(field.name, e.target.value)}
                    />
                  )}
                </label>
              )
            })}
          </div>
          <fieldset className="bulk-progress-section">
            <legend>Submission progress</legend>
            <div className="editor-switch-row">
              <div>
                <strong>Update submission progress</strong>
                <span>Apply the same completed stage to every selected document.</span>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={updateSubmissionProgress}
                  onChange={(e) => setUpdateSubmissionProgress(e.target.checked)}
                />
                <i />
              </label>
            </div>
            <div className={`bulk-progress-slider ${updateSubmissionProgress ? '' : 'disabled'}`}>
              <SubmissionSlider
                steps={steps}
                value={submissionStage}
                onChange={setSubmissionStage}
                disabled={!updateSubmissionProgress}
              />
            </div>
          </fieldset>
          <div className="bulk-toggle-grid">
            <label>
              <span>Has attachment</span>
              <select value={hasAttachment} onChange={(e) => setHasAttachment(e.target.value as 'keep' | 'yes' | 'no')}>
                <option value="keep">Keep existing</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            <label>
              <span>Abandon submission</span>
              <select value={isAbandoned} onChange={(e) => setIsAbandoned(e.target.value as 'keep' | 'yes' | 'no')}>
                <option value="keep">Keep existing</option>
                <option value="yes">Abandoned</option>
                <option value="no">Active</option>
              </select>
            </label>
            <label>
              <span>Workflow terminated</span>
              <select value={workflowTerminated} onChange={(e) => setWorkflowTerminated(e.target.value as 'keep' | 'yes' | 'no')}>
                <option value="keep">Keep existing</option>
                <option value="yes">Terminated</option>
                <option value="no">Open</option>
              </select>
            </label>
          </div>
        </div>
        <footer>
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
            {saving ? 'Saving…' : `Apply to ${items.length} document${items.length === 1 ? '' : 's'}`}
          </button>
        </footer>
      </form>
    </div>
  )
}
