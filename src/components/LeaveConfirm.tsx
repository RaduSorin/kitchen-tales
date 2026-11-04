import Sheet from './Sheet'
import { leaveAnyway, stayHere, usePendingLeave } from '../lib/leaveGuard'

/** The sheet that asks before leaving a screen with unsaved work (see lib/leaveGuard). */
export default function LeaveConfirm() {
  const g = usePendingLeave()
  if (!g) return null
  return (
    <Sheet title={g.title} onClose={stayHere}>
      <div className="leave-confirm" data-leave-ok>
        <p>{g.text}</p>
        <button type="button" className="moon-btn" autoFocus onClick={stayHere}>{g.stay}</button>
        <button type="button" className="btn danger" onClick={leaveAnyway}>{g.leave}</button>
      </div>
    </Sheet>
  )
}
