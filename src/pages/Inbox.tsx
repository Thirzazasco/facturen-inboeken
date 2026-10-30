import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { db } from '../lib/supabase'
import { STATUSSEN, STATUS_LABEL, type Factuur, type FactuurStatus } from '../lib/types'
import { bedrag, datum } from '../lib/format'

type Rij = Factuur & { controles: { ok: boolean }[] }

export default function Inbox() {
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') as FactuurStatus | 'alle') ?? 'te_controleren'
  const [zoek, setZoek] = useState('')
  const [rijen, setRijen] = useState<Rij[]>([])
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState<string | null>(null)

  useEffect(() => {
    setLaden(true)
    let q = db()
      .from('facturen')
      .select('*, controles(ok)')
      .order('aangemaakt_op', { ascending: false })
      .limit(500)
    if (status !== 'alle') q = q.eq('status', status)
    q.then(({ data, error }) => {
      setFout(error?.message ?? null)
      setRijen((data as Rij[]) ?? [])
      setLaden(false)
    })
  }, [status])

  const zichtbaar = useMemo(() => {
    const z = zoek.trim().toLowerCase()
    if (!z) return rijen
    return rijen.filter(
      (r) =>
        r.leverancier_naam?.toLowerCase().includes(z) ||
        r.factuurnummer?.toLowerCase().includes(z) ||
        r.bc_crediteur_nr?.toLowerCase().includes(z),
    )
  }, [rijen, zoek])

  return (
    <div>
      <div className="balk">
        <div className="tabs">
          {(['te_controleren', ...STATUSSEN.filter((s) => s !== 'te_controleren'), 'alle'] as const).map((s) => (
            <button
              key={s}
              className={s === status ? 'actief' : ''}
              onClick={() => setParams({ status: s })}
            >
              {s === 'alle' ? 'Alle' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <input placeholder="Zoek leverancier of factuurnummer" value={zoek} onChange={(e) => setZoek(e.target.value)} />
      </div>

      {fout && <p className="fout">{fout}</p>}
      {laden ? (
        <p className="stil">Laden…</p>
      ) : zichtbaar.length === 0 ? (
        <p className="stil">Geen facturen.</p>
      ) : (
        <table className="lijst">
          <thead>
            <tr>
              <th></th>
              <th>Leverancier</th>
              <th>Factuurnr.</th>
              <th>Bedrijf</th>
              <th>Datum</th>
              <th>Vervalt</th>
              <th className="getal">Bedrag incl.</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {zichtbaar.map((f) => {
              const fouten = f.controles.filter((c) => !c.ok).length
              return (
                <tr key={f.id}>
                  <td>
                    <span
                      className={`stip ${f.controles.length === 0 ? 'grijs' : fouten ? 'rood' : 'groen'}`}
                      title={fouten ? `${fouten} controle(s) niet ok` : 'Controles ok'}
                    />
                  </td>
                  <td>
                    <Link to={`/factuur/${f.id}`}>{f.leverancier_naam ?? '(onbekend)'}</Link>
                    {!f.bc_crediteur_nr && f.status === 'te_controleren' && <span className="label">nieuwe leverancier</span>}
                  </td>
                  <td>{f.factuurnummer ?? '–'}</td>
                  <td>{f.bc_bedrijf ?? '–'}</td>
                  <td>{datum(f.factuurdatum)}</td>
                  <td>{datum(f.vervaldatum)}</td>
                  <td className="getal">{bedrag(f.totaal_incl, f.valuta ?? 'EUR')}</td>
                  <td>{STATUS_LABEL[f.status]}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
