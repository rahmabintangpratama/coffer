// Fixed fake credentials for the local S3 fixture in docker-compose.yml.
// They are not real and must never be replaced with real cloud credentials.
export const s3Fixture = {
  endpoint: process.env.COFFER_TEST_S3_ENDPOINT ?? "http://127.0.0.1:9000",
  region: "us-east-1",
  accessKeyId: "coffer-test-key",
  secretAccessKey: "coffer-test-secret-not-real",
  bucket: "coffer-test",
} as const;
