// Fixed fake credentials for the local S3 fixture in docker-compose.yml.
// They are not real and must never be replaced with real cloud credentials.
export const s3Fixture = {
  endpoint: process.env.COFFER_TEST_S3_ENDPOINT ?? "http://127.0.0.1:9000",
  region: "us-east-1",
  accessKeyId: "coffer-test-key",
  secretAccessKey: "coffer-test-secret-not-real",
  bucket: "coffer-test",
} as const;

export interface Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export const admin: Credentials = {
  accessKeyId: s3Fixture.accessKeyId,
  secretAccessKey: s3Fixture.secretAccessKey,
};

/** Users created by global-setup.ts with per-user policies (needed from M2a on). */
export const testUsers = {
  /** Can list and read, cannot write or delete: the read-only connection case. */
  readOnly: { accessKeyId: "coffer-readonly-key", secretAccessKey: "coffer-readonly-secret-not-real" },
  /** Can list, read and write, cannot delete: the delete-denied connection case. */
  noDelete: { accessKeyId: "coffer-nodelete-key", secretAccessKey: "coffer-nodelete-secret-not-real" },
} as const satisfies Record<string, Credentials>;
