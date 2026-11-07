/** Formats integer paise as rupees for bills, WhatsApp text and audit notes. */
export function rupees(paise: number) {
  const value = paise / 100
  return Number.isInteger(value) ? `₹${value}` : `₹${value.toFixed(2)}`
}
