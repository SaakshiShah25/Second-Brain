// Input too short to be a note or a question - "Hi", "Hello", "ok", "thanks",
// "test", a lone letter, an emoji. Catching it here lets the app answer at
// once, with no round trip and no AI call, and keeps junk like "ok" from ever
// being saved as a note. This is the same rule as text_utils.short_input_kind
// on the server (which guards every other way in) - keep the two in step.

const GREETINGS = new Set(['hi', 'hii', 'hey', 'heyy', 'hello', 'hola', 'yo', 'sup', 'namaste', 'hiya', 'howdy'])
const THANKS = new Set(['thanks', 'thank', 'thankyou', 'thx', 'ty'])
const TIME_OF_DAY = new Set(['morning', 'afternoon', 'evening', 'night'])
const FILLER = new Set([
  'ok', 'okay', 'k', 'kk', 'yes', 'yep', 'yeah', 'no', 'nope', 'nah', 'hmm', 'hm', 'uh', 'um',
  'test', 'testing', 'thanks', 'thank', 'thankyou', 'thx', 'ty', 'bye', 'goodbye', 'cool', 'nice',
  'good', 'great', 'lol', 'haha', 'sure', 'fine', 'right', 'alright', 'ping',
  // words that only pad a greeting or thanks ("good morning", "thank you so much", "hi there")
  'morning', 'afternoon', 'evening', 'night', 'there', 'you', 'so', 'much', 'very', 'a', 'lot',
  'all', 'again', 'bro', 'dear', 'buddy', 'everyone', 'team',
  ...GREETINGS,
])

export type ShortInputKind = 'greeting' | 'thanks' | 'short'

/** null when `text` is long enough to treat as a note or a question. */
export function shortInputKind(text: string): ShortInputKind | null {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) as string[] // letters/digits, any language
  if (words.length === 0) return 'short' // empty, punctuation, emoji
  if (words.every((w) => FILLER.has(w))) {
    if (words.some((w) => THANKS.has(w))) return 'thanks'
    if (GREETINGS.has(words[0]) || (words[0] === 'good' && words.length > 1 && TIME_OF_DAY.has(words[1]))) {
      return 'greeting'
    }
    return 'short'
  }
  if (words.length === 1 && words[0].length < 3) return 'short' // a lone letter or two
  return null
}

const EXAMPLES =
  '- **Log a note:** "Met Priya today, she wants a revised quote by Friday"\n' +
  '- **Ask about someone:** "What did Priya say about pricing?"\n' +
  '- **Add a task:** "Send Arjun the proposal by Friday"'

/** What to say instead of sending it: the reply, and whether it is a
 * friendly answer (greeting/thanks - shown as a normal message, and the text
 * is cleared) or a nudge to write more (shown as a notice, and the text stays
 * in the box to be extended). */
export function shortInputReply(kind: ShortInputKind): { message: string; friendly: boolean } {
  if (kind === 'greeting') {
    return {
      friendly: true,
      message: `Hi! I'm ready when you are - tell me about a conversation, or ask about someone you've met. For example:\n\n${EXAMPLES}`,
    }
  }
  if (kind === 'thanks') {
    return {
      friendly: true,
      message: "You're welcome! Tell me about a conversation, or ask about someone you've met, whenever you're ready.",
    }
  }
  return {
    friendly: false,
    message: `That's a little too short for me to log or answer. Try a full sentence, for example:\n\n${EXAMPLES}`,
  }
}
