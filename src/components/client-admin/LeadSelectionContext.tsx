'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface LeadSelectionValue {
  selected: Set<string>
  totalCount: number
  toggle: (id: string) => void
  selectMany: (ids: string[]) => void
  clear: () => void
}

const LeadSelectionContext = createContext<LeadSelectionValue | null>(null)

// Wraps the client-admin leads page so LeadsCenter (row checkboxes) and
// LeadsAdminActions (the delete button) share which leads are selected,
// without threading state through the server page component. Absent
// everywhere else (e.g. /app/my-leads), so useLeadSelection() there just
// returns null and LeadsCenter renders no checkboxes — zero effect on other
// roles/pages.
export function LeadSelectionProvider({ totalCount, children }: { totalCount: number; children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])
  const selectMany = useCallback((ids: string[]) => setSelected(new Set(ids)), [])
  const clear = useCallback(() => setSelected(new Set()), [])

  return (
    <LeadSelectionContext.Provider value={{ selected, totalCount, toggle, selectMany, clear }}>
      {children}
    </LeadSelectionContext.Provider>
  )
}

export function useLeadSelection() {
  return useContext(LeadSelectionContext)
}
