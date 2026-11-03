import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [wachtwoord, setWachtwoord] = useState('')
  const [melding, setMelding] = useState<string | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  async function metMicrosoft() {
    setFout(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { scopes: 'email', redirectTo: window.location.origin },
    })
    if (error) setFout(error.message)
  }

  async function metLink(e: FormEvent) {
    e.preventDefault()
    setFout(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
    })
    if (error) setFout(error.message)
    else setMelding('Check je mail voor de inloglink.')
  }

  async function inloggen(e: FormEvent) {
    e.preventDefault()
    setFout(null)
    setMelding(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password: wachtwoord })
    if (error) setFout(error.message)
  }

  async function registreren() {
    setFout(null)
    setMelding(null)
    if (!email || !wachtwoord) {
      setFout('Vul e-mailadres en wachtwoord in.')
      return
    }
    const { error } = await supabase.auth.signUp({ email, password: wachtwoord })
    if (error) setFout(error.message)
    else setMelding('Account aangemaakt. Check je mail als bevestiging nodig is, of log hierboven in.')
  }

  return (
    <div className="login">
      <h1>Facturen</h1>
      <p className="stil">Inloggen om facturen te beoordelen.</p>
      <form onSubmit={inloggen}>
        <label>
          E-mailadres
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Wachtwoord
          <input
            type="password"
            required
            value={wachtwoord}
            onChange={(e) => setWachtwoord(e.target.value)}
          />
        </label>
        <button className="primair breed" type="submit">
          Inloggen
        </button>
        <button className="breed" type="button" onClick={registreren}>
          Account aanmaken
        </button>
      </form>
      <div className="of">of</div>
      <button className="breed" onClick={metMicrosoft}>
        Inloggen met Microsoft
      </button>
      <div className="of">of</div>
      <form onSubmit={metLink}>
        <label>
          E-mailadres (voor inloglink)
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button className="breed" type="submit">
          Stuur inloglink
        </button>
      </form>
      {melding && <p className="ok">{melding}</p>}
      {fout && <p className="fout">{fout}</p>}
    </div>
  )
}
