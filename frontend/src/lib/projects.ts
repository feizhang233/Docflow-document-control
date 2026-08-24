import type { ProjectCode, ProjectFilter, ProjectSetting } from '../types/package'

export const defaultProjects: ProjectSetting[] = [
  { id: 1, code: 'NFS', name: 'NFS Main Project', document_count: 0 },
  { id: 2, code: 'FST', name: 'Fire Station', document_count: 0 },
  { id: 3, code: 'FBP', name: 'Footbridge', document_count: 0 },
]

export function projectCodesFrom(projects: Array<{ code: string }>): ProjectCode[] {
  return projects.map((project) => project.code)
}

export function projectLabelsFrom(projects: Array<{ code: string; name: string }>): Record<string, string> {
  return Object.fromEntries([['ALL', 'All Projects'], ...projects.map((project) => [project.code, project.name])])
}

export function projectFilterFrom(value: string | null, codes: readonly string[] = projectCodesFrom(defaultProjects), canSeeAll = true): ProjectFilter {
  if (value && codes.includes(value)) return value
  if (!canSeeAll && codes.length === 1) return codes[0]
  return canSeeAll || codes.length !== 1 ? 'ALL' : codes[0] || 'ALL'
}

export function transmittalPrefix(project: ProjectCode, documentType: string): string {
  const type = documentType === 'PZI' ? 'PZI' : documentType === 'RFI' ? 'RFI' : 'RPT'
  return `${project}-PCH-TRA-${type}-`
}

export function isAutomaticTransmittalNumber(value: string | null | undefined, codes: readonly string[] = projectCodesFrom(defaultProjects)): boolean {
  if (!value || !codes.length) return false
  const escaped = codes.map((code) => code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  return new RegExp(`^(${escaped})-PCH-TRA-(PZI|RFI|RPT)-$`).test(value)
}

export function columnOptionsFor(config: { input_type?: string; options?: string[]; share_options?: boolean; project_options?: Record<string, string[]> } | null | undefined, projectCode?: string | null, fallback: readonly string[] = []): string[] {
  if (!config || config.input_type !== 'select') return [...fallback]
  if (config.share_options !== false) return config.options?.length ? config.options : [...fallback]
  const projectList = projectCode ? config.project_options?.[projectCode] : undefined
  if (projectList?.length) return projectList
  return config.options?.length ? config.options : [...fallback]
}

export function columnOptionColorsFor(config: { share_options?: boolean; option_colors?: Record<string, string>; project_option_colors?: Record<string, Record<string, string>> } | null | undefined, projectCode?: string | null): Record<string, string> {
  if (!config) return {}
  if (config.share_options !== false) return config.option_colors || {}
  return (projectCode && config.project_option_colors?.[projectCode]) || config.option_colors || {}
}

export function submissionStepsFor(config: { submission_steps?: string[]; project_submission_steps?: Record<string, string[]> } | null | undefined, projectCode?: string | null, fallback: readonly string[] = ['Transmittal Preparation', 'DCO Backup', 'Workflow Prepare', 'Email Feedback']): string[] {
  const override = projectCode ? config?.project_submission_steps?.[projectCode] : undefined
  if (override?.length) return override
  if (config?.submission_steps?.length) return config.submission_steps
  return [...fallback]
}

export function prefixesForProject(prefixes: string[], project: ProjectFilter, codes: readonly string[] = projectCodesFrom(defaultProjects)): string[] {
  const projects = project === 'ALL' ? codes : [project]
  return Array.from(new Set(projects.flatMap((code) => prefixes.map((prefix) => prefix.replace(/^[^-]+-/, `${code}-`)))))
}
