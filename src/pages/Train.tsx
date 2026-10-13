import { DumbbellIcon, NodesIcon } from '../components/icons'
import { Page, PhaseTag } from '../components/ui'

export function Train() {
  return (
    <Page title="Train">
      <button
        disabled
        className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-accent text-base font-bold text-white disabled:opacity-40"
      >
        Start an empty workout
      </button>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-3 rounded-[20px] bg-surface p-4">
          <DumbbellIcon className="text-gym" />
          <div>
            <p className="font-bold">Gym workout</p>
            <p className="mt-1 text-xs text-faint">From a template or empty</p>
          </div>
          <PhaseTag phase={2} />
        </div>
        <div className="flex flex-col gap-3 rounded-[20px] bg-surface p-4">
          <NodesIcon className="text-bjj" />
          <div>
            <p className="font-bold">Log BJJ</p>
            <p className="mt-1 text-xs text-faint">Session summary</p>
          </div>
          <PhaseTag phase={5} />
        </div>
      </div>

      <h2 className="mt-2 text-[22px] font-extrabold">Templates</h2>
      <p className="text-sm text-faint">Your routines appear here, imported from Strong or created in the app.</p>
    </Page>
  )
}
