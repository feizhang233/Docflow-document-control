import { useQuery } from '@tanstack/react-query'
import { settingsApi } from '../lib/api'
import { defaultProjects, projectCodesFrom, projectLabelsFrom } from '../lib/projects'

export function useProjects() {
  const query = useQuery({ queryKey: ['project-config'], queryFn: settingsApi.getProjects })
  const projects = query.data?.projects?.length ? query.data.projects : defaultProjects
  const codes = projectCodesFrom(projects)
  const labels = projectLabelsFrom(projects)
  return {
    query,
    projects,
    codes,
    labels,
    defaultCode: codes[0] || 'NFS',
  }
}
