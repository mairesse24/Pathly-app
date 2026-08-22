import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// Regression guard for the demo-critical Companion failure traced to a freshly confirmed
// Degree Audit: "I want to graduate in 2028. What should I take next semester?" returned
// 500, 409, 500. This can't run against a real Postgres connection outside CI, so --
// following the pattern already used by scripts/validate-companion-knowledge-routing.mjs --
// it asserts against the edge function's source text instead of executing it.
const edge = readFileSync(
  new URL("../supabase/functions/pathly-companion/index.ts", import.meta.url),
  "utf8",
)

// Bug 1 (the 500): user_degree_requirement_groups carries two FKs to user_degree_plans
// (plan_id, and the composite plan_id+user_id), and user_degree_requirements carries the
// same pair to user_degree_requirement_groups. An unqualified nested embed is genuinely
// ambiguous between them and PostgREST fails outright with PGRST201 the moment this query
// runs at all, for any user with a confirmed degree plan -- both embeds must name the
// composite, owner-scoped FK explicitly.
assert.match(
  edge,
  /user_degree_requirement_groups!user_degree_requirement_groups_plan_id_user_id_fkey/,
  "the user_degree_plans query must disambiguate the user_degree_requirement_groups embed with an explicit FK hint (PGRST201)",
)
assert.match(
  edge,
  /user_degree_requirements!user_degree_requirements_group_id_user_id_fkey/,
  "the user_degree_requirement_groups embed must disambiguate its nested user_degree_requirements embed with an explicit FK hint (PGRST201)",
)

// Bug 2 (the 409): a claimed-but-unanswered user message with no way to distinguish "still
// genuinely in flight" from "crashed after claiming but before replying" permanently wedged
// every resend of that exact message behind a 409 for the rest of its dedupe bucket, with no
// path to ever actually retry it. A stale claim must be treated as abandoned and retried.
assert.match(
  edge,
  /STALE_CLAIM_MS/,
  "a claimed user message must become retryable after a staleness threshold instead of blocking every resend with a permanent 409",
)
assert.match(
  edge,
  /claimAgeMs\s*<\s*STALE_CLAIM_MS/,
  "the stale-claim check must compare the claim's age against the staleness threshold before deciding to 409",
)

// The stale-claim retry makes a second concurrent completion for the same request_id
// possible (rare, but real once a crashed claim can be replayed) -- the final assistant
// insert must treat the unique-violation on (conversation_id, request_id, role) as a benign
// race and return the winner's reply, not a 500.
assert.match(
  edge,
  /saveError\.code\s*===\s*"23505"/,
  "the assistant-message insert must handle a (conversation_id, request_id, role) race by refetching the existing row instead of throwing",
)

// Bug 3 (context bloat): degree requirement data must be summarized before it reaches the
// Anthropic prompt, not dumped raw -- see src/utils/companionDegreeSummary.test.ts for
// coverage of the summarizer itself.
assert.match(
  edge,
  /import\s*\{\s*summarizeAuditRequirementGroups\s*\}\s*from\s*"\.\.\/_shared\/companionDegreeSummary\.ts"/,
  "Companion must import the shared degree-audit summarizer rather than redefining it inline",
)
const addCallSites = edge.match(/add\("Degree Planner",\s*"course",\s*\{[^]*?\}\)/g) || []
assert.equal(
  addCallSites.length >= 2,
  true,
  "expected at least two Degree Planner context call sites (degree_audit and verified_catalog branches)",
)
for (const site of addCallSites) {
  assert.doesNotMatch(
    site,
    /requirement_progress:\s*auditPlan\.user_degree_requirement_groups\b/,
    "a Degree Planner context call must not dump the raw, unsummarized audit requirement groups into the Anthropic prompt",
  )
}
assert.match(
  edge,
  /requirement_progress:\s*summarizeAuditRequirementGroups\(auditPlan\.user_degree_requirement_groups\)/,
  "the degree_audit-sourced Degree Planner context must use the summarized requirement groups",
)
assert.match(
  edge,
  /degree_audit_supplement\.requirement_progress|requirement_progress:\s*summarizeAuditRequirementGroups\(auditPlan\.user_degree_requirement_groups\).*warning/s,
  "the verified_catalog branch's degree-audit supplement must also use the summarized requirement groups",
)

// The deterministic degree_audit_review matching logic must keep reading the raw structure
// -- summarization is presentation-only and must never feed the actual credit-matching math.
assert.match(
  edge,
  /auditPlan\?\.user_degree_requirement_groups\?\.find\(/,
  "the degree_audit_review matching strategy must still read the raw (unsummarized) requirement groups for its deterministic logic",
)

console.log("Companion degree-audit recovery regression checks passed")
