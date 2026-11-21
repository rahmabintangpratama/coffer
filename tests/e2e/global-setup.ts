import { provisionBig, provisionE2e } from "./fixture";

// Every spec enters the app through the real onboarding flow against the S3
// fixture, so the shared bucket and users must exist before any test starts.
export default async function setup(): Promise<void> {
  await provisionE2e();
  await provisionBig();
}
