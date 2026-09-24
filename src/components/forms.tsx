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
          autoComplete={props.autoComplete ?? "new-password"}
          defaultValue={props.defaultValue}
          className="input pr-16"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-500 hover:text-navy-900"
          aria-pressed={visible}
          data-testid={`${props.id}-toggle`}
        >
          {visible ? (props.hideLabel ?? "Hide") : (props.showLabel ?? "Show")}
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

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
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
