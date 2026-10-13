import { PR_LABEL, type PRKind } from '../gym/stats'

export function PRBadges({ kinds }: { kinds: PRKind[] }) {
  return (
    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
      {kinds.map((k) => (
        <span key={k} className="inline-flex items-center gap-1 rounded-md bg-done/15 px-1.5 py-[1px] text-[10px] font-bold tracking-wider text-[#4ade80]">
          <TrophyIcon />
          {PR_LABEL[k]}
        </span>
      ))}
    </span>
  )
}

export function TrophyIcon({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 3h12v2h3v3a5 5 0 0 1-4.6 5A6 6 0 0 1 13 16.9V19h4v2H7v-2h4v-2.1A6 6 0 0 1 7.6 13 5 5 0 0 1 3 8V5h3V3zm0 4H5v1a3 3 0 0 0 1.2 2.4A6 6 0 0 1 6 9V7zm12 0v2c0 .5 0 1-.2 1.4A3 3 0 0 0 19 8V7h-1z" />
    </svg>
  )
}
