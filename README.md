# Pathly

> Because students carry more than deadlines.

Coursework, syllabi, deadlines, study materials, degree requirements, and schedules often live in different places. Pathly brings those pieces together in a calmer academic workspace so students can see what needs attention, study from their own course materials, and understand where they are in their academic path.

Pathly is an academic planning and study aid. It does not replace official university records or academic advising.

## Live demo

[Open the verified Pathly deployment](https://pathly-app-git-agent-product-polish-pathly6.vercel.app/)

## 2-minute demo

[Watch Pathly on YouTube](https://youtu.be/QaV_P1mCNgs)

## What Pathly does

- **Today:** brings upcoming assignments, exams, overdue work, and study planning into one focused dashboard.
- **Study Hub:** keeps courses, source materials, organized notes, flashcards, practice questions, and study sessions together.
- **Private academic uploads:** stores syllabi, lecture materials, unofficial transcripts, and Degree Audits in private storage.
- **Review-before-write processing:** extracts structured academic information from documents, then asks the student to review and explicitly approve it before Pathly updates planning data.
- **Syllabus planning:** turns confirmed dated assignments and exams into course and Calendar commitments while keeping lecture topics and other non-deliverables in the Course Roadmap.
- **Calendar:** combines commitments across courses, supports week navigation, and offers an optional Course Roadmap layer.
- **Degree Plan:** brings together Degree Audit information, transcript history, and manual coursework without treating AI extraction as an official record.
- **Pathly Companion:** answers with the student's verified Pathly context when relevant, distinguishes known information from uncertainty, and avoids inventing academic requirements.
- **Connected services:** can import current coursework from Canvas and use Google Calendar busy intervals when planning time. Pathly does not store Google event titles, descriptions, attendees, or meeting links.
- **Personal controls:** includes dark mode, profile and academic settings, integration controls, source-file removal, and account deletion.

## How Pathly handles AI

Pathly uses Anthropic Claude from server-side Edge Functions for structured academic-document processing, course-note organization, and Companion assistance. Source documents are treated as untrusted content, structured results are validated, and academic information that affects planning follows this flow:

**AI extraction → student review → explicit approval → Pathly academic data**

AI output can be incomplete or wrong. Students should verify deadlines, degree requirements, prerequisites, course availability, and graduation information against official institutional sources.

## Privacy and security

The current implementation uses:

- Supabase Authentication for user accounts.
- Owner-scoped Row Level Security for student data.
- A private Supabase Storage bucket for uploaded source files.
- Server-side AI and integration credentials rather than browser-exposed secrets.
- Encrypted stored credentials for Canvas and Google Calendar connections.
- Review-before-write boundaries for extracted academic data.
- Account deletion controls for Pathly data and stored source files.

These are practical safeguards, not a claim of certification or perfect security. Students should avoid uploading sensitive information that Pathly does not need.

## Tech stack

- React
- TypeScript
- Vite
- Supabase Auth, Postgres, Storage, and Edge Functions
- Anthropic Claude
- Canvas integration
- Google Calendar integration
- Vercel

## Architecture

```text
Student
  → Pathly React UI
  → Supabase Auth / Postgres / private Storage
  → Supabase Edge Functions
  → Claude or a connected Canvas / Google service
  → student review and confirmation
  → Pathly academic data
```

Integration credentials and AI keys remain on the server. The browser receives only the public Supabase configuration required to connect to the app.

## Running locally

Pathly uses pnpm. With a current Node.js installation:

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Set the public development values in `.env.local`:

```text
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
VITE_PUBLIC_APP_URL=http://localhost:8443
```

Do not place server-side AI, OAuth, integration, or encryption secrets in `VITE_` variables or commit them to Git. Edge Function secrets are configured separately in Supabase.

Useful checks:

```bash
pnpm exec tsc --noEmit
pnpm build
pnpm run test:processing-schemas
```

The development server uses port `8443` by default.

## Project status

Pathly v1.0.0 is the initial release candidate. The public deployment above is the competition-submitted and verified build; this repository continues to document deferred hardening and maintenance work separately from product behavior.

## Author

Built by [Mairesse Nkundizanye](https://github.com/mairesse24).
