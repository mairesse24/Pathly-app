import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { CourseCard } from "../../components/study/CourseCard";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Icon } from "../../components/ui/Icon";
import { courses, studyMaterials } from "../../data/appData";
export function StudyHubPage() { const navigate=useNavigate(); return <><PageHeader title="Study hub"/><main className="page"><div className="intro-row"><div><h2>Learn in the way that helps it stick.</h2><p>Everything from your courses, made easier to return to.</p></div><Button onClick={()=>navigate("/uploads")}><Icon name="plus" size={17}/> Upload lecture</Button></div><div className="course-grid">{courses.map(course=><CourseCard course={course} key={course.code}/>)}</div><section className="materials"><div className="section-title"><div><p className="eyebrow">Recently added</p><h2>Your study materials</h2></div></div><div className="material-grid">{studyMaterials.map(item=><Card key={item.title} className="material-card"><div className={`file-icon ${item.tone}`}><Icon name="file"/></div><div><Badge tone="gray">{item.type}</Badge><h3>{item.title}</h3><p>{item.detail}</p></div><button className="round-arrow" aria-label={`Open ${item.title}`}><Icon name="arrow" size={17}/></button></Card>)}</div></section></main></>; }
