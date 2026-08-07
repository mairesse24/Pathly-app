import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Icon } from "../../components/ui/Icon";
import { useAppContext } from "../../context/AppContext";
export function UploadCenterPage() { const {uploaded,setUploaded}=useAppContext(); const navigate=useNavigate(); return <><PageHeader title="Upload center"/><main className="page"><div className="intro-row"><div><h2>Turn course materials into study support.</h2><p>Upload a lecture, syllabus, or reading. Pathly will organize the useful parts.</p></div></div><Card className="upload-zone"><div className="upload-graphic"><Icon name="upload" size={32}/></div><h3>Drop your material here</h3><p>PDF, PPTX, DOCX, or images up to 25 MB</p><Button onClick={()=>setUploaded(true)}>Choose a file</Button></Card>{uploaded?<Card className="upload-result"><div className="file-icon sage"><Icon name="file"/></div><div><Badge>Ready to study</Badge><h3>Photosynthesis — Lecture 8.pdf</h3><p>Pathly made a summary, 24 flashcards, key concepts, and a 10-question practice quiz.</p></div><Button onClick={()=>navigate("/study")}>Open materials <Icon name="arrow" size={16}/></Button></Card>:<div className="empty-materials"><Icon name="file" size={28}/><h3>No recent uploads</h3><p>Your course materials will live here when you’re ready.</p></div>}</main></>; }
