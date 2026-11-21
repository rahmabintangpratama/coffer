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
