import { useEffect, useRef, useState } from 'react'

interface Detector { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> }
type DetectorFactory = { new(options: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> }

/** Native optional camera support. No images or decoded codes leave the browser. */
export default function QRLookup({ onCode }: { onCode: (value: string) => void }) {
  const [code, setCode] = useState(''), [message, setMessage] = useState(''), [active, setActive] = useState(false)
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null), generation = useRef(0)
  const stop = () => { generation.current++; stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; if (video.current) video.current.srcObject = null; setActive(false) }
  useEffect(() => () => { generation.current++; stream.current?.getTracks().forEach(t => t.stop()) }, [])
  async function scan() {
    stop(); setMessage(''); const token = generation.current
    try {
      const NativeDetector = (globalThis as unknown as { BarcodeDetector?: DetectorFactory }).BarcodeDetector
      if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia || !NativeDetector || !(await NativeDetector.getSupportedFormats()).includes('qr_code')) throw new Error('Camera QR detection is unavailable here. Enter the property code manually.')
      const camera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      if (generation.current !== token) { camera.getTracks().forEach(t => t.stop()); return }
      stream.current = camera; setActive(true)
      const element = video.current!; element.srcObject = camera; await element.play()
      const detector = new NativeDetector({ formats: ['qr_code'] })
      const detect = async () => {
        if (generation.current !== token) return
        try {
          const codes = element.readyState >= 2 ? await detector.detect(element) : []
          if (generation.current !== token) return
          if (codes[0]?.rawValue) { const value = codes[0].rawValue; setCode(value); stop(); onCode(value); return }
          window.setTimeout(() => { void detect() }, 250)
        } catch { if (generation.current === token) { stop(); setMessage('Camera detection failed. Use manual property code entry.') } }
      }
      void detect()
    } catch (e) { if (generation.current === token) { stop(); setMessage(e instanceof Error ? e.message : 'Camera permission unavailable. Enter the property code manually.') } }
  }
  return <section className="space-y-3 rounded-xl border border-line p-4"><h3 className="font-bold text-navy">QR / Property Code Lookup</h3><p className="text-xs text-gray">Enter a property number, asset ID, or PPE:property-number code. Camera scanning is optional; manual entry always works.</p><form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); stop(); onCode(code) }}><label className="grow">Property code<input className="mt-1 w-full rounded-xl border border-line p-2" value={code} onChange={e => setCode(e.target.value)} maxLength={160} required /></label><button className="rounded-xl bg-navy px-4 text-white" type="submit">Locate asset</button></form><button type="button" className="text-navy underline" onClick={() => { if (active) stop(); else void scan() }}>{active ? 'Stop camera' : 'Scan QR with camera (if supported)'}</button><video className={active ? 'max-h-64 w-full rounded-xl' : 'hidden'} ref={video} playsInline muted aria-label="QR camera preview" />{message && <p role="status" className="text-sm">{message}</p>}</section>
}
