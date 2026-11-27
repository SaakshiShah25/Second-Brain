// How Notes, To-dos and Lists look on a laptop, where they are three columns side by side: each is the same panel -
// one header bar of one height (title on the left; pencil, then + , on the right, so the + is always in the corner),
// a body underneath, and the same centred empty message. A phone shows them one at a time and none of this applies.

export const COLUMN = 'mb-6 lg:mb-0 lg:flex lg:h-full lg:min-h-[16rem] lg:flex-col lg:rounded-2xl lg:border lg:border-border lg:bg-bg-card'

export const COLUMN_BODY = 'lg:flex lg:flex-1 lg:flex-col lg:p-2'

// A card inside a panel drops its own outline: the panel is the card.
export const COLUMN_FLAT = 'lg:rounded-none lg:border-0 lg:bg-transparent'

export const COLUMN_EMPTY = 'px-1 text-[0.875rem] text-text-faint lg:flex lg:flex-1 lg:items-center lg:justify-center lg:px-6 lg:py-8 lg:text-center'
