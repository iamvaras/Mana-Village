/**
 * Staff "All Issues" list: the filters, saved views and sorting it supports, and
 * how they are read from / written to a URL. Pure functions; the query itself
 * runs in @mana/services and the database still decides what each person may see.
 */
import {
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  TERMINAL_STATUSES,
  type IssuePriority,
  type IssueStatus,
} from '../enums/index';

/** Saved views from docs/ui-ux.md §3. */
export const ISSUE_LIST_VIEWS = [
  'all',
  'open',
  'needs_review',
  'critical',
  'reopened',
  'awaiting_citizen',
] as const;
export type IssueListView = (typeof ISSUE_LIST_VIEWS)[number];

export const ISSUE_LIST_SORTS = ['newest', 'oldest', 'updated', 'priority', 'affected'] as const;
export type IssueListSort = (typeof ISSUE_LIST_SORTS)[number];

/** "Reported within the last N days". Relative ranges avoid time-zone surprises. */
export const REPORTED_WITHIN_DAYS = [7, 30, 90] as const;
export type ReportedWithinDays = (typeof REPORTED_WITHIN_DAYS)[number];

export const ISSUE_LIST_PAGE_SIZE = 25;
export const ISSUE_SEARCH_MAX_LENGTH = 80;

export interface IssueListQuery {
  view: IssueListView;
  status: IssueStatus | null;
  priority: IssuePriority | null;
  categoryId: string | null;
  departmentId: string | null;
  /** Matches the title or issue number. Already cleaned by `cleanSearch`. */
  search: string;
  hasSupporters: boolean;
  withinDays: ReportedWithinDays | null;
  sort: IssueListSort;
  /** 1-based. */
  page: number;
}

export const DEFAULT_ISSUE_LIST_QUERY: Readonly<IssueListQuery> = {
  view: 'all',
  status: null,
  priority: null,
  categoryId: null,
  departmentId: null,
  search: '',
  hasSupporters: false,
  withinDays: null,
  sort: 'newest',
  page: 1,
};

const OPEN_STATUSES: readonly IssueStatus[] = ISSUE_STATUSES.filter(
  (s) => !TERMINAL_STATUSES.includes(s),
);

/** Statuses a saved view is limited to (`null` = no limit). */
export function viewStatuses(view: IssueListView): readonly IssueStatus[] | null {
  switch (view) {
    case 'all':
      return null;
    case 'open':
    case 'critical':
      return OPEN_STATUSES;
    case 'needs_review':
      return ['SUBMITTED', 'UNDER_REVIEW'];
    case 'reopened':
      return ['REOPENED'];
    case 'awaiting_citizen':
      return ['RESOLVED'];
  }
}

/** Priority a saved view is limited to (`null` = no limit). */
export function viewPriority(view: IssueListView): IssuePriority | null {
  return view === 'critical' ? 'CRITICAL' : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Keeps letters (any script, incl. Telugu), digits, spaces and hyphens. Everything
 * else is removed so the text can never change the meaning of the database query.
 */
export function cleanSearch(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ISSUE_SEARCH_MAX_LENGTH)
    .trim();
}

type RawParams = Readonly<Record<string, string | readonly string[] | undefined>>;

function first(params: RawParams, key: string): string | undefined {
  const v = params[key];
  return typeof v === 'string' ? v : Array.isArray(v) ? (v as readonly string[])[0] : undefined;
}

function oneOf<T extends string>(list: readonly T[], v: string | undefined): T | null {
  return v !== undefined && (list as readonly string[]).includes(v) ? (v as T) : null;
}

/** Reads a query from URL search params. Unknown or invalid values fall back to defaults. */
export function parseIssueListQuery(params: RawParams): IssueListQuery {
  const d = DEFAULT_ISSUE_LIST_QUERY;
  const uuid = (k: string) => {
    const v = first(params, k);
    return v !== undefined && UUID_RE.test(v) ? v.toLowerCase() : null;
  };
  const days = Number(first(params, 'within'));
  const page = Number(first(params, 'page'));
  return {
    view: oneOf(ISSUE_LIST_VIEWS, first(params, 'view')) ?? d.view,
    status: oneOf(ISSUE_STATUSES, first(params, 'status')),
    priority: oneOf(ISSUE_PRIORITIES, first(params, 'priority')),
    categoryId: uuid('category'),
    departmentId: uuid('department'),
    search: cleanSearch(first(params, 'q') ?? ''),
    hasSupporters: first(params, 'supported') === '1',
    withinDays: (REPORTED_WITHIN_DAYS as readonly number[]).includes(days)
      ? (days as ReportedWithinDays)
      : null,
    sort: oneOf(ISSUE_LIST_SORTS, first(params, 'sort')) ?? d.sort,
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : d.page,
  };
}

/** The URL search string for a query; default values are left out. */
export function issueListQueryToSearch(
  query: IssueListQuery,
  changes: Partial<IssueListQuery> = {},
): string {
  const q = { ...query, ...changes };
  const p = new URLSearchParams();
  if (q.view !== 'all') p.set('view', q.view);
  if (q.status) p.set('status', q.status);
  if (q.priority) p.set('priority', q.priority);
  if (q.categoryId) p.set('category', q.categoryId);
  if (q.departmentId) p.set('department', q.departmentId);
  if (q.search) p.set('q', q.search);
  if (q.hasSupporters) p.set('supported', '1');
  if (q.withinDays) p.set('within', String(q.withinDays));
  if (q.sort !== 'newest') p.set('sort', q.sort);
  if (q.page > 1) p.set('page', String(q.page));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** True when the person has narrowed the list beyond the saved view. */
export function hasExtraFilters(q: IssueListQuery): boolean {
  return (
    q.status !== null ||
    q.priority !== null ||
    q.categoryId !== null ||
    q.departmentId !== null ||
    q.search !== '' ||
    q.hasSupporters ||
    q.withinDays !== null
  );
}

export function pageCount(total: number, pageSize = ISSUE_LIST_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
