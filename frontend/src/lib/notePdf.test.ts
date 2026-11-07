import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { Interaction, Task } from '../api/types'
import { buildNotePdf, notePdfFileName } from './notePdf'

const note = {
  id: 7,
  initiative_id: 1,
  initiative: { id: 1, name: 'IC case study', color: null },
  raw_text: 'Met Priya at the office. She liked the demo but thinks ₹4,999/month is steep for small teams. 🙂 '.repeat(60),
  date: '2026-11-02',
  location: 'Bandra office',
  summary: '- Priya liked the demo\n- Thinks ₹4,999/month is steep for small teams\n- Wants a “starter” plan',
  topics: [],
  created_at: '',
  geo_lat: null,
  geo_lng: null,
  geo_address: null,
  maps_url: null,
  decisions: ['Offer a starter plan at ₹1,999'],
  concerns: ['Pricing may lose small teams'],
} as Interaction

const items = [
  { id: 1, interaction_id: 7, description: 'Send Priya the deck', due_date: '2026-11-06', due_time: '18:00', status: 'open', owner: 'me' },
  { id: 2, interaction_id: 7, description: 'Priya to share her team size', due_date: null, status: 'done', owner: 'them' },
] as Task[]

describe('note PDF', () => {
  it('names the file after the category and date', () => {
    expect(notePdfFileName(note)).toBe('ic-case-study-2026-11-02.pdf')
    expect(notePdfFileName({ ...note, initiative: null, date: null })).toBe('note-undated.pdf')
  })

  it('builds a multi-page PDF with the Unicode font', async () => {
    vi.stubGlobal('fetch', async (path: string) => {
      const buf = readFileSync(`public${path}`)
      return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }
    })
    const file = await buildNotePdf(note, items)
    const bytes = new Uint8Array(await file.arrayBuffer())
    expect(file.type).toBe('application/pdf')
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
    const raw = new TextDecoder('latin1').decode(bytes)
    expect(raw).toContain('/FontFile2') // Noto Sans embedded, not a built-in font that can't show ₹
    expect(raw).toMatch(/\/Type \/Pages[\s\S]*?\/Count 2/) // the long "What you said" runs onto page 2
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, bytes)
    vi.unstubAllGlobals()
  })
})
