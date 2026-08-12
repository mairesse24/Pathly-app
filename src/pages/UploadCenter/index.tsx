import { PageHeader } from "../../components/layout/PageHeader"
import { Button } from "../../components/ui/Button"
import { Card } from "../../components/ui/Card"
import { Icon } from "../../components/ui/Icon"
export function UploadCenterPage() {
  return (
    <>
      <PageHeader title="Upload center" />
      <main className="page">
        <div className="intro-row">
          <div>
            <h2>Your course materials will live here.</h2>
            <p>File uploads are not available yet.</p>
          </div>
        </div>
        <Card className="upload-zone">
          <div className="upload-graphic">
            <Icon name="upload" size={32} />
          </div>
          <h3>Upload course material</h3>
          <p>
            Transcript, degree-audit, syllabus, and lecture uploads are coming
            in a later milestone.
          </p>
          <Button disabled title="File uploads are coming next">
            Choose a file · Coming next
          </Button>
        </Card>
        <div className="empty-materials">
          <Icon name="file" size={28} />
          <h3>No uploads yet</h3>
          <p>Nothing has been uploaded to this account.</p>
        </div>
      </main>
    </>
  )
}
