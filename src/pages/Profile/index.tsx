import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { demoStudent } from "../../data/appData";
export function ProfilePage() { return <><PageHeader title="Your profile"/><main className="page settings-page"><Card><div className="profile-heading"><div className="avatar large">MN</div><div><h2>{demoStudent.name}</h2><p>{demoStudent.major} · Class of {demoStudent.graduationYear}</p></div><Button variant="secondary">Edit profile</Button></div></Card><Card><p className="eyebrow">{demoStudent.university}</p><h3>On a steady path.</h3><p>Your degree plan, study preferences, and course details are ready for future account sync.</p></Card></main></>; }
