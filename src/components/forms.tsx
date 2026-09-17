"use client";

import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import type { ReactNode } from "react";

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
