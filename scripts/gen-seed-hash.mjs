// Regenerates the DEV seed password hashes using the real production hasher
// (PBKDF2 from supabase/functions/_shared/auth.ts). Run:
//   node --experimental-strip-types scripts/gen-seed-hash.mjs
// Paste the two printed strings into supabase/seed.sql.
import { hashPassword } from "../supabase/functions/_shared/auth.ts";

const alpha = await hashPassword("dev-password-alpha");
const beta = await hashPassword("dev-password-beta");
console.log(`ALPHA: ${alpha}`);
console.log(`BETA:  ${beta}`);
