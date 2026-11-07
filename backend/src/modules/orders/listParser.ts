/**
 * Turns a free-text shopping list ("2 kilo chini, 1 litre tel aur Maggi")
 * into catalogue suggestions. It is deliberately simple and deterministic:
 * digits/known Hindi numbers + common units + name/alias matching.
 * Suggestions only — the owner confirms the final bill.
 */

export type MatchableProduct = {
  id: string
  name: string
  unit: string
  pricePaise: number
  aliases: string[]
  searchName: string
  isAvailable: boolean
}

export type ParsedLine = {
  raw: string
  name: string
  quantity: number
  quantityText: string | null
}

export type ListSuggestion = {
  raw: string
  productId: string
  name: string
  unit: string
  pricePaise: number
  quantity: number
  quantityText: string | null
  confidence: 'high' | 'medium' | 'low'
}

export type ParsedList = {
  rawText: string
  items: ListSuggestion[]
  unmatched: ParsedLine[]
}

const NUMBER_WORDS: Record<string, number> = {
  ek: 1,
  do: 2,
  teen: 3,
  char: 4,
  chaar: 4,
  paanch: 5,
  panch: 5,
  chhe: 6,
  che: 6,
  saat: 7,
  aath: 8,
  nau: 9,
  das: 10,
  aadha: 0.5,
  adha: 0.5,
  dedh: 1.5,
  dhai: 2.5,
  half: 0.5,
  one: 1,
  two: 2,
  three: 3,
}

const UNIT_WORDS: Record<string, string> = {
  kg: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogram: 'kg',
  g: 'g',
  gm: 'g',
  gram: 'g',
  grams: 'g',
  l: 'L',
  ltr: 'L',
  litre: 'L',
  liter: 'L',
  ml: 'ml',
  packet: 'packet',
  pack: 'packet',
  pkt: 'packet',
  dozen: 'dozen',
  piece: 'piece',
  pieces: 'piece',
  pcs: 'piece',
  nag: 'piece',
}

const SPLIT_PATTERN = /[\n,;]+|\s+(?:aur|and)\s+|\s*\+\s*/i
const CLEAN_PREFIX = /^(?:mujhe|muje|please|pls|kripya|bhai)\s+/
const CLEAN_SUFFIX = /\s+(?:chahiye|chaiye|de dena|dedena|dena|de do|dedo)$/

function numberFrom(token: string | undefined): number | null {
  if (!token) return null
  if (/^\d+(?:\.\d+)?$/.test(token)) return Number(token)
  return NUMBER_WORDS[token] ?? null
}

function cleanLine(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(CLEAN_PREFIX, '')
    .replace(CLEAN_SUFFIX, '')
    .trim()
}

function parseLine(raw: string): ParsedLine | null {
  const tokens = raw.split(' ')
  let quantity: number | null = null
  let unit: string | null = null
  let nameTokens = tokens

  const first = numberFrom(tokens[0])
  if (first !== null && tokens.length > 1) {
    quantity = first
    const nextToken = tokens[1]
    const nextUnit = nextToken ? UNIT_WORDS[nextToken] : undefined
    if (nextUnit) {
      unit = nextUnit
      nameTokens = tokens.slice(2)
    } else {
      nameTokens = tokens.slice(1)
    }
  } else {
    const lastToken = tokens[tokens.length - 1]
    const lastUnit = lastToken ? UNIT_WORDS[lastToken] : undefined
    const beforeUnit = numberFrom(tokens[tokens.length - 2])

    if (lastUnit && beforeUnit !== null) {
      quantity = beforeUnit
      unit = lastUnit
      nameTokens = tokens.slice(0, -2)
    } else {
      const lastNumber = numberFrom(tokens[tokens.length - 1])
      if (lastNumber !== null && tokens.length > 1) {
        quantity = lastNumber
        nameTokens = tokens.slice(0, -1)
      }
    }
  }

  const name = nameTokens.join(' ').trim()
  if (!name) return null

  const resolvedQuantity = quantity ?? 1

  return {
    raw,
    name,
    quantity: resolvedQuantity,
    quantityText: unit ? `${resolvedQuantity} ${unit}` : null,
  }
}

function scoreProduct(product: MatchableProduct, name: string): number | null {
  const candidate = name.toLowerCase()
  const names = [product.name.toLowerCase(), ...product.aliases.map((alias) => alias.toLowerCase())]

  if (names.includes(candidate)) return 0
  if (names.some((value) => value.startsWith(candidate) || candidate.startsWith(value))) return 1

  const tokens = candidate.split(' ').filter((token) => token.length > 1)
  if (!tokens.length) return null

  const searchWords = product.searchName.split(' ')
  const hits = tokens.filter((token) => searchWords.some((word) => word.startsWith(token))).length
  if (hits === tokens.length) return 2
  if (hits > 0) return 3
  return null
}

function confidence(score: number): ListSuggestion['confidence'] {
  if (score <= 1) return 'high'
  if (score === 2) return 'medium'
  return 'low'
}

export function parseList(rawText: string, products: MatchableProduct[]): ParsedList {
  const items: ListSuggestion[] = []
  const unmatched: ParsedLine[] = []

  for (const part of rawText.split(SPLIT_PATTERN)) {
    const raw = part.trim()
    if (!raw) continue

    const line = parseLine(cleanLine(raw))
    if (!line) continue

    let bestProduct: MatchableProduct | null = null
    let bestScore = Number.POSITIVE_INFINITY

    for (const product of products) {
      const score = scoreProduct(product, line.name)
      if (score === null) continue
      if (score < bestScore || (score === bestScore && product.isAvailable && !bestProduct?.isAvailable)) {
        bestProduct = product
        bestScore = score
      }
    }

    if (!bestProduct) {
      unmatched.push(line)
      continue
    }

    items.push({
      raw: line.raw,
      productId: bestProduct.id,
      name: bestProduct.name,
      unit: bestProduct.unit,
      pricePaise: bestProduct.pricePaise,
      quantity: line.quantity,
      quantityText: line.quantityText,
      confidence: confidence(bestScore),
    })
  }

  return { rawText, items, unmatched }
}
