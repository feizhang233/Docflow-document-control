import { useQuery } from '@tanstack/react-query'
import { settingsApi } from '../lib/api'
import { defaultProjects, projectCodesFrom, projectLabelsFrom } from '../lib/projects'
import { useAuth } from './useAuth'

export function useProjects() {
  const { user } = useAuth()
  const query = useQuery({ queryKey: ['project-config'], queryFn: settingsApi.getProjects })
  const scopedDefaults = user && !user.all_projects
    ? defaultProjects.filter((project) => user.project_codes.includes(project.code))
    : defaultProjects
  const projects = query.data?.projects?.length ? query.data.projects : scopedDefaults
  const codes = projectCodesFrom(projects)
  const labels = projectLabelsFrom(projects)
  return {
    query,
    projects,
    codes,
    labels,
    canSeeAll: !user || user.all_projects,
    defaultCode: codes[0] || 'NFS',
  }
}
