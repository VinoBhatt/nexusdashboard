import type { ReactNode } from "react";
import { money } from "../../lib/money";
import type { Note } from "../../lib/marketplaceTypes";

/** A primary-market note card - identical between the retail and corporate
 * marketplace pages except for the action slot at the bottom (retail invests
 * directly, corporate proposes an investment subject to checker approval). */
export function PrimaryNoteCard({ note, action }: { note: Note; action: ReactNode }) {
  const outstandingBalance = note.principalAmount * (1 - note.fundingProgressPct / 100);
  return (
    <div className="note">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h4>{note.noteName ?? note.id}</h4>
          <small>
            Reference Number {note.id} · {note.financingType} · {note.repaymentStructure}
          </small>
        </div>
        <span className={`pill ${note.fundingProgressPct >= 100 ? "amber" : "blue"}`}>
          {note.fundingProgressPct >= 100 ? "Fully Funded" : "Open"}
        </span>
      </div>
      <div className="mini-metrics">
        <div>
          <span>Credit Risk Rating</span>
          <b>{note.riskTier}</b>
        </div>
        <div>
          <span>Profit Rate p.a.</span>
          <b>{note.ratePct}%</b>
        </div>
        <div>
          <span>Note Tenure</span>
          <b>{note.tenorDays} day(s)</b>
        </div>
        <div>
          <span>Financing Amount</span>
          <b>{money(note.principalAmount)}</b>
        </div>
        <div>
          <span>Outstanding Balance</span>
          <b>
            {money(outstandingBalance)} ({(100 - note.fundingProgressPct).toFixed(1)}%)
          </b>
        </div>
        <div>
          <span>Investment range</span>
          <b>
            RM {note.minInvestment} - {note.maxInvestment}
          </b>
        </div>
      </div>
      <div className="sub" style={{ marginTop: 12 }}>
        {note.issuerName}
        {note.campaignStart && note.campaignEnd ? ` · Campaign Period ${note.campaignStart} to ${note.campaignEnd}` : ""}
      </div>
      <div className="progress">
        <span style={{ width: `${note.fundingProgressPct}%` }} />
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
        {action}
      </div>
    </div>
  );
}
