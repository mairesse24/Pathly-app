import { createContext, useContext, useState, type ReactNode } from "react";
type AppContextValue = { uploaded: boolean; setUploaded: (value: boolean) => void };
const AppContext = createContext<AppContextValue | undefined>(undefined);
export function AppProvider({ children }: { children: ReactNode }) { const [uploaded,setUploaded] = useState(false); return <AppContext.Provider value={{uploaded,setUploaded}}>{children}</AppContext.Provider>; }
export function useAppContext() { const value = useContext(AppContext); if (!value) throw new Error("useAppContext must be used within AppProvider"); return value; }
