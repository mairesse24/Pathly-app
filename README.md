# Pathly-app

## Canvas credential encryption

Canvas credentials are encrypted server-side with AES-256-GCM. The Supabase Edge Function secret
`CANVAS_TOKEN_ENCRYPTION_KEY` must contain standard Base64 encoding of exactly 32 cryptographically
random bytes. Never add this value to Git or a `VITE_` environment variable.

After credentials have been stored, do not replace or rotate this key without a planned credential
re-encryption migration. Existing ciphertext cannot be decrypted with a different key.
