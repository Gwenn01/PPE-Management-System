import Modal from './Modal'
export default function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', destructive = false, busy = false, onConfirm, onClose }: { open: boolean; title: string; message: string; confirmLabel?: string; destructive?: boolean; busy?: boolean; onConfirm: () => void | Promise<void>; onClose: () => void }) {
  return <Modal open={open} title={title} onClose={onClose} footer={<><button type="button" disabled={busy} onClick={onClose} className="ui-button-secondary">Cancel</button><button type="button" disabled={busy} onClick={() => { void onConfirm() }} className={`ui-button ${destructive ? 'bg-red-700 hover:bg-red-800' : ''}`}>{busy ? 'Working…' : confirmLabel}</button></>}><p>{message}</p></Modal>
}
