export const makeTenantObjectName = (tenantId: string, objectId: string) =>
  `${tenantId}:${objectId}`;

export function getTenantDurableObject(
  namespace: DurableObjectNamespace,
  tenantId: string,
  objectId: string
): DurableObjectStub {
  const name = makeTenantObjectName(tenantId, objectId);
  return namespace.get(namespace.idFromName(name));
}
