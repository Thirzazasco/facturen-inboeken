export type FactuurStatus =
  | 'ontvangen'
  | 'te_controleren'
  | 'goedgekeurd'
  | 'in_bc'
  | 'geboekt'
  | 'afgewezen'
  | 'geen_factuur'

export const STATUS_LABEL: Record<FactuurStatus, string> = {
  ontvangen: 'Ontvangen',
  te_controleren: 'Te controleren',
  goedgekeurd: 'Goedgekeurd',
  in_bc: 'In BC',
  geboekt: 'Geboekt',
  afgewezen: 'Afgewezen',
  geen_factuur: 'Geen factuur',
}

export const STATUSSEN = Object.keys(STATUS_LABEL) as FactuurStatus[]

export type Rol = 'crediteuren' | 'lezen'

export interface Factuur {
  id: string
  document_id: string | null
  status: FactuurStatus
  bc_bedrijf: string | null
  leverancier_naam: string | null
  leverancier_btw: string | null
  leverancier_kvk: string | null
  leverancier_iban: string | null
  factuurnummer: string | null
  factuurdatum: string | null
  vervaldatum: string | null
  valuta: string | null
  is_creditnota: boolean
  totaal_excl: number | null
  totaal_btw: number | null
  totaal_incl: number | null
  zekerheid: number | null
  uitgelezen_met: string | null
  bc_crediteur_nr: string | null
  bc_document_nr: string | null
  bc_fout: string | null
  beoordeeld_door: string | null
  beoordeeld_op: string | null
  afwijsreden: string | null
  aangemaakt_op: string
  bijgewerkt_op: string
}

export interface Factuurregel {
  id: string
  factuur_id: string
  regelnr: number | null
  omschrijving: string | null
  aantal: number | null
  prijs: number | null
  bedrag_excl: number | null
  btw_pct: number | null
  grootboekrekening: string | null
  kostenplaats: string | null
  bron_codering: 'ai' | 'historie' | 'mens' | null
}

export interface Controle {
  id: string
  factuur_id: string
  naam: string
  ok: boolean
  detail: string | null
}

export interface Crediteur {
  bc_bedrijf: string
  bc_nr: string
  naam: string | null
  btw_nummer: string | null
  kvk: string | null
  iban: string | null
}

export interface Document {
  id: string
  bestandsnaam: string | null
  type: string | null
  storage_pad: string | null
}
