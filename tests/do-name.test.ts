import { describe, expect, it } from 'vitest';
import { makeTenantObjectName } from '../packages/storage/src/do';

describe('makeTenantObjectName', () => {
  it('encodes tenant in durable object name', () => {
    expect(makeTenantObjectName('tenant-a', 'session-1')).toBe('tenant-a:session-1');
  });
});
