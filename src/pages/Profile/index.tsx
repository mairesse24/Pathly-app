import { useEffect, useState, type FormEvent } from "react"

import { PageHeader } from "../../components/layout/PageHeader"
import { Button } from "../../components/ui/Button"
import { Card } from "../../components/ui/Card"
import { useAuth } from "../../context/AuthContext"
import { supabase } from "../../lib/supabase"

type Profile = {
  full_name: string
  university: string
  major: string
  graduation_year: number | null
}

export function ProfilePage() {
  const { user, signOut } = useAuth()
  const [profile, setProfile] = useState<Profile>({
      full_name: "",
      university: "",
      major: "",
      graduation_year: null,
    }),
    [editing, setEditing] = useState(false),
    [message, setMessage] = useState("")
  useEffect(() => {
    if (!user) return
    supabase
      .from("profiles")
      .select("full_name,university,major,graduation_year")
      .eq("id", user.id)
      .single()
      .then(({ data, error }) => {
        if (data) setProfile(data)
        if (error) setMessage(error.message)
      })
  }, [user])
  async function save(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    const { error } = await supabase
      .from("profiles")
      .update({ ...profile, updated_at: new Date().toISOString() })
      .eq("id", user.id)
    if (error) setMessage(error.message)
    else {
      setMessage("Profile saved.")
      setEditing(false)
    }
  }
  const initials =
    profile.full_name
      .split(/\s+/)
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "P"
  return (
    <>
      <PageHeader title="Your profile" />
      <main className="page settings-page">
        <Card>
          {editing ? (
            <form className="profile-form" onSubmit={save}>
              <label>
                Full name
                <input
                  value={profile.full_name}
                  onChange={(e) =>
                    setProfile({ ...profile, full_name: e.target.value })
                  }
                />
              </label>
              <label>
                University
                <input
                  value={profile.university}
                  onChange={(e) =>
                    setProfile({ ...profile, university: e.target.value })
                  }
                />
              </label>
              <label>
                Major
                <input
                  value={profile.major}
                  onChange={(e) =>
                    setProfile({ ...profile, major: e.target.value })
                  }
                />
              </label>
              <label>
                Graduation year
                <input
                  type="number"
                  min="1900"
                  max="2200"
                  value={profile.graduation_year ?? ""}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      graduation_year: Number(e.target.value),
                    })
                  }
                />
              </label>
              <Button type="submit">Save profile</Button>
            </form>
          ) : (
            <div className="profile-heading">
              <div className="avatar large">{initials}</div>
              <div>
                <h2>{profile.full_name || user?.email}</h2>
                <p>
                  {profile.major}
                  {profile.graduation_year
                    ? ` · Class of ${profile.graduation_year}`
                    : ""}
                </p>
              </div>
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit profile
              </Button>
            </div>
          )}
          {message && <p className="form-message">{message}</p>}
        </Card>
        <Card>
          <p className="eyebrow">Academic details</p>
          <h3>{profile.university || "University not provided"}</h3>
          <p>
            {profile.major || "Major not provided"}
            {profile.graduation_year
              ? ` · Expected graduation ${profile.graduation_year}`
              : ""}
          </p>
          <Button variant="quiet" onClick={() => void signOut()}>
            Sign out
          </Button>
        </Card>
      </main>
    </>
  )
}
