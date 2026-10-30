const euro = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' })

export function bedrag(n: number | null | undefined, valuta = 'EUR') {
  if (n == null) return '–'
  if (valuta && valuta !== 'EUR') {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: valuta }).format(n)
  }
  return euro.format(n)
}

export function datum(d: string | null | undefined) {
  if (!d) return '–'
  return new Date(d).toLocaleDateString('nl-NL')
}
