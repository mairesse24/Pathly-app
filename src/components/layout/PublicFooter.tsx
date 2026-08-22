import { Link } from "react-router-dom"

const repositoryUrl = "https://github.com/mairesse24/Pathly-app"

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div><strong>Pathly</strong><span>© 2026 Pathly · Built by Mairesse Nkundizanye</span></div>
      <nav aria-label="Product and legal information">
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
        <Link to="/about">About Pathly</Link>
        <a href={repositoryUrl} target="_blank" rel="noopener noreferrer">GitHub</a>
      </nav>
    </footer>
  )
}
