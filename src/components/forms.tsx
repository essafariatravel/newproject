"use client";

import { useFormStatus } from "react-dom";
import { useActionState, useState } from "react";
import type { ReactNode } from "react";

/**
 * Password input with an explicit show/hide toggle and the platform policy
 * spelled out. Server-side validation is unchanged (and authoritative) — this
 * only makes the requirement visible and prevents typing mistakes.
 */
export function PasswordField(props: {
  id: string;
  name: string;
  label: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  autoComplete?: string;
  defaultValue?: string;
  hint?: string;
  className?: string;
  /** Localized affordance labels — the field must never mix languages. */
  showLabel?: string;
  hideLabel?: string;
}) {
  const [visible, setVisible] = useState(false);
  const minLength = props.minLength ?? 10;
  return (
    <div className={props.className}>
      <label className="label" htmlFor={props.id}>
        {props.label}
        {props.required ? " *" : ""}
      </label>
      <div className="relative">
        <input
          id={props.id}
          name={props.name}
          type={visible ? "text" : "password"}
          required={props.required}
          minLength={props.required ? minLength : undefined}
          maxLength={props.maxLength ?? 200}
          autoComplete={props.autoComplete ?? "new-password"}
          defaultValue={props.defaultValue}
          className="input pe-16"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute end-0 top-1/2 inline-flex min-h-11 -translate-y-1/2 items-center px-2 text-xs font-semibold text-slate-500 hover:text-navy-900"
          aria-pressed={visible}
          aria-label={visible ? (props.hideLabel ?? "Hide") : (props.showLabel ?? "Show")}
          aria-controls={props.id}
          data-testid={`${props.id}-toggle`}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{visible ? <path d="m3 3 18 18"/> : null}</svg>
          <span className="sr-only">{visible ? (props.hideLabel ?? "Hide") : (props.showLabel ?? "Show")}</span>
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        {props.hint ?? `At least ${minLength} characters.`}
      </p>
    </div>
  );
}

export interface ActionState {
  error?: string;
  success?: string;
}

export const initialActionState: ActionState = {};

/** Submit button with pending spinner state (works inside any <form>). */
export function SubmitButton(props: {
  children: ReactNode;
  className?: string;
  pendingLabel?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={props.name}
      value={props.value}
      disabled={pending || props.disabled}
      className={
        props.className ?? "btn-primary"
      }
    >
      {pending ? (
        <>
          <Spinner /> {props.pendingLabel ?? "Working…"}
        </>
      ) : (
        props.children
      )}
    </button>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

/**
 * Form wired to a `useActionState` server action with inline error/success
 * feedback. Children receive the current state.
 */
export function ActionForm(props: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode | ((state: ActionState) => ReactNode);
  className?: string;
  encType?: string;
  successRedirect?: string;
}) {
  const [state, formAction] = useActionState(props.action, initialActionState);
  return (
    <form action={formAction} className={props.className} encType={props.encType}>
      {typeof props.children === "function" ? props.children(state) : props.children}
    </form>
  );
}

export function FieldError({ message, id }: { message?: string; id?: string }) {
  if (!message) return null;
  return <p id={id} className="mt-1 text-base text-red-700">{message}</p>;
}

/** Destructive-action button with a browser confirm() guard. */
export function ConfirmButton(props: {
  message: string;
  className?: string;
  children: ReactNode;
  name?: string;
  value?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={props.name}
      value={props.value}
      title={props.title}
      disabled={pending}
      className={props.className}
      onClick={(e) => {
        if (!window.confirm(props.message)) e.preventDefault();
      }}
    >
      {props.children}
    </button>
  );
}
