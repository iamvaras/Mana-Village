import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ISSUE_LIST_QUERY,
  cleanSearch,
  hasExtraFilters,
  issueListQueryToSearch,
  pageCount,
  parseIssueListQuery,
  viewPriority,
  viewStatuses,
} from '../src/index';

const CAT = '8f14e45f-ceea-4e7a-9a3b-0123456789ab';

describe('parseIssueListQuery', () => {
  it('returns defaults for empty params', () => {
    expect(parseIssueListQuery({})).toEqual(DEFAULT_ISSUE_LIST_QUERY);
  });

  it('reads every filter', () => {
    expect(
      parseIssueListQuery({
        view: 'critical',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        category: CAT.toUpperCase(),
        department: CAT,
        q: '  pothole  ',
        supported: '1',
        within: '30',
        sort: 'affected',
        page: '3',
      }),
    ).toEqual({
      view: 'critical',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      categoryId: CAT,
      departmentId: CAT,
      search: 'pothole',
      hasSupporters: true,
      withinDays: 30,
      sort: 'affected',
      page: 3,
    });
  });

  it('ignores invalid values', () => {
    const q = parseIssueListQuery({
      view: 'secret',
      status: 'DELETED',
      priority: 'urgent',
      category: "1' or 1=1",
      within: '5',
      sort: 'id',
      page: '-2',
    });
    expect(q).toEqual(DEFAULT_ISSUE_LIST_QUERY);
  });

  it('takes the first of repeated params', () => {
    expect(parseIssueListQuery({ status: ['CLOSED', 'SUBMITTED'] }).status).toBe('CLOSED');
  });
});

describe('cleanSearch', () => {
  it('keeps Telugu, digits and hyphens', () => {
    expect(cleanSearch('వీధి దీపం RMP-2026-00005')).toBe('వీధి దీపం RMP-2026-00005');
  });
  it('removes characters that could change the query', () => {
    expect(cleanSearch('a,b.or(id.eq.1)*%"\'\\')).toBe('a b or id eq 1');
  });
  it('limits the length', () => {
    expect(cleanSearch('x'.repeat(200))).toHaveLength(80);
  });
});

describe('issueListQueryToSearch', () => {
  it('leaves out defaults', () => {
    expect(issueListQueryToSearch(DEFAULT_ISSUE_LIST_QUERY)).toBe('');
  });
  it('round-trips through parse', () => {
    const q = parseIssueListQuery({ view: 'open', q: 'drain', within: '7', page: '2' });
    const search = issueListQueryToSearch(q);
    expect(parseIssueListQuery(Object.fromEntries(new URLSearchParams(search)))).toEqual(q);
  });
  it('applies changes', () => {
    expect(issueListQueryToSearch(DEFAULT_ISSUE_LIST_QUERY, { sort: 'oldest', page: 2 })).toBe(
      '?sort=oldest&page=2',
    );
  });
});

describe('saved views', () => {
  it('needs review = submitted or under review', () => {
    expect(viewStatuses('needs_review')).toEqual(['SUBMITTED', 'UNDER_REVIEW']);
  });
  it('critical = open and critical', () => {
    expect(viewStatuses('critical')).not.toContain('CLOSED');
    expect(viewPriority('critical')).toBe('CRITICAL');
  });
  it('all has no limit', () => {
    expect(viewStatuses('all')).toBeNull();
    expect(viewPriority('all')).toBeNull();
  });
});

describe('helpers', () => {
  it('hasExtraFilters', () => {
    expect(hasExtraFilters(DEFAULT_ISSUE_LIST_QUERY)).toBe(false);
    expect(hasExtraFilters({ ...DEFAULT_ISSUE_LIST_QUERY, hasSupporters: true })).toBe(true);
  });
  it('pageCount', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(25)).toBe(1);
    expect(pageCount(26)).toBe(2);
  });
});
