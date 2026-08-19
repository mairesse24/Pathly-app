import { useNavigate } from "react-router-dom"
import { Brand } from "../../components/layout/Brand"
import { Badge } from "../../components/ui/Badge"
import { Button } from "../../components/ui/Button"
import { Card } from "../../components/ui/Card"
import { Icon } from "../../components/ui/Icon"
import { DEMO_VIDEO_URL } from "../../constants/demo"

const benefits = [
  {
    title: "Know what needs attention",
    description: "Deadlines, overdue work, exams, and study sessions — together in one place.",
  },
  {
    title: "Turn course material into action",
    description: "Upload syllabi and materials, review important dates, and organize your notes.",
  },
  {
    title: "See the bigger picture",
    description: "Track degree progress with a Companion grounded in your own Pathly data.",
  },
]

export function LandingPage() {
  const navigate = useNavigate()
  return (
    <div className="landing">
      <header className="landing-nav">
        <Brand />
        <div>
          <button className="landing-link">About Pathly</button>
          <Button onClick={() => navigate("/auth")}>
            Get started <Icon name="arrow" size={16} />
          </Button>
        </div>
      </header>
      <main>
        <section className="landing-hero">
          <Badge>For the full student life</Badge>
          <h1>
            Because students carry{" "}
            <br />
            <em>more than deadlines.</em>
          </h1>
          <p>
            Pathly brings your classes, degree progress, study plans, course
            materials, and daily check-ins into one calm space.
          </p>
          <div className="hero-actions">
            <Button onClick={() => navigate("/auth")}>
              Get started <Icon name="arrow" size={16} />
            </Button>
            {DEMO_VIDEO_URL && (
              <a
                className="btn btn-secondary"
                href={DEMO_VIDEO_URL}
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Watch the 2-minute Pathly demo video (opens in a new tab)"
              >
                <Icon name="play" size={16} /> Watch 2-minute demo
              </a>
            )}
          </div>
          <div className="hero-preview" aria-label="Example of a Pathly day view">
            <div className="preview-copy">
              <p className="eyebrow">Example day view</p>
              <h3>A calmer view of today.</h3>
              <p>See what needs attention first.</p>
              <div className="preview-task">
                <span>01</span>
                <div>
                  <strong>Upcoming deadline</strong>
                  <small>Assignment due soon</small>
                </div>
              </div>
              <div className="preview-task faint">
                <span>02</span>
                <div>
                  <strong>Study session</strong>
                  <small>Planned focus time</small>
                </div>
              </div>
            </div>
            <div className="preview-note">
              <span>✦</span>
              <p>
                Everything else
                <br />
                can wait.
              </p>
            </div>
          </div>
        </section>
        <section className="landing-features">
          <p className="eyebrow">A calmer way through college</p>
          <h2>Everything in one calm space.</h2>
          <div>
            {benefits.map(({ title, description }) => (
              <Card key={title}>
                <span className="feature-star">✦</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
