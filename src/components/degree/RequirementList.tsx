import { degreeRequirements } from "../../data/appData";
export function RequirementList() { return <>{degreeRequirements.map(item=><div className="requirement" key={item.title}><div><strong>{item.title}</strong><small>{item.progressLabel}</small></div><div className="mini-progress"><i style={{width:`${item.percent}%`}}/></div></div>)}</>; }
