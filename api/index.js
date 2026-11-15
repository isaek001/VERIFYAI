// Vercel entry point: the Express app from server/ runs as a single
// Vercel Function. vercel.json rewrites every /api/* request here, and
// Vercel keeps the original path on the request, so Express still sees
// e.g. /api/auth/login and its router matches exactly as it does locally.
import app from "../server/index.js";

export default app;
