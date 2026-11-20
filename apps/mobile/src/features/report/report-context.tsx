import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as Crypto from 'expo-crypto';
import type { Category } from '@mana/services';
import { useReadyProfile } from '@/features/auth/session-provider';
import { hasProgress, newDraft, type ReportDraft } from './draft';
import { discardDraft, loadDraft, removePhotoFile, saveDraft } from './draft-store';
import { useCategories } from './use-categories';

type Phase = { kind: 'loading' } | { kind: 'ask_resume'; saved: ReportDraft } | { kind: 'editing' };

interface ReportValue {
  phase: Phase;
  draft: ReportDraft;
  category: Category | null;
  categories: ReturnType<typeof useCategories>;
  /** Applies a change and saves it on the phone straight away. */
  update(change: Partial<ReportDraft> | ((d: ReportDraft) => ReportDraft)): Promise<void>;
  resume(): void;
  startOver(): void;
  /** Deletes the draft and its photos. */
  discard(): void;
}

const ReportContext = createContext<ReportValue | null>(null);

export function ReportProvider({ children }: { children: ReactNode }) {
  const profile = useReadyProfile();
  const categories = useCategories();
  const fresh = useCallback(
    () =>
      newDraft({
        clientRequestId: Crypto.randomUUID(),
        userId: profile.id,
        villageId: profile.home_village_id ?? '',
        now: new Date(),
      }),
    [profile.id, profile.home_village_id],
  );
  const [draft, setDraft] = useState<ReportDraft>(fresh);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const draftRef = useRef(draft);

  useEffect(() => {
    let cancelled = false;
    void loadDraft(profile.id).then((saved) => {
      if (cancelled) return;
      if (saved && hasProgress(saved) && saved.villageId === profile.home_village_id) {
        setPhase({ kind: 'ask_resume', saved });
      } else {
        if (saved) discardDraft();
        setPhase({ kind: 'editing' });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [profile.id, profile.home_village_id]);

  const update = useCallback<ReportValue['update']>((change) => {
    const current = draftRef.current;
    const next = typeof change === 'function' ? change(current) : { ...current, ...change };
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    draftRef.current = stamped;
    setDraft(stamped);
    return saveDraft(stamped).catch(() => undefined);
  }, []);

  const value = useMemo<ReportValue>(() => {
    const category = categories.data?.find((c) => c.id === draft.categoryId) ?? null;
    return {
      phase,
      draft,
      category,
      categories,
      update,
      resume() {
        if (phase.kind !== 'ask_resume') return;
        draftRef.current = phase.saved;
        setDraft(phase.saved);
        setPhase({ kind: 'editing' });
      },
      startOver() {
        discardDraft();
        const d = fresh();
        draftRef.current = d;
        setDraft(d);
        setPhase({ kind: 'editing' });
      },
      discard() {
        for (const p of draftRef.current.photos) removePhotoFile(p.localUri);
        discardDraft();
        const d = fresh();
        draftRef.current = d;
        setDraft(d);
      },
    };
  }, [phase, draft, categories, update, fresh]);

  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>;
}

export function useReport(): ReportValue {
  const ctx = useContext(ReportContext);
  if (!ctx) throw new Error('useReport must be used inside ReportProvider');
  return ctx;
}
