import { Hash, LoaderCircle } from 'lucide-react'

export function TransmittalSuggest({
  type,
  latest,
  next,
  applied,
  loading,
  error,
  onApply,
}: {
  type: string
  latest: string | null
  next: string
  applied: boolean
  loading: boolean
  error: boolean
  onApply: () => void
}) {
  return (
    <aside className="transmittal-suggest">
      <span className="eyebrow">Suggested transmittal</span>
      {loading ? (
        <div className="transmittal-suggest-state"><LoaderCircle className="spin" size={16} /> Looking up the {type} series…</div>
      ) : error ? (
        <div className="transmittal-suggest-state">Could not load the next {type} transmittal.</div>
      ) : (
        <>
          <p className="transmittal-suggest-kicker">{type} series</p>
          <strong className="transmittal-suggest-number">{next}</strong>
          <p>{latest ? `Latest issued is ${latest}.` : `No ${type} transmittals issued yet.`}</p>
          <button type="button" className="secondary-button" disabled={applied || !next} onClick={onApply}>
            <Hash size={15} />
            {applied ? 'Applied' : 'Use this number'}
          </button>
        </>
      )}
    </aside>
  )
}
