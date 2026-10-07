import { ASK_EXAMPLES, LOG_EXAMPLES } from '../../lib/examples'

// Tap-to-fill sample prompts for the empty Chat screen: shows someone who
// has never used the app what a note and a question actually look like.
// Tapping one only puts the text in the input box - nothing is saved or
// sent until the user presses send themselves.
export default function ExamplePrompts({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="mt-5 flex w-full max-w-md flex-col gap-4 text-left">
      {[
        { label: 'Log a note', examples: LOG_EXAMPLES },
        { label: 'Ask a question', examples: ASK_EXAMPLES },
      ].map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-text-faint">{group.label}</p>
          <div className="flex flex-wrap gap-2">
            {group.examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => onPick(example)}
                className="rounded-full border border-border-strong bg-bg-card px-3 py-1.5 text-left text-sm text-text-muted transition-colors hover:border-accent hover:text-text"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
