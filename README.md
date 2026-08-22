# Pathly-app

## Canvas credential encryption

Canvas credentials are encrypted server-side with AES-256-GCM. The Supabase Edge Function secret
`CANVAS_TOKEN_ENCRYPTION_KEY` must contain standard Base64 encoding of exactly 32 cryptographically
random bytes. Never add this value to Git or a `VITE_` environment variable.

After credentials have been stored, do not replace or rotate this key without a planned credential
re-encryption migration. Existing ciphertext cannot be decrypted with a different key.

## Google Calendar deployment

Deploy these Supabase Edge Functions to project `qyteadrlrsjuhtwggayk`:

- `google-calendar-oauth-start`
- `google-calendar-oauth-callback`
- `google-calendar-sync`
- `google-calendar-disconnect`

Add these names through Supabase Edge Function Secrets. Never add sensitive values to Git or
expose them through a `VITE_` variable:

- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY`
- `PATHLY_APP_URL`

Use these non-secret URL values:

```text
GOOGLE_CALENDAR_REDIRECT_URI=https://qyteadrlrsjuhtwggayk.supabase.co/functions/v1/google-calendar-oauth-callback
PATHLY_APP_URL=https://pathly-app-git-agent-product-polish-pathly6.vercel.app
```

`GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY` must be standard Base64 encoding of exactly 32 random bytes.
Do not rotate it after credentials are stored without a credential re-encryption or reconnection
plan. Although an OAuth client ID is not a password, Pathly treats it as server-side configuration
alongside the client secret and does not expose it to the browser.
