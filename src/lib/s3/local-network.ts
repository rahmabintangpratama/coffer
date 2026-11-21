// From the module, not the package index, so the preset data (providers.json) is not pulled into this bundle.
import { addressSpaceOf, type AddressSpace } from "@/lib/providers/endpoint";

export { addressSpaceOf, type AddressSpace };

/**
 * Chrome (142 and later) and Edge ask the person before a page reaches a device
 * on their own network. The permission has two names: `loopback-network`
 * (localhost, 127.0.0.0/8, ::1) and `local-network` (private ranges and .local).
 * Safari and Firefox have no such prompt. A denied permission and a stopped
 * server look the same to fetch, so the state is read before and after.
 */
export type LocalNetworkPermission = "granted" | "prompt" | "denied" | "unsupported";

export type PermissionQuery = (name: string) => Promise<LocalNetworkPermission>;

export function permissionNameFor(space: AddressSpace): "loopback-network" | "local-network" | null {
  if (space === "loopback") return "loopback-network";
  return space === "local" ? "local-network" : null;
}

/** Ask the browser. Feature-detected: an older browser, or one that does not know the name, answers "unsupported". */
export const queryBrowserPermission: PermissionQuery = async (name) => {
  try {
    const permissions = (globalThis as { navigator?: { permissions?: { query?: (descriptor: { name: string }) => Promise<{ state: string }> } } }).navigator?.permissions;
    if (typeof permissions?.query !== "function") return "unsupported";
    const { state } = await permissions.query({ name });
    return state === "granted" || state === "prompt" || state === "denied" ? state : "unsupported";
  } catch {
    return "unsupported";
  }
};

/** The permission state for an endpoint, or "unsupported" when it is a public address or the browser cannot say. */
export async function localNetworkPermission(
  endpoint: string,
  query: PermissionQuery = queryBrowserPermission,
): Promise<LocalNetworkPermission> {
  let space: AddressSpace;
  try {
    space = addressSpaceOf(new URL(endpoint).hostname);
  } catch {
    return "unsupported";
  }
  const name = permissionNameFor(space);
  return name === null ? "unsupported" : query(name);
}
