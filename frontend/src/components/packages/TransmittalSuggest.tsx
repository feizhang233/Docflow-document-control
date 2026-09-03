import { LoaderCircle } from 'lucide-react'

export function TransmittalSuggest({
  next,
  applied,
  loading,
  error,
  onApply,
}: {
  next: string
  applied: boolean
  loading: boolean
  error: boolean
  onApply: () => void
}) {
  return (
    <div className="transmittal-suggest">
      <span>Suggested</span>
      {loading ? (
        <div className="transmittal-suggest-state"><LoaderCircle className="spin" size={14} /> Looking up…</div>
      ) : error ? (
        <div className="transmittal-suggest-state">Could not load the next number</div>
      ) : (
        <button
          type="button"
          className={`transmittal-suggest-code ${applied ? 'applied' : ''}`}
          onClick={onApply}
          disabled={!next}
          title="Click to use this transmittal number"
        >
          {next}
        </button>
      )}
    </div>
  )
}
