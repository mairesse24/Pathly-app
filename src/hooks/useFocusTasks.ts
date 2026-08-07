import { useState } from "react";
import { focusTasks } from "../data/appData";
export function useFocusTasks() { const [completed, setCompleted] = useState<string[]>([]); const toggle = (id:string) => setCompleted(current => current.includes(id) ? current.filter(item => item !== id) : [...current,id]); return { tasks:focusTasks, completed, toggle }; }
