import { api } from './api'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch {
    return null
  }
}

export async function enablePush() {
  if (!('Notification' in window) || !('PushManager' in window)) return { enabled: false, reason: 'unsupported' }

  const cfg = await api<{ enabled: boolean; publicKey: string | null }>('/push/public-key').catch(() => ({ enabled: false, publicKey: null }))
  if (!cfg.enabled || !cfg.publicKey) return { enabled: false, reason: 'disabled' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { enabled: false, reason: 'denied' }

  const reg = await registerServiceWorker()
  if (!reg) return { enabled: false, reason: 'no-sw' }

  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(cfg.publicKey),
    })
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
    await api('/push/subscribe', { method: 'POST', body: JSON.stringify(json) })
    return { enabled: true }
  } catch {
    return { enabled: false, reason: 'subscribe-failed' }
  }
}
