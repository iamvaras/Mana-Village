import { signOutAction } from './actions';

export function SignOutButton({ className = '' }: { className?: string }) {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className={`text-sm text-neutral-600 underline-offset-2 hover:underline ${className}`}
      >
        Sign out
      </button>
    </form>
  );
}
