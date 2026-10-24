import { useDocumentThumbnail } from '../../api/documents'
import type { DocumentItem } from '../../api/types'
import { categoryStyle, fileKind } from '../../lib/documentCategories'
import GoogleIcon from '../google/GoogleIcon'

// A document's preview: the real (decrypted) thumbnail when there is one,
// otherwise a tinted tile with the category icon and a file-type badge.
export default function DocThumb({
  doc,
  className = '',
  iconSize = 28,
}: {
  doc: Pick<DocumentItem, 'id' | 'category' | 'mime_type' | 'file_name' | 'has_thumbnail'> & { source?: string }
  className?: string
  iconSize?: number
}) {
  const { data: url } = useDocumentThumbnail(doc.id, doc.has_thumbnail)
  const cat = categoryStyle(doc.category)
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{ backgroundColor: `${cat.color}14` }}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover object-top" draggable={false} />
      ) : (
        <cat.icon size={iconSize} strokeWidth={1.6} style={{ color: cat.color }} />
      )}
      <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wide text-white">
        {fileKind(doc.mime_type, doc.file_name)}
      </span>
      {doc.source === 'gdrive' && (
        <span className="absolute right-1.5 bottom-1.5 flex h-5 w-5 items-center justify-center rounded-md bg-white shadow-sm" title="From Google Drive">
          <GoogleIcon size={12} />
        </span>
      )}
    </div>
  )
}
