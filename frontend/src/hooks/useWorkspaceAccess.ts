import { useSearchParams } from 'react-router-dom'
import { projectFilterFrom } from '../lib/projects'
import { useAuth } from './useAuth'
import { useProjects } from './useProjects'

export function useWorkspaceAccess() {
  const { can } = useAuth()
  const { codes, canSeeAll } = useProjects()
  const [params] = useSearchParams()
  const project = projectFilterFrom(params.get('project'), codes, canSeeAll)
  const accountViewOnly = !codes.some(code => can('packages:write', code))
  const viewOnly = accountViewOnly || (project !== 'ALL' && !can('packages:write', project))
  return { viewOnly, accountViewOnly, project }
}
