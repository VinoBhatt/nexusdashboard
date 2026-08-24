import type { ReactNode } from "react";
import type { Listing } from "../../lib/marketplaceTypes";

/** A secondary-market listing card - identical between the retail and
 * corporate marketplace pages except for the action slot (retail buys
 * directly, corporate proposes a purchase subject to checker approval). */
export function SecondaryListingCard({ listing, action }: { listing: Listing; action: ReactNode }) {
  const returnPct = ((1 / listing.pricePerUnit - 1) * 100).toFixed(2);
  return (
    <div className="note">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h4>{listing.noteName ?? listing.facilityId}</h4>
          <small>
            Listing {listing.id} · {listing.repaymentStructure}
          </small>
        </div>
      </div>
      <div className="mini-metrics">
        <div>
          <span>Units available</span>
          <b>{listing.units.toLocaleString()}</b>
        </div>
        <div>
          <span>Price / unit</span>
          <b>RM {listing.pricePerUnit}</b>
        </div>
        <div>
          <span>Simulated Return</span>
          <b>{returnPct}%</b>
        </div>
      </div>
      <div className="sub" style={{ marginTop: 12 }}>
        {listing.issuerName} · {listing.ratePct}% p.a. · {listing.tenorDays} day(s)
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
        {action}
      </div>
    </div>
  );
}
