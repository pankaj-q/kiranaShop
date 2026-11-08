import { createContext } from 'react'

export type ToastFn = (message: string, kind?: 'info' | 'error') => void
export const ToastContext = createContext<{ show: ToastFn } | null>(null)
