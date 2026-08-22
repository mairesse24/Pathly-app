import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
export function ProtectedRoute(){const {user,loading,recovery}=useAuth();const location=useLocation();if(loading)return <main className="auth-state">Loading your workspace…</main>;if(!user)return <Navigate to="/auth" replace state={{from:location.pathname}}/>;if(recovery)return <Navigate to="/auth" replace/>;return <Outlet/>}
