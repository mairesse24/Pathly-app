import { useNavigate } from "react-router-dom";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
export function PageHeader({ title }: { title: string }) { const navigate = useNavigate(); return <header className="topbar"><div><p className="eyebrow">Tuesday, October 14</p><h1>{title}</h1></div><div className="top-actions"><button className="icon-button" aria-label="Notifications"><Icon name="bell"/></button><Button variant="secondary" onClick={()=>navigate("/uploads")}><Icon name="upload" size={17}/> Add material</Button></div></header>; }
