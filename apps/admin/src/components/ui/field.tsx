import type { InputHTMLAttributes } from 'react';

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  hint?: string;
  error?: string | undefined;
  prefix?: string;
}

export function Field({ id, label, hint, error, prefix, className = '', ...rest }: FieldProps) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-neutral-800">
        {label}
      </label>
      <div
        className={`flex h-11 items-center rounded-md border bg-white focus-within:outline-2 focus-within:outline-brand-600 ${error ? 'border-red-500' : 'border-neutral-300'}`}
      >
        {prefix ? <span className="pl-3 text-neutral-600">{prefix}</span> : null}
        <input
          {...rest}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`h-full w-full rounded-md bg-transparent px-3 text-base outline-none ${className}`}
        />
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-neutral-600">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
