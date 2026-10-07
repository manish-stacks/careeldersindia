'use client';
import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={cn('control', className)} {...p} />);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn('control h-auto min-h-[88px] py-2 leading-6', className)} {...p} />
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => (
  <select ref={ref} className={cn('control appearance-none bg-[url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%278%27 viewBox=%270 0 12 8%27><path d=%27M1 1l5 5 5-5%27 stroke=%27%235B6470%27 stroke-width=%271.6%27 fill=%27none%27/></svg>")] bg-[right_12px_center] bg-no-repeat pr-9', className)} {...p}>
    {children}
  </select>
));
Select.displayName = 'Select';

export function Field({ label, hint, error, children, className, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={className}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? <p className="mt-1 text-sm text-danger">{error}</p> : hint ? <p className="mt-1 text-sm text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export function Checkbox({ label, checked, onChange, description }: { label: string; checked: boolean; onChange: (v: boolean) => void; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-[#C8352E]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="text-[15px] text-ink">{label}</span>
        {description && <span className="block text-sm text-ink-muted">{description}</span>}
      </span>
    </label>
  );
}
