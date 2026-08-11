import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
export function ProtectedRoute(){const {user,loading}=useAuth();const location=useLocation();if(loading)return <main className="auth-state">Loading your workspace…</main>;return user?<Outlet/>:<Navigate to="/auth" replace state={{from:location.pathname}}/>}
