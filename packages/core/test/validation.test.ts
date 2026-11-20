import { describe, expect, it } from 'vitest';
import {
  codeFromDbMessage,
  confirmResolutionSchema,
  createIssueSchema,
  formatIssueNumber,
  parseIssueNumber,
} from '../src/index.js';

const base = {
  villageId: 'a0000000-0000-4000-8000-000000000001',
  categoryId: 'a0000000-0000-4000-8000-000000000002',
  title: 'Street light not working',
  clientRequestId: 'a0000000-0000-4000-8000-000000000003',
};

describe('createIssueSchema', () => {
  it('accepts GPS location', () => {
    expect(createIssueSchema.safeParse({ ...base, latitude: 16.5, longitude: 80.6 }).success).toBe(
      true,
    );
  });
  it('accepts a landmark without GPS', () => {
    expect(createIssueSchema.safeParse({ ...base, locationText: 'Near school' }).success).toBe(
      true,
    );
  });
  it('rejects missing location', () => {
    expect(createIssueSchema.safeParse(base).success).toBe(false);
  });
  it('rejects half a coordinate', () => {
    expect(
      createIssueSchema.safeParse({ ...base, latitude: 16.5, locationText: 'x school' }).success,
    ).toBe(false);
  });
  it('rejects too-short titles', () => {
    expect(
      createIssueSchema.safeParse({ ...base, title: 'abc', locationText: 'Near school' }).success,
    ).toBe(false);
  });
});

describe('confirmResolutionSchema', () => {
  const id = 'a0000000-0000-4000-8000-000000000004';
  it('requires a reason when not solved', () => {
    expect(
      confirmResolutionSchema.safeParse({ issueId: id, solved: false, expectedVersion: 3 }).success,
    ).toBe(false);
    expect(
      confirmResolutionSchema.safeParse({
        issueId: id,
        solved: false,
        reason: 'Still dark at night',
        expectedVersion: 3,
      }).success,
    ).toBe(true);
  });
});

describe('issue numbers and errors', () => {
  it('formats and parses issue numbers', () => {
    expect(formatIssueNumber('VLG', 2026, 124)).toBe('VLG-2026-00124');
    expect(parseIssueNumber('VLG-2026-00124')).toEqual({
      villageCode: 'VLG',
      year: 2026,
      seq: 124,
    });
    expect(parseIssueNumber('bad')).toBeNull();
  });
  it('maps database error prefixes', () => {
    expect(codeFromDbMessage('MV_FORBIDDEN: missing permission issue.verify')).toBe('FORBIDDEN');
    expect(codeFromDbMessage('MV_CONFLICT: changed')).toBe('CONFLICT');
    expect(codeFromDbMessage('something else')).toBe('UNKNOWN');
  });
});
