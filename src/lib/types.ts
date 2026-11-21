// Canonical type contract for Coffer. This file started as a copy of design/types.ts (the origin)
// and is allowed to differ from it. Every difference is listed as T-n in docs/technical-spec.md
// section 3. There is no check that the two files match; never edit design/types.ts.

// Coffer v2 shared types. Names match tokens, components.md, copy.en.json keys and providers.json.

export type Theme = "system" | "light" | "dark";
export type Density = "comfortable" | "compact";
export type AddressingStyle = "auto" | "path" | "virtual";
export type ProviderGroup = "popular" | "global" | "asia" | "selfhosted" | "other";

export type ControlKind = "text" | "password" | "select" | "combobox" | "segmented";
export type KeyRole = "accessKeyId" | "secretAccessKey" | "sessionToken";
/** Show a field (or give it a key role) only while another field has this value. */
export interface ShowWhen { field: string; equals: string }
export interface FieldValidation {
  pattern?: string;               // regex source, anchored
  length?: number;                // exact length
  prefix?: string;                // required prefix, e.g. "tid_"
  message: string;
}
export interface ProviderField {
  id: string;                     // key in ConnectionProfile.fields
  label: string;                  // provider's own term, e.g. "Application Key ID"
  generic?: string;               // generic S3 term shown as caption
  control: ControlKind;
  mono?: boolean;
  required: boolean;
  placeholder?: string;
  default?: string;
  options?: string[];
  validation?: FieldValidation;
  role?: KeyRole;                 // this field supplies that credential (e.g. Supabase "Project ref" as access key)
  roleWhen?: ShowWhen;            // the role applies only while this holds
  showWhen?: ShowWhen;            // the field is visible only while this holds
}
export interface PasteHints {
  envVars: string[];              // AWS_ACCESS_KEY_ID, ...
  rcloneKeys: Record<string, string>;
  rcloneProviderValue?: string | null;
  endpointPattern: string | null; // regex with named groups = field ids
  endpointPatternNote: string;
  endpointPatternDefaults?: Record<string, string>; // value for a field whose optional group did not match
}
export type RegionRule = "required" | "fixed" | "equals" | "custom" | "optional" | "fromEndpoint";
export interface RegionSpec {
  rule: RegionRule;               // optional: may be empty; fromEndpoint: parsed from the endpoint
  value?: string;                 // fixed: the region to sign with
  field?: string;                 // equals: the field whose value is the region
  signingOnly?: boolean;          // region is only used for signing
  default?: string;               // used when the person leaves it empty
}
export type ChecksumMode = "when_required" | "when_supported";
export interface ProviderBadge { label: string; tone: "info" | "neutral" | "warning" }
export interface ProviderGroupInfo { id: ProviderGroup; label: string }
export interface ProviderPreset {
  id: string;
  displayName: string;
  group: ProviderGroup;
  glyph: string;                  // two-letter mark, no logos
  popular: boolean;
  popularOrder: number | null;
  fields: ProviderField[];        // in display order; includes the access key and secret fields
  endpointTemplate: string | null;
  endpointTemplateByField?: Record<string, Record<string, string>>;
  region: RegionSpec;
  addressingStyle: AddressingStyle;
  addressingLocked: boolean;
  checksumMode: ChecksumMode;     // AWS SDK v3: requestChecksumCalculation
  bucketSuffix?: string;          // appended to the bucket name, e.g. "-{appId}" for Tencent COS
  sessionToken: boolean;
  badges?: ProviderBadge[];
  helpSteps: string[];
  scopedKeyAdvice: string;
  expectedHostPattern: string | null; // warn when the endpoint host does not match
  pasteHints: PasteHints;
}
/** Shape of providers.json. */
export interface ProvidersFile {
  $schema: string;
  groups: ProviderGroupInfo[];
  providers: ProviderPreset[];
}

export interface ConnectionProfile {
  id: string;
  name: string;                   // auto: "<Provider> · <bucket>", never asked in onboarding
  providerId: string;
  fields: Record<string, string>; // provider-specific values
  endpoint: string;               // resolved, https unless localhost
  region: string;
  addressingStyle: AddressingStyle;
  bucket?: string;
  /** T-7: the connection root (start folder), empty or ending in "/". Trash and the connection test live under it. */
  prefix?: string;
  access: "readWrite" | "readOnly"; // readOnly: write test got AccessDenied, list and read passed, person chose "Connect read-only"
  sessionTokenExpiresAt?: string; // ISO 8601; caps share-link expiry (see ShareLimits)
  credentials:
    | { storage: "memory"; accessKeyId: string; secretAccessKey: string; sessionToken?: string }
    | { storage: "encrypted"; cipher: "AES-GCM"; kdf: "PBKDF2"; iterations: number; salt: string; iv: string; data: string };
  createdAt: string;
  lastUsedAt?: string;
}

