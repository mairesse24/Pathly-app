import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
export function ProfilePage() { return <><PageHeader title="Your profile"/><main className="page settings-page"><Card><div className="profile-heading"><div className="avatar large">AM</div><div><h2>Alex Morgan</h2><p>Biology · Class of 2027</p></div><Button variant="secondary">Edit profile</Button></div></Card><Card><p className="eyebrow">Academic profile</p><h3>On a steady path.</h3><p>Your degree plan, study preferences, and course details are ready for future account sync.</p></Card></main></>; }
