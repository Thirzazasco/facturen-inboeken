import { useEffect, useState } from 'react'
import { db } from '../lib/supabase'
import { STATUSSEN, STATUS_LABEL, type FactuurStatus } from '../lib/types'

interface Rij {
  status: FactuurStatus
  aangemaakt_op: string
  beoordeeld_op: string | null
}

export default function Overzicht() {
  const [rijen, setRijen] = useState<Rij[]>([])
  const [ongewijzigd, setOngewijzigd] = useState<{ totaal: number; zonderWijziging: number } | null>(null)

  useEffect(() => {
    db()
      .from('facturen')
      .select('status, aangemaakt_op, beoordeeld_op')
      .then(({ data }) => setRijen((data as Rij[]) ?? []))

    // Goedgekeurde facturen waarvan geen regel door een mens is aangepast
    db()
      .from('facturen')
      .select('id, factuurregels(bron_codering)')
      .in('status', ['goedgekeurd', 'in_bc', 'geboekt'])
      .then(({ data }) => {
        const lijst = (data ?? []) as { factuurregels: { bron_codering: string | null }[] }[]
        setOngewijzigd({
          totaal: lijst.length,
          zonderWijziging: lijst.filter((f) => f.factuurregels.every((r) => r.bron_codering !== 'mens')).length,
        })
      })
  }, [])

  const perStatus = STATUSSEN.map((s) => ({ s, n: rijen.filter((r) => r.status === s).length }))
  const doorloop = rijen
    .filter((r) => r.beoordeeld_op)
    .map((r) => (new Date(r.beoordeeld_op!).getTime() - new Date(r.aangemaakt_op).getTime()) / 36e5)
  const gemUren = doorloop.length ? doorloop.reduce((a, b) => a + b, 0) / doorloop.length : null

  return (
    <div>
      <h2>Overzicht</h2>
      <div className="tegels">
        {perStatus.map(({ s, n }) => (
          <div key={s} className="tegel">
            <div className="stil">{STATUS_LABEL[s]}</div>
            <div className="groot">{n}</div>
          </div>
        ))}
      </div>
      <div className="tegels">
        <div className="tegel">
          <div className="stil">Gem. doorlooptijd tot beoordeling</div>
          <div className="groot">{gemUren == null ? '–' : gemUren < 48 ? `${gemUren.toFixed(1)} u` : `${(gemUren / 24).toFixed(1)} d`}</div>
        </div>
        <div className="tegel">
          <div className="stil">AI-uitlezing ongewijzigd goedgekeurd</div>
          <div className="groot">
            {ongewijzigd && ongewijzigd.totaal
              ? `${Math.round((ongewijzigd.zonderWijziging / ongewijzigd.totaal) * 100)}%`
              : '–'}
          </div>
          {ongewijzigd && <div className="stil">{ongewijzigd.zonderWijziging} van {ongewijzigd.totaal}</div>}
        </div>
      </div>
    </div>
  )
}
