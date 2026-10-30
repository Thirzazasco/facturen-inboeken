import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Inbox from './pages/Inbox'
import Beoordelen from './pages/Beoordelen'
import Overzicht from './pages/Overzicht'

function Shell() {
  const { session, rol, laden } = useAuth()

  if (laden) return <p className="stil midden">Laden…</p>
  if (!session) return <Login />
  if (!rol) {
    return (
      <div className="login">
        <h1>Geen toegang</h1>
        <p>
          Je bent ingelogd als {session.user.email}, maar hebt nog geen rol in de facturen-app. Vraag de beheerder om je
          toe te voegen.
        </p>
        <button onClick={() => supabase.auth.signOut()}>Uitloggen</button>
      </div>
    )
  }

  return (
    <>
      <header>
        <strong>Facturen</strong>
        <nav>
          <NavLink to="/" end>Inbox</NavLink>
          <NavLink to="/overzicht">Overzicht</NavLink>
        </nav>
        <span className="stil">
          {session.user.email} · {rol}
        </span>
        <button onClick={() => supabase.auth.signOut()}>Uitloggen</button>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Inbox />} />
          <Route path="/factuur/:id" element={<Beoordelen />} />
          <Route path="/overzicht" element={<Overzicht />} />
        </Routes>
      </main>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </AuthProvider>
  )
}
