import { describe, it, expect } from 'vitest';
import { checkToolPermission } from '../packages/tools/src/permissions';

describe('checkToolPermission', () => {
  it('allows all tools by default (no flags)', () => {
    const result = checkToolPermission('summarize', undefined, undefined);
    expect(result.allowed).toBe(true);
  });

  it('allows all tools when flags are empty', () => {
    const result = checkToolPermission('summarize', undefined, {});
    expect(result.allowed).toBe(true);
  });

  it('denies when tools_enabled=false', () => {
    const result = checkToolPermission('summarize', undefined, {
      tools_enabled: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('disabled');
  });

  it('denies when tool_{name}=false', () => {
    const result = checkToolPermission('summarize', undefined, {
      tool_summarize: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('summarize');
  });

  it('denies when required permission flag is false', () => {
    const result = checkToolPermission('ingest_docs', ['can_ingest'], {
      can_ingest: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('can_ingest');
  });

  it('allows when all permission flags are true', () => {
    const result = checkToolPermission('ingest_docs', ['can_ingest'], {
      can_ingest: true,
    });
    expect(result.allowed).toBe(true);
  });

  it('denies required permissions when featureFlags is undefined (default-deny)', () => {
    const result = checkToolPermission('summarize', ['some_perm'], undefined);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('some_perm');
  });

  it('allows tools with no required permissions when featureFlags is undefined', () => {
    const result = checkToolPermission('summarize', undefined, undefined);
    expect(result.allowed).toBe(true);
  });

  it('allows when tools_enabled is true', () => {
    const result = checkToolPermission('summarize', undefined, {
      tools_enabled: true,
    });
    expect(result.allowed).toBe(true);
  });

  it('denies tool-specific flag even when tools_enabled is true', () => {
    const result = checkToolPermission('summarize', undefined, {
      tools_enabled: true,
      tool_summarize: false,
    });
    expect(result.allowed).toBe(false);
  });
});
