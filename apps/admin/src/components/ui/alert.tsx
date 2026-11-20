import type { ReactNode } from 'react';

type Tone = 'error' | 'info' | 'success';

const TONES: Record<Tone, string> = {
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  success: 'border-green-200 bg-green-50 text-green-900',
};

export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-md border px-3 py-2 text-sm ${TONES[tone]}`}
    >
      {children}
    </div>
  );
}
