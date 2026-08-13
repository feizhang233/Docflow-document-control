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

export function projectFilterFrom(value: string | null, codes: readonly string[] = projectCodesFrom(defaultProjects)): ProjectFilter {
  return value && codes.includes(value) ? value : 'ALL'
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

export function prefixesForProject(prefixes: string[], project: ProjectFilter, codes: readonly string[] = projectCodesFrom(defaultProjects)): string[] {
  const projects = project === 'ALL' ? codes : [project]
  return Array.from(new Set(projects.flatMap((code) => prefixes.map((prefix) => prefix.replace(/^[^-]+-/, `${code}-`)))))
}
