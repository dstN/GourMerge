/**
 * Formats a recipe's ingredients as plain text for a shopping list.
 *
 * Plain text on purpose: the destinations are a clipboard and the OS share sheet, and
 * every notes app, messenger and mail client accepts text. Markdown or HTML would render
 * as literal syntax in most of them.
 *
 * Lines are prefixed with `- ` because Apple Notes, Google Keep and most editors convert
 * that into a real checklist or bullet on paste — which is the whole point of sending a
 * shopping list somewhere.
 */
export interface ShoppingListItem {
  /** Already formatted for the viewer: quantity + unit, in their measurement system. */
  amount?: string | null
  name: string
  notes?: string | null
}

export interface ShoppingListInput {
  title: string
  /** e.g. "4 Portionen" — omitted when the recipe does not say. */
  subtitle?: string | null
  items: ShoppingListItem[]
  /** Appended as provenance so a pasted list can be traced back. */
  sourceUrl?: string | null
}

/**
 * Returns `''` when there is nothing to list, so a caller can treat "empty" as "do not
 * offer the action" without a second emptiness check.
 */
export function buildShoppingList(input: ShoppingListInput): string {
  const items = input.items.filter((i) => i.name.trim() !== '')
  if (items.length === 0) return ''

  const lines: string[] = [input.title.trim()]
  if (input.subtitle?.trim()) lines.push(input.subtitle.trim())
  lines.push('')

  for (const item of items) {
    // An ingredient with no quantity is legitimate ("Salz, nach Geschmack"), so the
    // amount is omitted rather than rendered as a stray separator.
    const amount = item.amount?.trim()
    const notes = item.notes?.trim()
    lines.push(`- ${[amount, item.name.trim()].filter(Boolean).join(' ')}${notes ? ` (${notes})` : ''}`)
  }

  if (input.sourceUrl?.trim()) {
    lines.push('', input.sourceUrl.trim())
  }

  return lines.join('\n')
}
