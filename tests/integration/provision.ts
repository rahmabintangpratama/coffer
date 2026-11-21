import { admin, type Credentials, testUsers } from "./config";
import { adminOk } from "./rustfs-admin";

const everything = ["arn:aws:s3:::*"];

const policies = {
  "coffer-read-list-only": {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["s3:GetObject", "s3:ListBucket", "s3:GetBucketLocation", "s3:ListAllMyBuckets"],
        Resource: everything,
      },
    ],
  },
  "coffer-no-delete": {
    Version: "2012-10-17",
    Statement: [
      { Effect: "Allow", Action: ["s3:*"], Resource: everything },
      { Effect: "Deny", Action: ["s3:DeleteObject", "s3:DeleteObjectVersion"], Resource: everything },
    ],
  },
} as const;

async function provisionUser(user: Credentials, policy: keyof typeof policies): Promise<void> {
  await adminOk(admin, "PUT", "add-canned-policy", { name: policy }, JSON.stringify(policies[policy]));
  await adminOk(
    admin,
    "PUT",
    "add-user",
    { accessKey: user.accessKeyId },
    JSON.stringify({ secretKey: user.secretAccessKey, status: "enabled" }),
  );
  await adminOk(admin, "PUT", "set-user-or-group-policy", {
    policyName: policy,
    userOrGroup: user.accessKeyId,
    isGroup: "false",
  });
}

/** Idempotent: creates the read-only and delete-denied users and their policies. */
export async function provisionTestUsers(): Promise<void> {
  await provisionUser(testUsers.readOnly, "coffer-read-list-only");
  await provisionUser(testUsers.noDelete, "coffer-no-delete");
}
