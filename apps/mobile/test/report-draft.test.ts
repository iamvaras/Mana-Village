import { describe, expect, it } from 'vitest';
import {
  effectiveTitle,
  hasProgress,
  newDraft,
  nextStep,
  parseDraft,
  stepProblem,
  type ReportDraft,
} from '../src/features/report/draft';

const ids = {
  req: '11111111-1111-4111-8111-111111111111',
  user: '22222222-2222-4222-8222-222222222222',
  village: '33333333-3333-4333-8333-333333333333',
  cat: '44444444-4444-4444-8444-444444444444',
  photo: '55555555-5555-4555-8555-555555555555',
};
const base = () =>
  newDraft({
    clientRequestId: ids.req,
    userId: ids.user,
    villageId: ids.village,
    now: new Date(0),
  });
const photo = {
  id: ids.photo,
  localUri: 'file:///p.jpg',
  width: 1600,
  height: 1200,
  uploaded: false,
};
const withPhotoCat = { id: ids.cat, photoRequired: true };

describe('report draft', () => {
  it('round-trips through storage and rejects garbage', () => {
    const d: ReportDraft = { ...base(), categoryId: ids.cat, photos: [photo], landmark: 'Temple' };
    expect(parseDraft(JSON.stringify(d))).toEqual(d);
    expect(parseDraft('{not json')).toBeNull();
    expect(parseDraft(JSON.stringify({ ...d, version: 2 }))).toBeNull();
    expect(parseDraft(null)).toBeNull();
  });

  it('knows when there is something to resume', () => {
    expect(hasProgress(base())).toBe(false);
    expect(hasProgress({ ...base(), categoryId: ids.cat })).toBe(true);
  });

  it('requires a photo only for categories that need one', () => {
    const d = { ...base(), categoryId: ids.cat };
    expect(stepProblem('photos', d, withPhotoCat)).toBe('add_photo');
    expect(stepProblem('photos', d, { id: ids.cat, photoRequired: false })).toBeNull();
    expect(stepProblem('photos', { ...d, photos: [photo] }, withPhotoCat)).toBeNull();
  });

  it('needs GPS or a landmark of at least 3 letters', () => {
    expect(stepProblem('location', base(), null)).toBe('add_location');
    expect(stepProblem('location', { ...base(), landmark: 'ab' }, null)).toBe('add_location');
    expect(stepProblem('location', { ...base(), landmark: 'Bus stop' }, null)).toBeNull();
    expect(
      stepProblem(
        'location',
        { ...base(), gps: { latitude: 16.5, longitude: 80.6, accuracyM: 12 } },
        null,
      ),
    ).toBeNull();
  });

  it('skips the similar-issues step when there is no GPS', () => {
    expect(nextStep('location', base())).toBe('details');
    expect(
      nextStep('location', { ...base(), gps: { latitude: 1, longitude: 2, accuracyM: null } }),
    ).toBe('similar');
    expect(nextStep('review', base())).toBe('review');
  });

  it('review checks every earlier step', () => {
    const ready: ReportDraft = {
      ...base(),
      categoryId: ids.cat,
      photos: [photo],
      landmark: 'Temple',
    };
    expect(stepProblem('review', ready, withPhotoCat)).toBeNull();
    expect(stepProblem('review', { ...ready, photos: [] }, withPhotoCat)).toBe('add_photo');
    expect(stepProblem('review', { ...ready, title: 'abc' }, withPhotoCat)).toBe('title_too_short');
  });

  it('builds a valid title when the resident leaves it empty', () => {
    expect(effectiveTitle({ ...base(), landmark: 'near temple' }, 'Garbage')).toBe(
      'Garbage – near temple',
    );
    expect(effectiveTitle(base(), 'ఇతర')).toBe('ఇతర (report)');
    expect(effectiveTitle({ ...base(), title: '  Broken pipe  ' }, 'Water')).toBe('Broken pipe');
    expect(effectiveTitle({ ...base(), landmark: 'x'.repeat(200) }, 'Road').length).toBe(120);
  });
});
