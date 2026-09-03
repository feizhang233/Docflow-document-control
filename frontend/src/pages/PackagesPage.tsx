import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlignJustify, Ban, CheckSquare, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Filter, MoreHorizontal, OctagonX, Pencil, Plus, RotateCcw, Search, Square, Trash2, X } from 'lucide-react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { getApiError, packagesApi, settingsApi } from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { feedbackSteps, submissionSteps, type FilterRule, type Package, type PackageInput, type PageKind, type Period, type WorkflowConfig } from '../types/package'
import { EmptyState, ErrorState, LoadingState } from '../components/common/PageState'
import { PackageTable } from '../components/packages/PackageTable'
import { PackageDrawer } from '../components/packages/PackageDrawer'
import { PackageEditor } from '../components/packages/PackageEditor'
import { BulkPackageEditor, type BulkPackagePatch } from '../components/packages/BulkPackageEditor'
import { AdvancedFilter } from '../components/packages/AdvancedFilter'
import { useDismissableLayer } from '../hooks/useDismissableLayer'
import { useProjects } from '../hooks/useProjects'
import { columnOptionsFor, prefixesForProject, projectFilterFrom, submissionStepsFor } from '../lib/projects'
import { ConfirmDialog } from '../components/common/ConfirmDialog'

const meta = {
  documents: ['Documents', 'Manage submissions and monitor every stage of your document register.'],
  workflow: ['Workflow register', 'Track workflow references and external feedback across all documents.'],
  transmittal: ['Transmittal register', 'Review issued transmittals and their feedback status.'],
} as const
const defaultWorkflowConfig: WorkflowConfig = {
  id: 1,
  submission_steps: [...submissionSteps],
  project_submission_steps: {},
  feedback_reviewers: [...feedbackSteps],
  feedback_status_labels: { A: 'Approved', B: 'Approved with comments', C: 'Rejected', P: 'Pending' },
  feedback_status_colors: { A: '#21815d', B: '#9b6816', C: '#b13f4c', P: '#4267bd' },
  transmittal_prefixes: ['NFS-PCH-TRA-PZI-', 'NFS-PCH-TRA-RFI-', 'NFS-PCH-TRA-RPT-'],
  updated_at: '',
}

