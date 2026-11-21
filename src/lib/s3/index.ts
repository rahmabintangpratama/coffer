export { createClient, type ClientConfig } from "./client";
export { runConnectionTest, type ConnectionTestOptions, type ConnectionTestRun } from "./connection-test";
export {
  localNetworkPermission,
  permissionNameFor,
  queryBrowserPermission,
  type LocalNetworkPermission,
  type PermissionQuery,
} from "./local-network";
export { addressSpaceOf, needsLocalNetworkPermission, type AddressSpace } from "./local-network";
export { corsJson, corsRule, corsXml, type CorsRule } from "./cors";
export {
  AppError,
  isNetworkFailure,
  toAppError,
  type AppErrorCode,
  type ErrorHint,
} from "./errors";
export { attachmentDisposition } from "./disposition";
export { DOWNLOAD_SECONDS, presignDownload } from "./download";
export { decodeS3Key, fileKindOf, isHiddenName, keyByteLength, MAX_KEY_BYTES, nameOf, trashPrefixOf } from "./keys";
export { listPage, PAGE_SIZE, type ListPage, type ListPageOptions } from "./list";
export type { S3Client as S3Handle } from "@aws-sdk/client-s3";
export { headObject, type ObjectHead } from "./head";
export { clientFor } from "./connection-client";
export { existingKeys, HEAD_LIMIT, putFolder } from "./conflicts";
export { folderNameProblem, keepBothKey, keyProblem, type KeyProblem } from "./keys";
export { RequestPool } from "./pool";
export {
  abortUpload,
  MAX_OBJECT_BYTES,
  MAX_PARTS,
  MIB,
  MULTIPART_THRESHOLD,
  partSizeFor,
  uploadObject,
  type UploadBody,
  type UploadOptions,
  type UploadRecord,
  type UploadStateStore,
} from "./upload";
export { PREVIEW_SECONDS, presignView, readObject } from "./preview";
export { looksBinary, mimeOf, sniffKind } from "./keys";
export { COPY_SINGLE_LIMIT, copyObject, copyPartSizeFor, copySourceOf, type CopyOptions } from "./copy";
export { countUnder, listUnder, type ObjectInfo } from "./list-all";
export { OPERATION_CONCURRENCY, runOperation, targetKeyOf, verifies, type OperationOptions } from "./operations";
export { DELETE_BATCH, deleteKeys, deleteUnder, type DeleteFailure, type DeleteResult } from "./delete";
export { batchPrefixOf, batchTime, newBatchId, parseTrashKey, trashKeyOf, type TrashedKey } from "./trash";
