import { useContext } from 'react'
import { ToastContext } from '../state/toastContext'

export function useToast() {
  const v = useContext(ToastContext)
  if (!v) throw new Error('ToastProvider missing')
  return v
}
