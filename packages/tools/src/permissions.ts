export type PermissionCheckResult = {
  allowed: boolean;
  reason?: string;
};

export function checkToolPermission(
  toolName: string,
  toolPermissions: string[] | undefined,
  tenantFeatureFlags: Record<string, boolean> | undefined
): PermissionCheckResult {
  const flags = tenantFeatureFlags ?? {};

  if (flags.tools_enabled === false) {
    return { allowed: false, reason: 'Tools are disabled for this tenant' };
  }

  const toolFlag = flags[`tool_${toolName}`];
  if (toolFlag === false) {
    return { allowed: false, reason: `Tool '${toolName}' is disabled for this tenant` };
  }

  if (toolPermissions && toolPermissions.length > 0) {
    for (const permission of toolPermissions) {
      if (flags[permission] !== true) {
        return {
          allowed: false,
          reason: `Missing required permission: ${permission}`,
        };
      }
    }
  }

  return { allowed: true };
}