export function PackagesPage({ kind }: { kind: PageKind }) {
  const { period: routePeriod } = useParams()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const {codes, labels, canSeeAll} = useProjects()
  const {can} = useAuth()
  const canWrite = can('packages:write')
  const canDelete = can('packages:delete')
  const canManageColumns = can('settings:write')
  const selectedProject = projectFilterFrom(searchParams.get('project'), codes, canSeeAll)
  const focusParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const focusValue = focusParams.get('focus') || ''
  const focusPackageId = Number(focusParams.get('package')) || null
  const period = kind === 'documents' ? (routePeriod as Period || 'week') : 'all'
  const [searchInput, setSearchInput] = useState(() => searchParams.get('q') || '')
  const [search, setSearch] = useState(() => searchParams.get('q') || '')
  const [isComposing, setIsComposing] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [discipline, setDiscipline] = useState(() => searchParams.get('discipline') || '')
  const [transmittalPrefix, setTransmittalPrefix] = useState(() => searchParams.get('transmittal') || '')
  const [sortBy, setSortBy] = useState(() => searchParams.get('sort') || (kind === 'workflow' ? 'workflow_number' : kind === 'transmittal' ? 'transmittal_number' : 'document_date'))
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(() => searchParams.get('order') === 'asc' ? 'asc' : 'desc')
  const [selected, setSelected] = useState<Package | null>(null)
  const [editing, setEditing] = useState<Package | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [filters, setFilters] = useState<FilterRule[]>([])
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get('page')) || 1))
  const [pageSize, setPageSize] = useState(() => [50, 100, 200].includes(Number(searchParams.get('size'))) ? Number(searchParams.get('size')) : 200)
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() => {
    try { return localStorage.getItem('docflow-density') === 'compact' ? 'compact' : 'comfortable' } catch { return 'comfortable' }
  })
  const [highlightedPackageId, setHighlightedPackageId] = useState<number | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false)
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const bulkMenuRef = useDismissableLayer<HTMLDivElement>(bulkMenuOpen, () => setBulkMenuOpen(false))
  const queryClient = useQueryClient()
  const focusPackageQuery = useQuery({ queryKey: ['package-focus', focusPackageId], queryFn: () => packagesApi.get(focusPackageId!), enabled: !!focusPackageId, retry: false })
  const focusSearchValue = focusPackageQuery.data?.document_number || focusValue
  const params = { period, project_code: selectedProject === 'ALL' ? undefined : selectedProject, search: search || undefined, discipline: discipline || undefined, transmittal_prefix: kind === 'transmittal' ? (transmittalPrefix || undefined) : undefined, sort_by: sortBy, sort_order: sortOrder, page, page_size: pageSize }
  const query = useQuery({ queryKey: ['packages', params], queryFn: () => packagesApi.list(params), placeholderData: (previous) => previous })
  const configs = useQuery({ queryKey: ['column-configs'], queryFn: settingsApi.listColumns })
  const workflowQuery = useQuery({ queryKey: ['workflow-config'], queryFn: settingsApi.getWorkflow })
  const workflowConfig = workflowQuery.data || defaultWorkflowConfig
  const currentSubmissionSteps = workflowConfig.submission_steps
  const stepsForProject = (projectCode: string) => submissionStepsFor(workflowConfig, projectCode)
  const currentFeedbackReviewers = workflowConfig.feedback_reviewers
  const transmittalPrefixes = useMemo(() => prefixesForProject(workflowConfig.transmittal_prefixes, selectedProject, codes), [workflowConfig.transmittal_prefixes, selectedProject, codes])
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['packages'] })
    queryClient.invalidateQueries({ queryKey: ['transmittal-numbers'] })
  }
  const save = useMutation({
    mutationFn: (data: PackageInput) => (editing ? packagesApi.update(editing.id, data) : packagesApi.create(data)),
    onSuccess: () => { toast.success(editing ? 'Document updated' : 'Document created'); setEditorOpen(false); refresh() },
    onError: (e) => toast.error(getApiError(e)),
  })
  const reorder = useMutation({
    mutationFn: packagesApi.reorder,
    onMutate: async ({ ids }) => {
      await queryClient.cancelQueries({ queryKey: ['packages', params] })
      const prev = queryClient.getQueryData(['packages', params])
      queryClient.setQueryData(['packages', params], (old: typeof query.data) => old ? { ...old, items: ids.map((id) => old.items.find((i) => i.id === id)!).filter(Boolean) } : old)
      return { prev }
    },
    onError: (_e, _v, c) => { if (c?.prev) queryClient.setQueryData(['packages', params], c.prev); toast.error('Could not save the new order') },
    onSettled: refresh,
  })
  const quickUpdate = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<PackageInput> }) => packagesApi.update(id, data),
    onSuccess: (updated) => {
      if (selected?.id === updated.id) setSelected(updated)
      refresh()
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (e) => toast.error(getApiError(e)),
  })
  const duplicate = useMutation({
    mutationFn: (item: Package) => packagesApi.duplicate(item.id),
    onSuccess: (item) => { toast.success(`Duplicated as ${item.document_number}`); refresh() },
    onError: (e) => toast.error(getApiError(e)),
  })
  const remove = useMutation({
    mutationFn: (item: Package) => packagesApi.remove(item.id),
    onSuccess: (_result, item) => {
      toast.success(`${item.document_number} deleted permanently`)
      if (selected?.id === item.id) setSelected(null)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
      refresh()
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (e) => toast.error(getApiError(e)),
  })
  const bulkUpdate = useMutation({
    mutationFn: async ({ ids, patch }: { ids: number[]; patch: BulkPackagePatch }) => {
      const results = await Promise.allSettled(ids.map((id) => packagesApi.update(id, patch)))
      const failed = results.filter((result) => result.status === 'rejected').length
      if (failed === ids.length) throw new Error('Could not update any selected documents')
      return { updated: ids.length - failed, failed }
    },
    onSuccess: ({ updated, failed }) => {
      toast.success(failed ? `Updated ${updated} documents · ${failed} failed` : `Updated ${updated} documents`)
      setBulkEditorOpen(false)
      setSelectedIds(new Set())
      refresh()
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (e) => toast.error(getApiError(e)),
  })
  const bulkDelete = useMutation({
    mutationFn: async (ids: number[]) => {
      const results = await Promise.allSettled(ids.map((id) => packagesApi.remove(id)))
      const failed = results.filter((result) => result.status === 'rejected').length
      if (failed === ids.length) throw new Error('Could not delete any selected documents')
      return { deleted: ids.length - failed, failed }
    },
    onSuccess: ({ deleted, failed }) => {
      toast.success(failed ? `Deleted ${deleted} documents · ${failed} failed` : `Deleted ${deleted} documents`)
      if (selected && selectedIds.has(selected.id)) setSelected(null)
      setSelectedIds(new Set())
      refresh()
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (e) => toast.error(getApiError(e)),
  })
  const bulkFlag = useMutation({
    mutationFn: async ({ ids, data }: { ids: number[]; data: Partial<PackageInput> }) => {
      const results = await Promise.allSettled(ids.map((id) => packagesApi.update(id, data)))
      const failed = results.filter((result) => result.status === 'rejected').length
      if (failed === ids.length) throw new Error('Could not update any selected documents')
      return { updated: ids.length - failed, failed }
    },
    onSuccess: ({ updated, failed }) => {
      toast.success(failed ? `Updated ${updated} documents · ${failed} failed` : `Updated ${updated} documents`)
      setBulkMenuOpen(false)
      setSelectedIds(new Set())
      refresh()
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (e) => toast.error(getApiError(e)),
  })
  const resizeColumn = useMutation({
    mutationFn: ({ config, width }: { config: NonNullable<typeof configs.data>[number]; width: number }) => settingsApi.updateColumn(config.field_name, {
      display_name: config.display_name,
      is_visible: config.is_visible,
      column_width: Math.round(width),
      input_type: config.input_type,
      options: config.options,
      option_colors: config.option_colors,
    }),
    onMutate: async ({ config, width }) => {
      await queryClient.cancelQueries({ queryKey: ['column-configs'] })
      const previous = queryClient.getQueryData<typeof configs.data>(['column-configs'])
      const nextWidth = Math.round(width)
      queryClient.setQueryData<typeof configs.data>(['column-configs'], (items) => items?.map((item) => item.field_name === config.field_name ? { ...item, column_width: nextWidth } : item))
      return { previous }
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(['column-configs'], context.previous)
      toast.error(getApiError(error) || 'Could not save column width')
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['column-configs'] }),
  })
  const titlePeriod = period === 'week' ? 'This week' : period === 'month' ? 'This month' : period === 'year' ? 'This year' : 'All records'
  const totalPages = Math.max(1, Math.ceil((query.data?.total || 0) / pageSize))
  useEffect(() => {
    if (isComposing) return
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [searchInput, isComposing])
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !event.isComposing) {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [])
  useEffect(() => {
    const next = new URLSearchParams(location.search)
    const assign = (key: string, value: string, fallback = '') => value && value !== fallback ? next.set(key, value) : next.delete(key)
    assign('q', search)
    assign('discipline', discipline)
    assign('transmittal', kind === 'transmittal' ? transmittalPrefix : '')
    assign('sort', sortBy, kind === 'workflow' ? 'workflow_number' : kind === 'transmittal' ? 'transmittal_number' : 'document_date')
    assign('order', sortOrder, 'desc')
    assign('page', String(page), '1')
    assign('size', String(pageSize), '200')
    const nextValue = next.toString()
    if (nextValue !== searchParams.toString()) setSearchParams(next, { replace: true })
  }, [discipline, kind, location.search, page, pageSize, search, searchParams, setSearchParams, sortBy, sortOrder, transmittalPrefix])
  useEffect(() => {
    setSortBy(kind === 'workflow' ? 'workflow_number' : kind === 'transmittal' ? 'transmittal_number' : 'document_date')
    setSortOrder('desc')
    setTransmittalPrefix('')
    setSelectionMode(false)
    setSelectedIds(new Set())
    setSelected(null)
    setEditing(null)
    setEditorOpen(false)
    setBulkEditorOpen(false)
    setBulkMenuOpen(false)
    setBulkDeleteOpen(false)
  }, [kind, selectedProject])
  useEffect(() => {
    setEditorOpen(false)
    setBulkEditorOpen(false)
  }, [period])
  useEffect(() => setPage(1), [period, selectedProject, search, discipline, transmittalPrefix, sortBy, sortOrder, pageSize])
  useEffect(() => { if (query.data && page > totalPages) setPage(totalPages) }, [query.data, page, totalPages])
  useEffect(() => {
    if (!focusValue && !focusPackageId) return
    setSearch(focusSearchValue)
    setSearchInput(focusSearchValue)
    setDiscipline('')
    setTransmittalPrefix('')
    setFilters([])
    setPage(1)
  }, [focusValue, focusPackageId, focusSearchValue, location.key])
  useEffect(() => {
    if (!query.data?.items.length || (!focusValue && !focusPackageId)) return
    const target = query.data.items.find((item) => (focusPackageId ? item.id === focusPackageId : item.document_number === focusValue || item.workflow_number === focusValue))
    if (!target) return
    setHighlightedPackageId(target.id)
    const scrollTimer = window.setTimeout(() => document.querySelector<HTMLTableRowElement>(`[data-package-id="${target.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' }), 50)
    const clearTimer = window.setTimeout(() => setHighlightedPackageId((current) => (current === target.id ? null : current)), 2600)
    return () => { window.clearTimeout(scrollTimer); window.clearTimeout(clearTimer) }
  }, [query.data?.items, focusValue, focusPackageId, location.key])
  const disciplines = useMemo(() => {
    const config = configs.data?.find((item) => item.field_name === 'discipline')
    if (config?.input_type !== 'select') return Array.from(new Set((query.data?.items || []).map((item) => item.discipline).filter(Boolean))).sort()
    if (selectedProject !== 'ALL') return columnOptionsFor(config, selectedProject)
    if (config.share_options !== false) return config.options
    return Array.from(new Set([
      ...Object.values(config.project_options || {}).flat(),
      ...config.options,
      ...(query.data?.items || []).map((item) => item.discipline).filter(Boolean),
    ])).sort()
  }, [configs.data, query.data?.items, selectedProject])
  const visibleItems = useMemo(() => {
    const items = query.data?.items || []
    const valueFor = (item: Package, field: FilterRule['field']): string => {
      if (field === 'submission_progress') return String(Math.round(currentSubmissionSteps.filter((step) => item.submission_progress[step]).length / currentSubmissionSteps.length * 100))
      if (field === 'feedback') return item.feedback.Terminate ? 'terminated' : String(Math.round(currentFeedbackReviewers.filter((step) => item.feedback[step]).length / currentFeedbackReviewers.length * 100))
      return String(item[field] ?? '')
    }
    return items.filter((item) => filters.every((rule) => {
      if (!rule.value) return true
      const actual = valueFor(item, rule.field).toLowerCase()
      const expected = rule.value.toLowerCase()
      return rule.operator === 'contains' ? actual.includes(expected) : rule.operator === 'equals' ? actual === expected : actual !== expected
    }))
  }, [query.data?.items, filters, currentFeedbackReviewers, currentSubmissionSteps])
  const selectedItems = useMemo(() => visibleItems.filter((item) => selectedIds.has(item.id)), [visibleItems, selectedIds])
  useEffect(() => {
    const visibleIdSet = new Set(visibleItems.map((item) => item.id))
    setSelectedIds((prev) => {
      let changed = false
      const next = new Set<number>()
      prev.forEach((id) => {
        if (visibleIdSet.has(id)) next.add(id)
        else changed = true
      })
      return changed ? next : prev
    })
  }, [visibleItems])
  const advance = (item: Package, type: 'submission' | 'feedback') => {
    if (type === 'submission') {
      const next = stepsForProject(item.project_code).find((step) => !item.submission_progress[step])
      if (!next) return
      quickUpdate.mutate({ id: item.id, data: { submission_progress: { ...item.submission_progress, [next]: true } } })
      return
    }
    const next = currentFeedbackReviewers.find((step) => !item.feedback[step])
    if (!next) return
    quickUpdate.mutate({ id: item.id, data: { feedback: { ...item.feedback, [next]: true } } })
  }
  const exitSelectionMode = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
    setBulkEditorOpen(false)
    setBulkMenuOpen(false)
  }
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    const pageIds = visibleItems.map((item) => item.id)
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) pageIds.forEach((id) => next.delete(id))
      else pageIds.forEach((id) => next.add(id))
      return next
    })
  }
  const confirmBulkDelete = () => {
    if (!selectedItems.length) return
    setBulkDeleteOpen(true)
  }
  const updateSearchInput = (value: string) => {
    setSearchInput(value)
    if (focusValue || focusPackageId) {
      const next = new URLSearchParams(searchParams)
      next.delete('focus'); next.delete('package'); next.delete('notification')
      setSearchParams(next, { replace: true })
    }
  }
  const clearSearch = () => {
    setSearchInput('')
    setSearch('')
    searchInputRef.current?.focus()
  }
  const toggleDensity = () => setDensity((value) => {
    const next = value === 'comfortable' ? 'compact' : 'comfortable'
    try { localStorage.setItem('docflow-density', next) } catch { /* Preference remains session-only. */ }
    return next
  })
  return (
    <>
      <div className="page-header">
        <div>
          <div className="breadcrumb">Document Control <span>/</span> {labels[selectedProject]} <span>/</span> {kind === 'documents' ? titlePeriod : meta[kind][0]}</div>
          <h1>{meta[kind][0]}</h1>
          <p>{meta[kind][1]}</p>
        </div>
        <div className="header-actions">
          {canWrite && <button
            className={`secondary-button ${selectionMode ? 'active-select' : ''}`}
            onClick={() => {
              if (selectionMode) exitSelectionMode()
              else {
                setSelectionMode(true)
                setSelectedIds(new Set())
              }
            }}
          >
            {selectionMode ? <CheckSquare size={16} /> : <Square size={16} />}
            {selectionMode ? 'Cancel select' : 'Select'}
          </button>}
          {canWrite && <button className="primary-button" onClick={() => { setSelected(null); setEditing(null); setEditorOpen(true) }}><Plus size={17} /> New document</button>}
        </div>
      </div>
      <section className={`data-card density-${density}`}>
        <div className="table-toolbar">
          <div className="search-box">
            <Search size={17} />
            <input
              ref={searchInputRef}
              value={searchInput}
              onChange={(e) => updateSearchInput(e.target.value)}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              placeholder="Search documents, workflows, people…"
              aria-label="Search document register"
            />
            {searchInput && <button type="button" className="search-clear" onClick={clearSearch} aria-label="Clear search"><X size={15} /></button>}
            <kbd>⌘ K</kbd>
          </div>
          <div className="toolbar-filters">
            <button type="button" className="icon-button bordered density-toggle" onClick={toggleDensity} aria-label={`Use ${density === 'comfortable' ? 'compact' : 'comfortable'} table density`} aria-pressed={density === 'compact'}><AlignJustify size={16} /></button>
            {kind === 'transmittal' && (
              <label className={`transmittal-prefix-filter ${transmittalPrefix ? 'active' : ''}`}>
                <Filter size={16} />
                <span>Type</span>
                <select aria-label="Filter by transmittal number prefix" value={transmittalPrefix} onChange={(e) => setTransmittalPrefix(e.target.value)}>
                  <option value="">All transmittals</option>
                  {transmittalPrefixes.map((prefix) => <option key={prefix} value={prefix}>{prefix}</option>)}
                </select>
              </label>
            )}
            <label>
              <Filter size={15} />
              <select value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
                <option value="">All disciplines</option>
                {disciplines.map((d) => <option key={d}>{d}</option>)}
              </select>
            </label>
            <AdvancedFilter rules={filters} onChange={setFilters} />
          </div>
        </div>
        {selectionMode && (
          <div className="selection-bar">
            <div className="selection-summary">
              <strong>{selectedIds.size}</strong> selected
              <span>·</span>
              <button type="button" onClick={toggleSelectAll}>{visibleItems.every((item) => selectedIds.has(item.id)) && visibleItems.length ? 'Clear page' : 'Select page'}</button>
              {!!selectedIds.size && <button type="button" onClick={() => setSelectedIds(new Set())}>Clear all</button>}
            </div>
            <div className="selection-actions">
              <button
                className="secondary-button"
                disabled={!selectedIds.size || bulkUpdate.isPending}
                onClick={() => { setSelected(null); setBulkEditorOpen(true) }}
              >
                <Pencil size={15} /> Edit together
              </button>
              {canDelete && <button
                className="secondary-button danger-button"
                disabled={!selectedIds.size || bulkDelete.isPending}
                onClick={confirmBulkDelete}
              >
                <Trash2 size={15} /> Delete
              </button>}
              <div className="bulk-more" ref={bulkMenuRef}>
                <button
                  className="secondary-button"
                  disabled={!selectedIds.size || bulkFlag.isPending}
                  onClick={() => setBulkMenuOpen((value) => !value)}
                  aria-expanded={bulkMenuOpen}
                >
                  <MoreHorizontal size={15} /> More
                </button>
                {bulkMenuOpen && (
                  <div className="bulk-more-popover">
                    <button onClick={() => { setBulkMenuOpen(false); bulkFlag.mutate({ ids: selectedItems.map((item) => item.id), data: { is_abandoned: true } }) }}><Ban />Abandon selected</button>
                    <button onClick={() => { setBulkMenuOpen(false); bulkFlag.mutate({ ids: selectedItems.map((item) => item.id), data: { is_abandoned: false } }) }}><RotateCcw />Restore selected</button>
                    <button onClick={() => { setBulkMenuOpen(false); bulkFlag.mutate({ ids: selectedItems.map((item) => item.id), data: { workflow_terminated: true } }) }}><OctagonX />Terminate workflows</button>
                    <button onClick={() => { setBulkMenuOpen(false); bulkFlag.mutate({ ids: selectedItems.map((item) => item.id), data: { workflow_terminated: false } }) }}><RotateCcw />Reopen workflows</button>
                  </div>
                )}
              </div>
              <button className="icon-button" onClick={exitSelectionMode} aria-label="Exit selection mode"><X size={16} /></button>
            </div>
          </div>
        )}
        <div className="result-strip">
          <div>
            <strong>{filters.length ? visibleItems.length : query.data?.total ?? '—'}</strong> documents <span>·</span> {labels[selectedProject]} <span>·</span> {titlePeriod}
            {filters.length > 0 && <span>· {filters.length} filters</span>}
            {selectionMode && <span>· Selection mode</span>}
          </div>
          <div className="legend"><i className="done" /> Complete <i /> Pending</div>
        </div>
        {query.isLoading ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState message={getApiError(query.error)} retry={() => query.refetch()} />
        ) : !visibleItems.length ? (
          <EmptyState filtered={!!search || !!discipline || !!transmittalPrefix || !!filters.length} />
        ) : (
          <PackageTable
            items={visibleItems}
            highlightedPackageId={highlightedPackageId}
            kind={kind}
            configs={configs.data || []}
            submissionSteps={currentSubmissionSteps}
            submissionStepsFor={stepsForProject}
            feedbackReviewers={currentFeedbackReviewers}
            feedbackStatusLabels={workflowConfig.feedback_status_labels}
            feedbackStatusColors={workflowConfig.feedback_status_colors}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            {...{ sortBy, sortOrder }}
            onSort={(key) => {
              if (sortBy === key) setSortOrder((v) => (v === 'asc' ? 'desc' : 'asc'))
              else { setSortBy(key); setSortOrder('asc') }
            }}
            onView={setSelected}
            onEdit={(item) => { setSelected(null); setEditing(item); setEditorOpen(true) }}
            canWrite={canWrite}
            canDelete={canDelete}
            onColumnResize={(field, width) => {
              const config = configs.data?.find((item) => item.field_name === field)
              if (config && canManageColumns) resizeColumn.mutate({ config, width })
            }}
            onReorder={(ids) => { if (canWrite) reorder.mutate({ ids, startIndex: (page - 1) * pageSize }) }}
            onAdvance={canWrite ? advance : undefined}
            onDuplicate={(item) => duplicate.mutate(item)}
            onToggleAbandoned={(item) => quickUpdate.mutate({ id: item.id, data: { is_abandoned: !item.is_abandoned } })}
            onToggleTerminate={(item) => quickUpdate.mutate({ id: item.id, data: { workflow_terminated: !item.workflow_terminated } })}
            onDelete={(item) => remove.mutateAsync(item)}
          />
        )}
        {!!visibleItems.length && (
          <div className="table-footer pagination-footer">
            <span>
              {filters.length
                ? `Showing ${visibleItems.length} matching rows on this page`
                : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, query.data?.total || 0)} of ${query.data?.total || 0} documents`}
            </span>
            <div className="pagination-controls">
              <label>
                Rows per page{' '}
                <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>
              </label>
              <span>Page {page} of {totalPages}</span>
              <button aria-label="First page" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft /></button>
              <button aria-label="Previous page" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft /></button>
              <button aria-label="Next page" disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}><ChevronRight /></button>
              <button aria-label="Last page" disabled={page === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight /></button>
            </div>
          </div>
        )}
      </section>
      <PackageDrawer item={selected} configs={configs.data || []} workflowConfig={workflowConfig} saving={quickUpdate.isPending} readOnly={!canWrite} onUpdate={(data) => selected && quickUpdate.mutate({ id: selected.id, data })} onClose={() => setSelected(null)} />
      <PackageEditor item={editing} configs={configs.data || []} workflowConfig={workflowConfig} open={editorOpen} saving={save.isPending} onClose={() => setEditorOpen(false)} onSave={(data) => save.mutate(data)} defaultProject={selectedProject === 'ALL' ? undefined : selectedProject} />
      <BulkPackageEditor
        items={selectedItems}
        configs={configs.data || []}
        workflowConfig={workflowConfig}
        open={bulkEditorOpen}
        saving={bulkUpdate.isPending}
        onClose={() => setBulkEditorOpen(false)}
        onSave={(patch) => bulkUpdate.mutate({ ids: selectedItems.map((item) => item.id), patch })}
      />
      <ConfirmDialog
        open={bulkDeleteOpen}
        title={`Permanently delete ${selectedItems.length} document${selectedItems.length === 1 ? '' : 's'}?`}
        description={<>This removes the selected records and their register history from DocFlow. <strong>This action cannot be undone.</strong></>}
        confirmLabel={`Delete ${selectedItems.length} document${selectedItems.length === 1 ? '' : 's'}`}
        onClose={() => setBulkDeleteOpen(false)}
        onConfirm={() => bulkDelete.mutateAsync(selectedItems.map((item) => item.id))}
      />
    </>
  )
}