/** T-10: a connection without its keys. Safe for React state, stores and props; the keys stay in lib/storage/vault. */
export type ConnectionSummary = Omit<ConnectionProfile, "credentials">;

/** Keys for one connection. Held only inside lib/storage/vault; never in React state, stores or props. */
export interface Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export type TestStepId = "reach" | "cors" | "list" | "write" | "read" | "clean";
export type TestStatus = "pending" | "running" | "pass" | "fail" | "skipped";
export type TestFailure =
  | "cors"
  | "accessDenied"
  | "signatureDoesNotMatch"
  | "noSuchBucket"
  | "wrongRegion"
  | "network"
  | "mixedContent"
  /** T-9: a loopback or private-network endpoint and the browser denied local network access. */
  | "localNetworkDenied"
  | "unknown";
export interface ConnectionTestResult {
  steps: ConnectionTestStep[];
  /** readOnly: write step failed with AccessDenied while list and read passed. Offer "Connect read-only" (copy: ob.ro.*). */
  outcome: "ok" | "failed" | "readOnly";
}
export interface ConnectionTestStep {
  id: TestStepId;                 // copy keys: ob.step.<id>
  status: TestStatus;
  ms?: number;
  failure?: TestFailure;
  hint?: { suggestedRegion?: string; clockOffsetMinutes?: number };
}

export interface FolderItem {
  kind: "folder";
  key: string;                    // prefix, ends with "/"
  name: string;
  starred?: boolean;
}
export type FileKind = "image" | "video" | "audio" | "pdf" | "code" | "markdown" | "html" | "svg" | "archive" | "unknown";
export interface FileItem {
  kind: "file";
  key: string;
  name: string;
  size: number;                   // bytes; format with IEC units, one decimal
  lastModified: string;           // ISO 8601
  etag: string;
  contentType: string;
  fileKind: FileKind;
  starred?: boolean;
}

export type UploadStatus = "queued" | "running" | "paused" | "failed" | "done" | "needsFile" | "conflict";
export interface UploadTask {
  id: string;
  connectionId: string;
  bucket: string;
  key: string;
  size: number;
  status: UploadStatus;
  uploadId?: string;              // multipart upload id, persisted in IndexedDB
  partSize: number;
  partsDone: number[];            // finished part numbers
  bytesDone: number;
  error?: string;
  conflict?: "replace" | "keepBoth" | "skip";
  applyToAll?: boolean;
}

export type OperationKind = "move" | "rename" | "copy" | "trash" | "restore" | "deleteForever" | "emptyTrash";
export interface OperationJournalEntry {
  id: string;
  kind: OperationKind;
  connectionId: string;
  bucket: string;
  source: string;                 // key or prefix
  target?: string;
  total: number;
  done: number;
  status: "running" | "paused" | "interrupted" | "done" | "discarded";
  startedAt: string;
  updatedAt: string;
}

/** T-11: the journal's own fields (technical-spec 8) on top of the design's entry. */
export interface JournalEntry extends OperationJournalEntry {
  /** The provider endpoint: a memory-only connection has a new id every session, so a later session matches by endpoint and bucket (D-41). */
  endpoint: string;
  phase: "planning" | "copying" | "deleting" | "finished";
  /** The last source key whose object is fully processed, in key order: a resume lists from here. */
  cursor?: string;
  /** Objects that could not be processed; a resume tries them again. */
  failures?: { key: string; code: string }[];
  /** The entry this one reverses (Undo). */
  undoOf?: string;
}

export type ShareExpiry = "15m" | "30m" | "1h" | "1d" | "7d";
/** Longest allowed link life: min(7 days, time left on the session token). Choices longer than this are disabled. */
export interface ShareLimits { maxSeconds: number; reason: "presignLimit" | "sessionToken" }
export interface ShareLinkOptions {
  key: string;
  expiry: ShareExpiry;            // never longer than ShareLimits.maxSeconds
  confirmedNotRevocable: true;    // the UI must set this explicitly
}

export interface StarredItem { connectionId: string; bucket: string; key: string; kind: "file" | "folder"; addedAt: string }
export interface RecentItem { connectionId: string; bucket: string; key: string; name: string; fileKind: FileKind; openedAt: string }

export interface Settings {
  theme: Theme;
  density: Density;
  autoLockMinutes: 5 | 15 | 30 | 60 | 0; // 0 = never (discouraged; warn)
  confirmTrash: boolean;          // default false; Undo is always offered
  uploadConcurrency: 2 | 4 | 6 | 8;
  showHiddenFiles: boolean;
  view: "list" | "grid";
  sort: { by: "name" | "modified" | "size"; dir: "asc" | "desc" };
  coachTipsSeen: number;          // 0..3
}
