import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
/** Blob URLs are local browser-only previews; metadata-only seeds are not downloadable. */
export default function DocumentPreview({ file, fileName, mimeType }: { file?: Blob | null; fileName: string; mimeType: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { if (!file) return; let active = true; const link = URL.createObjectURL(file); void Promise.resolve().then(() => { if (active) setUrl(link) }); return () => { active = false; URL.revokeObjectURL(link) } }, [file])
  if (!file || !url) return <div role="status" className="rounded-xl border border-line bg-mist p-5 text-sm text-charcoal"><FileText aria-hidden className="mb-2 text-navy" />{fileName}: File preview unavailable. This may be metadata-only demo data.</div>
  return <section className="space-y-3"><p className="break-all text-sm font-semibold text-navy">{fileName}</p>{mimeType === 'application/pdf' ? <iframe title={`Preview of ${fileName}`} src={url} className="h-80 w-full rounded-xl border border-line" /> : mimeType.startsWith('image/') ? <img src={url} alt={`Preview of ${fileName}`} className="max-h-80 rounded-xl object-contain" /> : <p className="text-sm text-charcoal">Text preview: use the local download to inspect file contents.</p>}<a href={url} download={fileName} className="inline-block rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy">Download local file</a></section>
}
