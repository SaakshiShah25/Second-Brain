import type { Interaction, Task } from '../api/types'
import { dueLabel, fullDate } from './dates'
import { notePoints } from './initiativeFilter'

// One note as a PDF, made on the device - the note never leaves it for this. jsPDF and the font
// are only fetched when someone actually exports. Noto Sans (public/fonts) instead of the PDF
// built-in fonts, which can't show ₹ or curly quotes. Emoji aren't in it, so they're dropped.

const PAGE = { w: 595.28, h: 841.89 } // A4 in points
const MARGIN = 56
const WIDTH = PAGE.w - MARGIN * 2
const INK = '#1c1917'
const MUTED = '#78716c'
const ACCENT = '#ea580c'

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu
const clean = (s: string | null | undefined) => (s ?? '').replace(EMOJI, '').replace(/[ \t]{2,}/g, ' ').replace(/ *\n */g, '\n').trim()

async function fontBase64(path: string): Promise<string> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Couldn't load the PDF font (${res.status})`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

export function notePdfFileName(note: Interaction): string {
  const slug = (note.initiative?.name ?? 'note').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${slug || 'note'}-${note.date ?? 'undated'}.pdf`
}

/** The note (plus the items that came from it) as a PDF file. */
export async function buildNotePdf(note: Interaction, items: Task[]): Promise<File> {
  const [{ jsPDF }, regular, bold] = await Promise.all([
    import('jspdf'),
    fontBase64('/fonts/NotoSans-Regular.ttf'),
    fontBase64('/fonts/NotoSans-Bold.ttf'),
  ])
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  doc.addFileToVFS('NotoSans-Regular.ttf', regular)
  doc.addFont('NotoSans-Regular.ttf', 'Noto', 'normal')
  doc.addFileToVFS('NotoSans-Bold.ttf', bold)
  doc.addFont('NotoSans-Bold.ttf', 'Noto', 'bold')

  let y = MARGIN
  const ensure = (height: number) => {
    if (y + height > PAGE.h - MARGIN) {
      doc.addPage()
      y = MARGIN
    }
  }
  const text = (s: string, opts: { size?: number; bold?: boolean; color?: string; indent?: number; gap?: number } = {}) => {
    const size = opts.size ?? 11
    const indent = opts.indent ?? 0
    doc.setFont('Noto', opts.bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    doc.setTextColor(opts.color ?? INK)
    const lineHeight = size * 1.45
    for (const line of doc.splitTextToSize(s, WIDTH - indent) as string[]) {
      ensure(lineHeight)
      doc.text(line, MARGIN + indent, y + size)
      y += lineHeight
    }
    y += opts.gap ?? 0
  }
  const heading = (s: string) => {
    ensure(40)
    y += 10
    text(s.toUpperCase(), { size: 9, bold: true, color: MUTED, gap: 4 })
  }
  const bullets = (lines: string[]) => {
    for (const line of lines.map(clean).filter(Boolean)) {
      ensure(16)
      doc.setFillColor(MUTED)
      doc.circle(MARGIN + 3, y + 8.5, 1.6, 'F')
      text(line, { indent: 14, gap: 2 })
    }
  }

  // Header: category and date, then where it happened.
  text(clean(note.initiative?.name) || 'Note', { size: 20, bold: true, gap: 2 })
  const place = clean(note.location) || clean(note.geo_address)
  text([fullDate(note.date), place].filter(Boolean).join('  ·  '), { size: 10.5, color: MUTED, gap: 10 })
  doc.setDrawColor(ACCENT)
  doc.setLineWidth(1.5)
  doc.line(MARGIN, y, MARGIN + 40, y)
  y += 14

  const points = notePoints(note.summary)
  if (points.length) {
    heading('Key points')
    bullets(points)
  }
  if (note.decisions?.length) {
    heading('Decisions')
    bullets(note.decisions)
  }
  if (note.concerns?.length) {
    heading('Concerns')
    bullets(note.concerns)
  }
  if (items.length) {
    heading('To-dos')
    for (const t of items) {
      ensure(18)
      doc.setDrawColor(MUTED)
      doc.setLineWidth(0.8)
      doc.rect(MARGIN, y + 3.5, 9, 9)
      if (t.status === 'done') {
        doc.setDrawColor(INK)
        doc.lines([[2.5, 3], [5, -6.5]], MARGIN + 1.8, y + 8.2)
      }
      const facts = [t.owner === 'them' ? 'waiting on them' : '', t.due_date ? `due ${dueLabel(t.due_date, t.due_time)}` : '']
        .filter(Boolean)
        .join(', ')
      text(clean(t.description) + (facts ? `  (${facts})` : ''), { indent: 16, gap: 2, color: t.status === 'done' ? MUTED : INK })
    }
  }
  if (clean(note.raw_text)) {
    heading('What you said')
    text(clean(note.raw_text), { size: 10.5, color: '#44403c' })
  }

  // Footer on every page.
  const pages = doc.getNumberOfPages()
  const exported = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('Noto', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(MUTED)
    doc.text(`Exported from MyConfía · ${exported}`, MARGIN, PAGE.h - 28)
    if (pages > 1) doc.text(`${i} / ${pages}`, PAGE.w - MARGIN, PAGE.h - 28, { align: 'right' })
  }

  return new File([doc.output('blob')], notePdfFileName(note), { type: 'application/pdf' })
}

/** Hands the PDF to the phone: the share sheet where there is one (save to Files, send on
 * WhatsApp, email), otherwise a plain download. */
export async function shareOrDownload(file: File): Promise<void> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name })
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return // closed the share sheet
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
