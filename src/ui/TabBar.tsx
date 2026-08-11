// ====================================================================
//  Tab-Leiste
//
//  Am unteren Rand, in Daumenreichweite (docs/UI-UX.md §2). Keine
//  Hamburger-Menüs, kein verstecktes Navigieren: Die drei Bereiche, zwischen
//  denen man wechselt, sind immer sichtbar.
//
//  Vier Bereiche: Heute, Fortschritt, Ernährung, Coach.
// ====================================================================

export type Tab = 'today' | 'progress' | 'nutrition' | 'coach'

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Heute' },
  { id: 'progress', label: 'Fortschritt' },
  { id: 'nutrition', label: 'Ernährung' },
  { id: 'coach', label: 'Coach' },
]

export function TabBar({
  active,
  onChange,
}: {
  active: Tab
  onChange: (tab: Tab) => void
}) {
  return (
    <nav
      aria-label="Hauptbereiche"
      className={
        'sticky bottom-0 z-20 border-t border-border bg-bg/95 backdrop-blur ' +
        // Platz für die Gestenleiste auf iPhones, sonst klebt die Leiste am Rand.
        'pb-[env(safe-area-inset-bottom)]'
      }
    >
      <ul className="flex">
        {TABS.map((tab) => {
          const current = tab.id === active
          return (
            <li key={tab.id} className="flex-1">
              <button
                type="button"
                aria-current={current ? 'page' : undefined}
                onClick={() => onChange(tab.id)}
                className={
                  'w-full min-h-14 text-sm font-medium transition-colors ' +
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
                  (current ? 'text-text' : 'text-muted hover:text-text')
                }
              >
                <span className="block">{tab.label}</span>
                {/* Unterstrich statt Farbfläche — er zeigt die Auswahl auch
                    dann, wenn Farben schlecht unterscheidbar sind. */}
                <span
                  aria-hidden="true"
                  className={
                    'block h-0.5 mt-1 mx-auto w-8 rounded-full ' +
                    (current ? 'bg-primary' : 'bg-transparent')
                  }
                />
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
