export function ProgressTrack({steps,values,disabled=false,onAdvance}:{steps:readonly string[];values:Record<string,boolean>;disabled?:boolean;onAdvance?:()=>void}){
  const completed=steps.filter(step=>values[step]).length
  const percent=Math.round((completed/steps.length)*100)
  const current=steps.find(step=>!values[step])
  const label=disabled?'Submission stopped':current||'Complete'
  const canAdvance=!!onAdvance&&!disabled&&!!current
  return <button type="button" className={`progress-widget ${disabled?'disabled':''} ${canAdvance?'interactive':''}`} title={canAdvance?`Advance ${current}`:label} disabled={!canAdvance} onClick={event=>{event.stopPropagation();onAdvance?.()}}>
    <span className="progress-summary"><span>{label}</span><strong>{disabled?'Stopped':`${percent}%`}</strong></span>
    <span className="segmented-track">{steps.map(step=><span key={step} className={values[step]?'complete':''} aria-label={`${step}: ${values[step]?'complete':'pending'}`}/>)}</span>
  </button>
}
