import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
/** Blob URLs are local browser-only previews; metadata-only seeds are not downloadable. */
export default function DocumentPreview({ file, fileName, mimeType }: { file?: Blob | null; fileName: string; mimeType: string }) {
  const [preview, setPreview] = useState<{ file: Blob; url: string } | null>(null)
  const url = preview?.file === file ? preview?.url : null
  useEffect(() => { if (!file) return; let active = true; const link = URL.createObjectURL(file); void Promise.resolve().then(() => { if (active) setPreview({ file, url: link }) }); return () => { active = false; URL.revokeObjectURL(link) } }, [file])
  if (!file || !url) return <div role="status" className="ui-panel bg-mist p-5 text-sm text-charcoal"><FileText aria-hidden className="mb-2 text-navy" />{fileName}: File preview unavailable. Only document details may be stored in this browser.</div>
  return <section className="min-w-0 space-y-3"><p className="break-all text-sm font-semibold text-navy">{fileName}</p>{mimeType === 'application/pdf' ? <iframe title={`Preview of ${fileName}`} src={url} className="h-[min(24rem,55dvh)] w-full rounded-xl border border-line bg-mist" /> : mimeType.startsWith('image/') ? <img src={url} alt={`Preview of ${fileName}`} className="max-h-80 w-full rounded-xl bg-mist object-contain" /> : <p className="text-sm text-charcoal">Text preview: use the local download to inspect file contents.</p>}<a href={url} download={fileName} className="ui-button">Download local file</a></section>
}
