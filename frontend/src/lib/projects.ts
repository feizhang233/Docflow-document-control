import { projectCodes, type ProjectCode, type ProjectFilter } from '../types/package'

export const projectLabels: Record<ProjectFilter, string> = {
  ALL: 'All Projects',
  NFS: 'NFS Main Project',
  FST: 'Fire Station',
  FBP: 'Footbridge',
}

export function projectFilterFrom(value: string | null): ProjectFilter {
  return projectCodes.includes(value as ProjectCode) ? value as ProjectCode : 'ALL'
}

export function transmittalPrefix(project: ProjectCode, documentType: string): string {
  const type = documentType === 'PZI' ? 'PZI' : documentType === 'RFI' ? 'RFI' : 'RPT'
  return `${project}-PCH-TRA-${type}-`
}

export function isAutomaticTransmittalNumber(value: string | null | undefined): boolean {
  return /^(NFS|FST|FBP)-PCH-TRA-(PZI|RFI|RPT)-$/.test(value || '')
}

export function prefixesForProject(prefixes: string[], project: ProjectFilter): string[] {
  const projects = project === 'ALL' ? projectCodes : [project]
  return Array.from(new Set(projects.flatMap(code => prefixes.map(prefix => prefix.replace(/^[^-]+-/, `${code}-`)))))
}
