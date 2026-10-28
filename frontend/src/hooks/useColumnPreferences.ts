import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getApiError, settingsApi } from '../lib/api'
import type { ColumnConfig, ColumnPreferencesPatch, ColumnVisibility, PageKind, RegisterColumnField } from '../types/package'
import { useAuth } from './useAuth'

const preferenceKey = (accountId: number | undefined, register: PageKind) => ['account-column-preferences', accountId, register] as const

export function useColumnPreferences(register: PageKind, defaults: ColumnConfig[]) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const preferences = useQuery({
    queryKey: preferenceKey(user?.id, register),
    queryFn: () => settingsApi.getMyColumns(register, user!.id),
    enabled: !!user,
  })
  const save = useMutation({
    mutationFn: ({ register: target, patch, accountId }: { accountId: number; register: PageKind; patch: ColumnPreferencesPatch }) => settingsApi.updateMyColumns(target, patch, accountId),
    onSuccess: async (saved, variables) => {
      // A save may finish after navigation; only update its original account/register.
      const queryKey = preferenceKey(variables.accountId, variables.register)
      await queryClient.cancelQueries({ queryKey })
      queryClient.setQueryData(queryKey, saved)
    },
    onError: (error) => toast.error(`Could not save your column settings. ${getApiError(error)}`),
  })
  const configs = useMemo(() => {
    const key = register === 'documents' ? 'is_visible' : register === 'workflow' ? 'is_visible_workflow' : 'is_visible_transmittal'
    return defaults.map((config) => {
      const visibility = preferences.data?.visibility
      const field = config.field_name
      if (field === 'number_of_documents' || visibility?.[field] === undefined) return config
      return { ...config, [key]: visibility[field] }
    })
  }, [defaults, register, preferences.data])

  const savePreferences = (patch: ColumnPreferencesPatch) => {
    if (!user || !preferences.isSuccess || save.isPending) return
    save.mutate({ accountId: user.id, register, patch })
  }

  return {
    configs,
    preferences,
    saving: save.isPending,
    columnOrder: preferences.data?.column_order || [],
    setVisibility: (visibility: ColumnVisibility) => savePreferences({ visibility }),
    setColumnOrder: (column_order: RegisterColumnField[]) => savePreferences({ column_order }),
  }
}
