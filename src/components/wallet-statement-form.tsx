import { Card } from "@/components/ui";

/**
 * Wallet statement PDF — date-range picker (AGENCY_ADMIN only).
 * Submits a plain GET so the browser launches a real file download;
 * submit is JS-guarded against inverted ranges (server validates too).
 */
export function WalletStatementForm({ today, defaultFrom }: { today: string; defaultFrom: string }) {
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-navy-800">Download wallet statement (PDF)</h3>
      <p className="text-xs text-navy-400">
        Professional statement for a chosen period: opening balance, credits, debits and closing balance, derived directly
        from the immutable ledger.
      </p>
      <form
        method="get"
        action="/api/agency/wallet/statement"
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          const fd = new FormData(e.currentTarget);
          const from = String(fd.get("from") ?? "");
          const to = String(fd.get("to") ?? "");
          if (!from || !to) {
            e.preventDefault();
            alert("Please choose both a 'from' and a 'to' date.");
            return;
          }
          if (from > to) {
            e.preventDefault();
            alert("The 'from' date must not be after the 'to' date.");
          }
        }}
      >
        <div>
          <label htmlFor="wallet-stmt-from" className="mb-1 block text-xs font-medium text-navy-600">From</label>
          <input id="wallet-stmt-from" name="from" type="date" required defaultValue={defaultFrom} max={today} className="input" />
        </div>
        <div>
          <label htmlFor="wallet-stmt-to" className="mb-1 block text-xs font-medium text-navy-600">To</label>
          <input id="wallet-stmt-to" name="to" type="date" required defaultValue={today} max={today} className="input" />
        </div>
        <button type="submit" className="btn-primary px-4">Generate PDF</button>
      </form>
    </Card>
  );
}
