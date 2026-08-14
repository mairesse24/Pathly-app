import { ChatPanel } from "../../components/companion/ChatPanel"
import { PageHeader } from "../../components/layout/PageHeader"
import { useProfile } from "../../context/ProfileContext"

export function CompanionPage() {
  const { profile } = useProfile()
  const firstName = profile?.display_name.split(/\s+/)[0]
  return <><PageHeader title="Your companion"/><main className="page companion-page"><div className="companion-head"><div className="companion-orb">✦</div><div><h2>{firstName ? `Hi, ${firstName}. ` : ""}A little clarity, when you need it.</h2><p>Pathly is here to help you decide what matters—not ask you to do more.</p></div></div><ChatPanel/></main></>
}
