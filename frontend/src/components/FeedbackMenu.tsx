import { useState } from 'react'
import { Flag, Smile } from 'lucide-react'
import FeedbackSheet from './FeedbackSheet'
import { ListGroup, ListRow } from './ListGroup'
import ReportSheet from './ReportSheet'
import Sheet from './Sheet'

// One "Send feedback" entry instead of two look-alike rows: a rating is "how is it going overall?", a report is "this
// specific thing is wrong or missing" - the two are told apart here, in a line each.
export default function FeedbackMenu({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'menu' | 'rate' | 'report'>('menu')
  if (step === 'rate') return <FeedbackSheet onClose={onClose} />
  if (step === 'report') return <ReportSheet onClose={onClose} />
  return (
    <Sheet onClose={onClose} title="Send feedback">
      <div className="mt-3">
        <ListGroup>
          <ListRow icon={Smile} iconColor="var(--sb-text-muted)" soft label="Rate MyConfía" detail="How is it working for you overall?" chevron onClick={() => setStep('rate')} />
          <ListRow icon={Flag} iconColor="var(--sb-text-muted)" soft label="Report a problem" detail="Something is wrong, confusing or missing" chevron onClick={() => setStep('report')} />
        </ListGroup>
      </div>
    </Sheet>
  )
}
