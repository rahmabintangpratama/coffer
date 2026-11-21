import { type KeyProblem, keyProblem } from "@/lib/s3/keys";
import type { UploadBody } from "@/lib/s3/upload";

/** A file to upload and its path relative to the folder it goes into (`a/b.txt` for a folder upload, `b.txt` for one file). */
export interface UploadCandidate {
  file: File;
  path: string;
}

export interface PlannedUpload {
  key: string;
  name: string;
  file: UploadBody;
}

export interface Rejected {
  path: string;
  problem: KeyProblem;
}

/**
 * Turn picked or dropped files into keys under the current folder, and set aside
 * any whose key the bucket cannot store, so they are reported before the upload
 * starts and not after a failure (AC-40.4).
 */
export function planUploads(folderPrefix: string, candidates: readonly UploadCandidate[]): { planned: PlannedUpload[]; rejected: Rejected[] } {
  const planned: PlannedUpload[] = [];
  const rejected: Rejected[] = [];
  for (const { file, path } of candidates) {
    const key = `${folderPrefix}${path}`;
    const problem = keyProblem(key);
    if (problem === null) planned.push({ key, name: path.slice(path.lastIndexOf("/") + 1), file });
    else rejected.push({ path, problem });
  }
  return { planned, rejected };
}
