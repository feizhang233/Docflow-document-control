import { AlertTriangle, FileSearch, LoaderCircle, RefreshCw } from 'lucide-react'

export function LoadingState() {
  return <div className="state-panel"><LoaderCircle className="spin" size={28}/><strong>Loading documents</strong><span>Retrieving the latest register…</span></div>
}
export function EmptyState({ filtered = false }: { filtered?: boolean }) {
  return <div className="state-panel"><FileSearch size={30}/><strong>{filtered ? 'No matching documents' : 'No documents yet'}</strong><span>{filtered ? 'Try changing your search or filters.' : 'Create a document to begin the workflow.'}</span></div>
}
export function ErrorState({ message, retry, title = 'Could not load documents' }: { message: string; retry: () => void; title?: string }) {
  return <div className="state-panel error"><AlertTriangle size={30}/><strong>{title}</strong><span>{message}</span><button className="secondary-button" onClick={retry}><RefreshCw size={15}/> Try again</button></div>
}
