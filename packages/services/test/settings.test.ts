import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VILLAGE_SETTINGS,
  canOfferPermission,
  categoryProblems,
  parseVillageSettings,
  villageSettingsProblems,
} from '../src/index';

describe('village settings', () => {
  it('fills in defaults and ignores junk', () => {
    expect(parseVillageSettings({})).toEqual(DEFAULT_VILLAGE_SETTINGS);
    expect(parseVillageSettings(null)).toEqual(DEFAULT_VILLAGE_SETTINGS);
    expect(
      parseVillageSettings({
        auto_close_days: 10,
        reminder_days: '4',
        default_issue_visibility: 'PRIVATE',
      }),
    ).toEqual({
      ...DEFAULT_VILLAGE_SETTINGS,
      autoCloseDays: 10,
      defaultIssueVisibility: 'PRIVATE',
    });
  });

  it('checks the same limits as the database', () => {
    expect(villageSettingsProblems(DEFAULT_VILLAGE_SETTINGS)).toBeNull();
    const bad = villageSettingsProblems({
      ...DEFAULT_VILLAGE_SETTINGS,
      autoCloseDays: 5,
      reminderDays: 5,
      similarIssueRadiusM: 20,
    });
    expect(Object.keys(bad ?? {}).sort()).toEqual(['reminderDays', 'similarIssueRadiusM']);
  });
});

describe('categories', () => {
  it('needs a code only when new', () => {
    expect(categoryProblems({ key: '', name: 'Parks' }, true)).toHaveProperty('key');
    expect(categoryProblems({ key: '', name: 'Parks' }, false)).toBeNull();
    expect(categoryProblems({ key: 'parks', name: 'P', icon: 'Tree!' }, true)).toEqual({
      name: 'Use 2 to 60 characters.',
      icon: 'Use a short lowercase name, like "water".',
    });
  });
});

describe('permission editor', () => {
  const perm = (category: string, citizenGrantable = false) => ({
    key: 'x.y',
    description: '',
    category,
    citizenGrantable,
  });
  const role = (key: string, scope: 'GLOBAL' | 'VILLAGE') => ({
    key,
    name: key,
    scope,
    permissions: [],
  });
  it('never offers changes to Super Admin, platform rights to village roles, or staff rights to residents', () => {
    expect(canOfferPermission(role('SUPER_ADMIN', 'GLOBAL'), perm('issues'))).toBe(false);
    expect(canOfferPermission(role('PRESIDENT', 'VILLAGE'), perm('platform'))).toBe(false);
    expect(canOfferPermission(role('CITIZEN', 'VILLAGE'), perm('issues', false))).toBe(false);
    expect(canOfferPermission(role('CITIZEN', 'VILLAGE'), perm('issues', true))).toBe(true);
    expect(canOfferPermission(role('SECRETARY', 'VILLAGE'), perm('config'))).toBe(true);
  });
});
