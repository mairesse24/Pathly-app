import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { Brand } from "../../components/layout/Brand"
import { PublicFooter } from "../../components/layout/PublicFooter"

const repositoryUrl = "https://github.com/mairesse24/Pathly-app"

function PublicPage({ title, showUpdated = false, children }: { title: string; showUpdated?: boolean; children: ReactNode }) {
  return <div className="legal-page"><header className="landing-nav"><Brand /><Link to="/">Back to Pathly</Link></header><main id="main-content"><p className="eyebrow">Pathly</p><h1>{title}</h1>{showUpdated && <p className="legal-updated">Last updated August 21, 2026</p>}{children}</main><PublicFooter /></div>
}

export function PrivacyPage() {
  return <PublicPage title="Privacy Policy" showUpdated>
    <p>Pathly is a student-built academic planning and study application. This policy explains what the current version handles when you choose to use its features.</p>
    <h2>Information stored by Pathly</h2>
    <ul>
      <li><strong>Account and profile:</strong> your email address, display name, university, major, graduation target, catalog year, timezone, and study preferences you provide.</li>
      <li><strong>Academic planning:</strong> courses, semesters, assignments, exams, study sessions, reflections, completed or in-progress coursework, degree requirements, and planning decisions.</li>
      <li><strong>Uploads and reviewed results:</strong> academic source files such as syllabi, lecture material, unofficial transcripts, and degree audits; their processing status; and structured information you explicitly approve after review.</li>
      <li><strong>AI features:</strong> Companion conversations and generated study material you ask Pathly to create or save.</li>
      <li><strong>Connected services:</strong> the connection and synchronization information described below when you opt in.</li>
    </ul>
    <h2>AI processing and Pathly Companion</h2>
    <p>Pathly uses Anthropic&apos;s Claude models for supported document extraction, note organization, and Companion responses. When you request one of these features, Pathly sends Anthropic the content needed for that request—for example, an uploaded document, notes, your question, recent conversation, or relevant Pathly academic context. AI-extracted academic records are not automatically written into your coursework or Degree Plan: Pathly presents supported results for your review and requires explicit approval first.</p>
    <h2>Google Calendar</h2>
    <p>If you connect Google Calendar, Pathly stores your connected Google account identifier and email, available calendar names and timezones, which calendars you select, synchronization status, encrypted OAuth credentials, and busy start/end times returned for selected calendars. Pathly uses Google&apos;s free/busy service to plan around unavailable time. It does not import or store event titles, descriptions, attendees, or meeting links. Disconnecting removes the Pathly connection, stored credentials, selected-calendar records, and imported busy periods; Google may also provide its own controls for revoking access.</p>
    <h2>Canvas</h2>
    <p>If your institution&apos;s Canvas setup supports the connection, Pathly can connect through Canvas OAuth or a personal access token. Pathly stores the Canvas site address, connection identifiers and status, encrypted credentials, and selected course and assignment information needed for synchronization, including due dates and available submission status. The current implementation supports one Canvas connection per Pathly account. You can disconnect it and choose whether Canvas-imported courses remain visible in Pathly. Canvas has its own privacy terms and account controls.</p>
    <h2>Service providers and where data goes</h2>
    <p>Pathly uses Supabase for account authentication, its database, private file storage, and server-side functions. It sends relevant content to Anthropic when you request AI features, to Google when you connect or sync Google Calendar, and to your institution&apos;s Canvas service when you connect or sync Canvas. These services receive the information needed to provide the feature you requested and operate under their own terms. Their names describe technologies Pathly uses; they do not imply sponsorship, partnership, or endorsement.</p>
    <h2>Security and your choices</h2>
    <p>Uploaded source files are kept in a non-public Supabase Storage bucket. Database and storage access rules scope student records and files to their owning account. Google and Canvas credentials are encrypted by Pathly&apos;s server-side functions before storage and are not exposed as browser configuration. These safeguards reduce risk but do not guarantee absolute security.</p>
    <p><strong>Please remove information Pathly does not need before uploading.</strong> Do not upload Social Security numbers, passwords, financial or medical records, or other unnecessary sensitive personal information.</p>
    <h2>Deletion and retention</h2>
    <p>You can delete source uploads, remove supported imported records, delete Companion conversations, disconnect Google Calendar or Canvas, and delete your Pathly account from Settings. Some removal flows intentionally preserve reviewed academic work or ask whether connected coursework should remain, so Pathly shows the effect before deletion. Account deletion removes the account&apos;s Pathly database records and source-upload storage objects. A failed processing attempt does not automatically delete the original file.</p>
    <h2>Contact</h2>
    <p>Questions or issue reports can be submitted through the <a href={`${repositoryUrl}/issues`} target="_blank" rel="noopener noreferrer">Pathly GitHub issue tracker</a>. Avoid including private academic or account information in a public issue.</p>
  </PublicPage>
}

export function TermsPage() {
  return <PublicPage title="Terms of Use" showUpdated>
    <p>Pathly is a student-built academic planning and study aid. By using it, you agree to these concise terms.</p>
    <h2>Academic information is yours to verify</h2>
    <p>Pathly does not replace official university records, a degree audit supplied by your institution, a registrar, or an academic advisor. AI-generated summaries, extractions, plans, and recommendations can be incomplete or wrong. Verify deadlines, degree requirements, course availability, prerequisites, transfer applicability, and graduation information with official institutional sources.</p>
    <h2>No academic-outcome guarantee</h2><p>Pathly does not determine or guarantee graduation eligibility, admission, course completion, grades, or any other academic outcome. Planning views reflect the information available to Pathly and the choices you have reviewed.</p>
    <h2>Your account and content</h2><p>You are responsible for securing your account and for files, notes, and other content you provide. Only upload or connect material and accounts that you own or have permission to use. You allow Pathly and the service providers identified in the Privacy Policy to store and process that content only as needed to provide features you request.</p>
    <h2>Acceptable use</h2><p>Do not use Pathly unlawfully; upload malware; attempt to access another person&apos;s information; probe, bypass, or disrupt security controls; abuse integrations; or use the service to harm others.</p>
    <h2>Third-party services</h2><p>Optional services such as Google Calendar, Canvas, Anthropic, and Supabase operate under their own terms and policies. Pathly is not affiliated with or endorsed by the University of North Texas, Instructure or Canvas, Google, Anthropic, Supabase, Stellic, or any other university or platform named in student-provided content.</p>
    <h2>Availability and changes</h2><p>Features may change, pause, or be discontinued, and Pathly cannot promise uninterrupted or error-free availability. Keep independent copies of official records and information you cannot afford to lose.</p>
    <h2>Contact</h2><p>Questions or issue reports can be submitted through the <a href={`${repositoryUrl}/issues`} target="_blank" rel="noopener noreferrer">Pathly GitHub issue tracker</a>. Do not post private information in a public issue.</p>
  </PublicPage>
}

export function AboutPage() {
  return <PublicPage title="Because students carry more than deadlines.">
    <p>Pathly is a calm environment for organizing coursework, understanding upcoming commitments, summarizing study material, reflecting on how the day is going, and seeing an academic path more clearly.</p>
    <p>It brings day-to-day planning and the bigger degree picture together while keeping the student in control: imported and AI-extracted academic information is reviewed before it becomes part of the student&apos;s records.</p>
    <h2>Built with students in mind</h2><p>Pathly was created by Mairesse N. as a student-built project. It is an independent product and is not an official product of, or endorsed by, any university or third-party platform.</p>
    <p><a href={repositoryUrl} target="_blank" rel="noopener noreferrer">View Pathly on GitHub</a></p>
  </PublicPage>
}
