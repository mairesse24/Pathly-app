import { ChatPanel } from "../../components/companion/ChatPanel"
import { PageHeader } from "../../components/layout/PageHeader"
import { useProfile } from "../../context/ProfileContext"

export function CompanionPage() {
  const { profile } = useProfile()
  const firstName = profile?.display_name.split(/\s+/)[0]
  return (
    <>
      <PageHeader title="Pathly Companion" />
      <main className="page companion-page">
        <div className="companion-head">
          <div className="companion-orb">✦</div>
          <div>
            <h2>
              {firstName ? `Hi, ${firstName}. ` : ""}A little clarity, when you
              need it.
            </h2>
            <p>
              Pathly helps you decide what matters, grounded in the academic
              information you've saved.
            </p>
          </div>
        </div>
        <ChatPanel />
      </main>
    </>
  )
}
