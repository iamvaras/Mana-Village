import { LIMITS, type Result, type TimelineRow } from '@mana/core';
import type { ManaClient } from './client';
import { required, run, validationError } from './errors';
import { attachmentsPayload, type UploadedPhoto } from './issues';
import type { IssuePhoto } from './issue-reads';
import { reasonProblem } from './workflow';

/** What the resident is shown when asked "Was it fixed?". */
export interface ResolutionSummary {
  /** The worker's note when they marked the work as done. */
  note: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  /** Completion photos from the latest round of work only. */
  photos: IssuePhoto[];
}

/** Picks the latest resolution out of the timeline and photos the resident can already see. */
export function resolutionSummary(
  timeline: readonly TimelineRow[],
  photos: readonly IssuePhoto[],
): ResolutionSummary {
  const at = (s: string) => Date.parse(s);
  const latest = (to: string, before?: number) =>
    timeline
      .filter((r) => r.eventType === 'STATUS_CHANGED' && r.toStatus === to)
      .filter((r) => before === undefined || at(r.occurredAt) <= before)
      .reduce<TimelineRow | undefined>(
        (best, r) => (!best || at(r.occurredAt) > at(best.occurredAt) ? r : best),
        undefined,
      );
  const resolved = latest('RESOLVED');
  // Completion photos of an earlier round (before the latest work start) are left out.
  const started = latest('IN_PROGRESS', resolved ? at(resolved.occurredAt) : undefined);
  return {
    note: resolved?.reason ?? null,
    resolvedAt: resolved?.occurredAt ?? null,
    resolvedByName: resolved?.actorName ?? null,
    photos: photos.filter(
      (p) => p.kind === 'COMPLETION' && (!started || at(p.createdAt) >= at(started.occurredAt)),
    ),
  };
}

export interface ResolutionService {
  /** The reporter says the problem is solved: the issue closes. */
  confirmSolved(issueId: string, version: number): Promise<Result<number>>;
  /** The reporter says it is not solved: the issue reopens. Reason required, photos optional. */
  reportNotSolved(
    issueId: string,
    version: number,
    reason: string,
    photos: readonly UploadedPhoto[],
  ): Promise<Result<number>>;
}

export function createResolutionService(client: ManaClient): ResolutionService {
  return {
    async confirmSolved(issueId, version) {
      return required(
        await run(() =>
          client.rpc('confirm_resolution', {
            p_issue_id: issueId,
            p_expected_version: version,
            p_solved: true,
            p_source: 'MOBILE',
          }),
        ),
      );
    },

    async reportNotSolved(issueId, version, reason, photos) {
      const problem = reasonProblem(reason);
      if (problem) return validationError({ reason: problem });
      if (photos.length > LIMITS.maxPhotosPerUpload)
        return validationError({ photos: `At most ${LIMITS.maxPhotosPerUpload} photos.` });
      return required(
        await run(() =>
          client.rpc('confirm_resolution', {
            p_issue_id: issueId,
            p_expected_version: version,
            p_solved: false,
            p_reason: reason.trim(),
            p_attachments: attachmentsPayload(photos),
            p_source: 'MOBILE',
          }),
        ),
      );
    },
  };
}
