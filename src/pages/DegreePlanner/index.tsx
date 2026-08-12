import { useEffect, useState } from "react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import {
  getProfileMetadata,
  type ProfileMetadata,
} from "../../services/profiles";

export function DegreePlannerPage() {
  const [profile, setProfile] = useState<ProfileMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getProfileMetadata()
      .then(setProfile)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error ? reason.message : "Unable to load your profile",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader title="Degree plan" />
      <main className="page">
        <div className="intro-row">
          <div>
            <h2>Build an accurate degree plan.</h2>
            <p>
              Pathly only calculates progress from coursework you have reviewed and
              confirmed.
            </p>
          </div>
        </div>

        <Card className="degree-metadata">
          <p className="eyebrow">Program information</p>
          {loading ? (
            <p>Loading your program…</p>
          ) : error ? (
            <p className="form-message">{error}</p>
          ) : (
            <>
              <h3>{profile?.major || "Major not added"}</h3>
              <p>{profile?.university || "University not added"}</p>
              {profile?.graduation_year && (
                <p>
                  Expected graduation year: {profile.graduation_year} (provided by
                  you; not a Pathly prediction)
                </p>
              )}
            </>
          )}
        </Card>

        <Card className="degree-empty-state">
          <div className="insight-star">✦</div>
          <p className="eyebrow">Degree progress</p>
          <h2>We don&apos;t know your degree progress yet.</h2>
          <p>
            Add your completed coursework so Pathly can build an accurate degree
            plan. Nothing is inferred from your major, expected graduation year, or
            generic averages.
          </p>
          <div className="degree-empty-actions">
            <Button disabled title="File uploads are coming in a later milestone">
              Upload unofficial transcript · Coming next
            </Button>
            <Button
              variant="secondary"
              disabled
              title="File uploads are coming in a later milestone"
            >
              Upload degree audit · Coming next
            </Button>
            <Button
              variant="secondary"
              disabled
              title="Manual completed-course entry is coming next"
            >
              Add completed courses manually · Coming next
            </Button>
          </div>
        </Card>
      </main>
    </>
  );
}
