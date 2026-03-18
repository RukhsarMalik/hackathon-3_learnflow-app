import type { AppProps } from 'next/app'
import Link from 'next/link'
import { useRouter } from 'next/router'
import '../styles/globals.css'

const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL || 'http://localhost:30090'

function Navbar() {
  const router = useRouter()
  const path = router.pathname

  const links = [
    { href: '/', label: 'Dashboard', icon: '🏫' },
    { href: '/tutor', label: 'AI Tutor', icon: '🤖' },
    { href: '/exercises', label: 'Exercises', icon: '💻' },
    { href: '/quiz', label: 'Quiz', icon: '🧠' },
    { href: '/progress', label: 'Progress', icon: '📈' },
  ]

  return (
    <nav className="navbar">
      <Link href="/" className="navbar-logo">
        <div className="navbar-logo-icon">⚡</div>
        LearnFlow
      </Link>
      <div className="navbar-links">
        {links.map(l => (
          <Link
            key={l.href}
            href={l.href}
            className={`navbar-link${path === l.href ? ' active' : ''}`}
          >
            <span>{l.icon}</span>
            {l.label}
          </Link>
        ))}
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="navbar-link"
        >
          <span>📚</span>
          Docs
        </a>
      </div>
    </nav>
  )
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Navbar />
      <div className="page-wrapper">
        <Component {...pageProps} />
      </div>
    </>
  )
}
