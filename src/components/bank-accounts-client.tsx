"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/forms";

export function CopyRibButton({
  rib, label, copiedLabel,
}: { rib: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(rib);
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
      aria-label={label}
    >
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
}

export function RemoveBankAccountForm({
  id, action, label, confirmMessage,
}: {
  id: string;
  action: (form: FormData) => Promise<void>;
  label: string;
  confirmMessage: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <SubmitButton className="btn-danger btn-sm" pendingLabel="…">{label}</SubmitButton>
    </form>
  );
}
