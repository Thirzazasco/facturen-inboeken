import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { db, supabase } from '../lib/supabase'
import type { Rol } from '../lib/types'

interface AuthState {
  session: Session | null
  rol: Rol | null
  laden: boolean
  magWijzigen: boolean
}

const AuthContext = createContext<AuthState>({ session: null, rol: null, laden: true, magWijzigen: false })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [rol, setRol] = useState<Rol | null>(null)
  const [laden, setLaden] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLaden(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setRol(null)
      return
    }
    setLaden(true)
    db()
      .from('gebruikers')
      .select('rol')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setRol((data?.rol as Rol) ?? null)
        setLaden(false)
      })
  }, [session])

  return (
    <AuthContext.Provider value={{ session, rol, laden, magWijzigen: rol === 'crediteuren' }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
