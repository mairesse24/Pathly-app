import { useNavigate } from "react-router-dom"
import { Brand } from "../../components/layout/Brand"
import { Badge } from "../../components/ui/Badge"
import { Button } from "../../components/ui/Button"
import { Card } from "../../components/ui/Card"
import { Icon } from "../../components/ui/Icon"
import { demoStudent, focusTasks } from "../../data/appData"
export function LandingPage() {
  const navigate = useNavigate()
  return (
    <div className="landing">
      <header className="landing-nav">
        <Brand />
        <div>
          <button className="landing-link">About Pathly</button>
          <Button onClick={() => navigate("/dashboard")}>
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
            Pathly is your calm academic companion—helping you understand
            coursework, find your focus, and make space to breathe.
          </p>
          <div className="hero-actions">
            <Button onClick={() => navigate("/dashboard")}>
              See your day <Icon name="arrow" size={16} />
            </Button>
            <Button variant="secondary">
              <Icon name="play" size={16} /> Watch how it works
            </Button>
          </div>
          <div className="hero-preview">
            <div className="preview-copy">
              <p className="eyebrow">Tuesday, October 14</p>
              <h3>Good morning, {demoStudent.firstName}.</h3>
              <p>Let’s make today feel a little lighter.</p>
              {focusTasks.slice(0, 2).map((task, index) => (
                <div
                  className={`preview-task ${index === 1 ? "faint" : ""}`}
                  key={task.id}
                >
                  <span>0{index + 1}</span>
                  <div>
                    <strong>{task.title}</strong>
                    <small>
                      {task.detail} · {task.duration}
                    </small>
                  </div>
                </div>
              ))}
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
          <h2>Built around what students actually need.</h2>
          <div>
            {[
              ["Understand", "Make dense course material easier to return to."],
              [
                "Organize",
                "See the few things that deserve your attention today.",
              ],
              ["Support", "Build a rhythm that considers your energy, too."],
            ].map(([title, description]) => (
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
