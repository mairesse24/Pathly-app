import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
const RECOVERY_KEY = "pathly-password-recovery";
function readRecoveryFlag() { try { return sessionStorage.getItem(RECOVERY_KEY) === "1" } catch { return false } }
function writeRecoveryFlag(value: boolean) { try { if (value) sessionStorage.setItem(RECOVERY_KEY, "1"); else sessionStorage.removeItem(RECOVERY_KEY) } catch { /* storage unavailable (e.g. private mode) */ } }
type Value = { session: Session | null; user: Session["user"] | null; loading: boolean; recovery: boolean; clearRecovery: () => void; signOut: () => Promise<void> };
const Context = createContext<Value | undefined>(undefined);
export function AuthProvider({children}:{children:ReactNode}) {
  const [session,setSession]=useState<Session|null>(null);
  const [loading,setLoading]=useState(true);
  const [recovery,setRecovery]=useState(readRecoveryFlag);
  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});
    const {data}=supabase.auth.onAuthStateChange((event,s)=>{
      setSession(s);
      setLoading(false);
      // Supabase fires this once when a session is established from a password-recovery
      // link; it's the only reliable signal that this session's purpose is a reset, not a
      // normal sign-in, so the app must gate normal navigation until the password is updated.
      if (event === "PASSWORD_RECOVERY") { setRecovery(true); writeRecoveryFlag(true) }
    });
    return ()=>data.subscription.unsubscribe()
  },[]);
  function clearRecovery(){ setRecovery(false); writeRecoveryFlag(false) }
  async function signOut(){const {error}=await supabase.auth.signOut();if(error)throw error}
  return <Context.Provider value={{session,user:session?.user??null,loading,recovery,clearRecovery,signOut}}>{children}</Context.Provider>
}
export function useAuth(){const value=useContext(Context);if(!value)throw new Error("useAuth must be used within AuthProvider");return value}
