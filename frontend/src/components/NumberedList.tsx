import { splitList } from '../lib/list'
export default function NumberedList({ text, className }: { text: string; className?: string }) {
  const items = splitList(text)
  if (items.length === 0) return null
  return (
    <ol className={className} style={{ margin: 0, paddingLeft: 20 }}>
      {items.map((it, i) => (
        <li key={i} style={{ marginBottom: 4 }}>{it}</li>
      ))}
    </ol>
  )
}
