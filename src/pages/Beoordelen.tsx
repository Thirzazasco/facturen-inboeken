import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BUCKET, db, supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { STATUS_LABEL, type Controle, type Crediteur, type Document, type Factuur, type Factuurregel } from '../lib/types'
import { bedrag, datum } from '../lib/format'

const KOPVELDEN: { key: keyof Factuur; label: string; type?: string }[] = [
  { key: 'leverancier_naam', label: 'Leverancier' },
  { key: 'factuurnummer', label: 'Factuurnummer' },
  { key: 'factuurdatum', label: 'Factuurdatum', type: 'date' },
  { key: 'vervaldatum', label: 'Vervaldatum', type: 'date' },
  { key: 'leverancier_btw', label: 'Btw-nummer' },
  { key: 'leverancier_kvk', label: 'KvK' },
  { key: 'leverancier_iban', label: 'IBAN' },
  { key: 'valuta', label: 'Valuta' },
  { key: 'totaal_excl', label: 'Totaal excl.', type: 'number' },
  { key: 'totaal_btw', label: 'Btw', type: 'number' },
  { key: 'totaal_incl', label: 'Totaal incl.', type: 'number' },
]

export default function Beoordelen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { magWijzigen } = useAuth()

  const [factuur, setFactuur] = useState<Factuur | null>(null)
  const [regels, setRegels] = useState<Factuurregel[]>([])
  const [controles, setControles] = useState<Controle[]>([])
  const [crediteuren, setCrediteuren] = useState<Crediteur[]>([])
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  const [gewijzigd, setGewijzigd] = useState(false)

  const laad = useCallback(async () => {
    if (!id) return
    const { data: f, error } = await db().from('facturen').select('*').eq('id', id).single()
    if (error) return setFout(error.message)
    setFactuur(f as Factuur)
    setGewijzigd(false)

    const [r, c] = await Promise.all([
      db().from('factuurregels').select('*').eq('factuur_id', id).order('regelnr'),
      db().from('controles').select('*').eq('factuur_id', id).order('naam'),
    ])
    setRegels((r.data as Factuurregel[]) ?? [])
    setControles((c.data as Controle[]) ?? [])

    if (f.bc_bedrijf) {
      const { data: cr } = await db()
        .from('crediteuren')
        .select('bc_bedrijf, bc_nr, naam, btw_nummer, kvk, iban')
        .eq('bc_bedrijf', f.bc_bedrijf)
        .order('naam')
      setCrediteuren((cr as Crediteur[]) ?? [])
    }

    if (f.document_id) {
      const { data: d } = await db().from('documenten').select('*').eq('id', f.document_id).single()
      const doc = d as Document | null
      if (doc?.storage_pad) {
        const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_pad, 60 * 30)
        setPdfUrl(s?.signedUrl ?? null)
      }
    }
  }, [id])

  useEffect(() => {
    laad()
  }, [laad])

  if (fout && !factuur) return <p className="fout">{fout}</p>
  if (!factuur) return <p className="stil">Laden…</p>

  const bewerkbaar = magWijzigen && factuur.status === 'te_controleren'
  const regelSom = regels.reduce((s, r) => s + (Number(r.bedrag_excl) || 0), 0)
  const verschil = factuur.totaal_excl != null ? Math.round((regelSom - Number(factuur.totaal_excl)) * 100) / 100 : null
  const crediteur = crediteuren.find((c) => c.bc_nr === factuur.bc_crediteur_nr)
  const ibanAfwijkend =
    crediteur?.iban && factuur.leverancier_iban &&
    crediteur.iban.replace(/\s/g, '') !== factuur.leverancier_iban.replace(/\s/g, '')

  function zetVeld(key: keyof Factuur, waarde: string) {
    setFactuur((f) => (f ? { ...f, [key]: waarde === '' ? null : waarde } : f))
    setGewijzigd(true)
  }

  function zetRegel(rid: string, key: keyof Factuurregel, waarde: string) {
    setRegels((rs) => rs.map((r) => (r.id === rid ? { ...r, [key]: waarde === '' ? null : waarde, bron_codering: 'mens' } : r)))
    setGewijzigd(true)
  }

  async function opslaan() {
    if (!factuur) return false
    setBezig(true)
    setFout(null)
    const { id: fid, ...rest } = factuur
    const velden = Object.fromEntries(
      [...KOPVELDEN.map((k) => k.key), 'bc_crediteur_nr'].map((k) => [k, rest[k as keyof typeof rest]]),
    )
    const { error } = await db().from('facturen').update(velden).eq('id', fid)
    if (error) {
      setFout(error.message)
      setBezig(false)
      return false
    }
    for (const r of regels) {
      const { id: rid, ...regel } = r
      const { error: e } = await db().from('factuurregels').update(regel).eq('id', rid)
      if (e) {
        setFout(e.message)
        setBezig(false)
        return false
      }
    }
    setBezig(false)
    setGewijzigd(false)
    return true
  }

  async function zetStatus(status: 'goedgekeurd' | 'afgewezen' | 'geen_factuur', afwijsreden?: string) {
    if (gewijzigd && !(await opslaan())) return
    setBezig(true)
    const { error } = await db()
      .from('facturen')
      .update({ status, afwijsreden: afwijsreden ?? null })
      .eq('id', factuur!.id)
    setBezig(false)
    if (error) return setFout(error.message)
    navigate('/')
  }

  function afwijzen() {
    const reden = window.prompt('Reden van afwijzen')
    if (reden && reden.trim()) zetStatus('afgewezen', reden.trim())
  }

  async function terugNaarControle() {
    setBezig(true)
    const { error } = await db().from('facturen').update({ status: 'te_controleren' }).eq('id', factuur!.id)
    setBezig(false)
    if (error) return setFout(error.message)
    laad()
  }

  return (
    <div className="beoordelen">
      <div className="pdf">
        {pdfUrl ? <iframe src={pdfUrl} title="Factuur" /> : <p className="stil">Geen PDF beschikbaar.</p>}
      </div>

      <div className="velden">
        <p>
          <Link to="/">← Terug</Link>
        </p>
        <h2>
          {factuur.leverancier_naam ?? '(onbekend)'} <span className="label">{STATUS_LABEL[factuur.status]}</span>
          {factuur.is_creditnota && <span className="label rood">creditnota</span>}
        </h2>
        <p className="stil">
          {factuur.bc_bedrijf ?? 'Geen BC-bedrijf'} · uitgelezen met {factuur.uitgelezen_met ?? '–'}
          {factuur.zekerheid != null && ` · zekerheid ${Math.round(Number(factuur.zekerheid) * 100)}%`}
        </p>
        {factuur.bc_fout && <p className="fout">BC: {factuur.bc_fout}</p>}
        {factuur.afwijsreden && <p className="fout">Afgewezen: {factuur.afwijsreden}</p>}
        {fout && <p className="fout">{fout}</p>}

        <h3>Controles</h3>
        <ul className="controles">
          {controles.length === 0 && <li className="stil">Nog geen controles.</li>}
          {controles.map((c) => (
            <li key={c.id}>
              <span className={`stip ${c.ok ? 'groen' : 'rood'}`} /> {c.naam}
              {c.detail && <span className="stil"> – {c.detail}</span>}
            </li>
          ))}
          {ibanAfwijkend && (
            <li>
              <span className="stip rood" /> <strong>IBAN wijkt af van BC ({crediteur?.iban}). Handmatig controleren!</strong>
            </li>
          )}
        </ul>

        <h3>Crediteur in BC</h3>
        <select
          disabled={!bewerkbaar}
          value={factuur.bc_crediteur_nr ?? ''}
          onChange={(e) => zetVeld('bc_crediteur_nr', e.target.value)}
        >
          <option value="">– nieuwe leverancier / kies –</option>
          {crediteuren.map((c) => (
            <option key={c.bc_nr} value={c.bc_nr}>
              {c.bc_nr} – {c.naam}
            </option>
          ))}
        </select>

        <h3>Factuur</h3>
        <div className="raster">
          {KOPVELDEN.map((v) => (
            <label key={v.key}>
              {v.label}
              <input
                type={v.type ?? 'text'}
                step={v.type === 'number' ? '0.01' : undefined}
                disabled={!bewerkbaar}
                value={(factuur[v.key] as string | number | null) ?? ''}
                onChange={(e) => zetVeld(v.key, e.target.value)}
              />
            </label>
          ))}
        </div>

        <h3>Regels</h3>
        <table className="regels">
          <thead>
            <tr>
              <th>Omschrijving</th>
              <th className="getal">Bedrag excl.</th>
              <th className="getal">Btw %</th>
              <th>Grootboek</th>
              <th>Kostenplaats</th>
              <th>Bron</th>
            </tr>
          </thead>
          <tbody>
            {regels.map((r) => (
              <tr key={r.id}>
                <td>
                  <input disabled={!bewerkbaar} value={r.omschrijving ?? ''} onChange={(e) => zetRegel(r.id, 'omschrijving', e.target.value)} />
                </td>
                <td>
                  <input className="getal" type="number" step="0.01" disabled={!bewerkbaar} value={r.bedrag_excl ?? ''} onChange={(e) => zetRegel(r.id, 'bedrag_excl', e.target.value)} />
                </td>
                <td>
                  <input className="getal" type="number" step="0.01" disabled={!bewerkbaar} value={r.btw_pct ?? ''} onChange={(e) => zetRegel(r.id, 'btw_pct', e.target.value)} />
                </td>
                <td>
                  <input disabled={!bewerkbaar} value={r.grootboekrekening ?? ''} onChange={(e) => zetRegel(r.id, 'grootboekrekening', e.target.value)} />
                </td>
                <td>
                  <input disabled={!bewerkbaar} value={r.kostenplaats ?? ''} onChange={(e) => zetRegel(r.id, 'kostenplaats', e.target.value)} />
                </td>
                <td className="stil">{r.bron_codering ?? '–'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Som regels</td>
              <td className="getal">{bedrag(regelSom)}</td>
              <td colSpan={4} className={verschil ? 'fout' : 'stil'}>
                {verschil == null ? '' : verschil === 0 ? 'sluit aan op totaal' : `verschil ${bedrag(verschil)}`}
              </td>
            </tr>
          </tfoot>
        </table>

        {factuur.beoordeeld_op && <p className="stil">Beoordeeld op {datum(factuur.beoordeeld_op)}</p>}
        {factuur.bc_document_nr && <p>BC-document: {factuur.bc_document_nr}</p>}

        {magWijzigen && (
          <div className="knoppen">
            {bewerkbaar ? (
              <>
                <button className="primair" disabled={bezig || !factuur.bc_crediteur_nr} onClick={() => zetStatus('goedgekeurd')}>
                  Goedkeuren en naar BC
                </button>
                <button disabled={bezig || !gewijzigd} onClick={opslaan}>Opslaan</button>
                <button disabled={bezig} onClick={afwijzen}>Afwijzen</button>
                <button disabled={bezig} onClick={() => zetStatus('geen_factuur')}>Geen factuur</button>
              </>
            ) : (
              (factuur.status === 'afgewezen' || factuur.status === 'geen_factuur') && (
                <button disabled={bezig} onClick={terugNaarControle}>Terug naar te controleren</button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  )
}
