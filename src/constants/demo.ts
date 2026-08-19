// Single source of truth for the landing page's "Watch 2-minute demo" link.
// Set VITE_DEMO_VIDEO_URL (Loom/Vimeo/Vidyard, etc.) to enable the CTA;
// leave it unset to hide the CTA entirely rather than render a dead link.
export const DEMO_VIDEO_URL = (import.meta.env.VITE_DEMO_VIDEO_URL ?? "").trim();
