import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
type Value = { session: Session | null; user: Session["user"] | null; loading: boolean; signOut: () => Promise<void> };
const Context = createContext<Value | undefined>(undefined);
export function AuthProvider({children}:{children:ReactNode}) { const [session,setSession]=useState<Session|null>(null); const [loading,setLoading]=useState(true); useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)}); const {data}=supabase.auth.onAuthStateChange((_e,s)=>{setSession(s);setLoading(false)}); return ()=>data.subscription.unsubscribe()},[]); async function signOut(){const {error}=await supabase.auth.signOut();if(error)throw error} return <Context.Provider value={{session,user:session?.user??null,loading,signOut}}>{children}</Context.Provider> }
export function useAuth(){const value=useContext(Context);if(!value)throw new Error("useAuth must be used within AuthProvider");return value}
