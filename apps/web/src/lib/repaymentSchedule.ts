export type RepaymentStructure = "Bullet Principal, Monthly Profit" | "Bullet Principal & Profit" | "Monthly Principal & Profit";

export interface ScheduleRow {
  installmentNo: number;
  dueDate: string;
  principalDue: number;
  profitDue: number;
}

// Mirrors apps/api/src/lib/repaymentSchedule.ts's generateRepaymentSchedule -
// same three structures, same math - so any simulation shown here matches
// what the server would actually generate for this note.
export function simulateSchedule(principal: number, ratePct: number, tenorDays: number, structure: RepaymentStructure): ScheduleRow[] {
  const count = Math.max(1, Math.round(tenorDays / 30));
  const dueDateAt = (monthsAhead: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthsAhead);
    return d.toISOString().slice(0, 10);
  };

  if (structure === "Bullet Principal & Profit") {
    const totalProfit = +((principal * ratePct * tenorDays) / 100 / 365).toFixed(2);
    return Array.from({ length: count }).map((_, i) => {
      const isLast = i === count - 1;
      return {
        installmentNo: i + 1,
        dueDate: dueDateAt(i + 1),
        principalDue: isLast ? principal : 0,
        profitDue: isLast ? totalProfit : 0,
      };
    });
  }

  if (structure === "Monthly Principal & Profit") {
    const monthlyPrincipal = +(principal / count).toFixed(2);
    let balance = principal;
    return Array.from({ length: count }).map((_, i) => {
      const isLast = i === count - 1;
      const principalDue = isLast ? +balance.toFixed(2) : monthlyPrincipal;
      const profitDue = +((balance * ratePct) / 100 / 12).toFixed(2);
      balance -= principalDue;
      return { installmentNo: i + 1, dueDate: dueDateAt(i + 1), principalDue, profitDue };
    });
  }

  const monthlyProfit = +((principal * ratePct) / 100 / 12).toFixed(2);
  return Array.from({ length: count }).map((_, i) => ({
    installmentNo: i + 1,
    dueDate: dueDateAt(i + 1),
    principalDue: i === count - 1 ? principal : 0,
    profitDue: monthlyProfit,
  }));
}

export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export interface RecoveryStep {
  label: string;
  detail: string;
  date: string;
  current: boolean;
}

// Defaulted notes don't have a repayment schedule left to show - they have a
// recovery process instead. This is illustrative (a demo has no real legal
// case file to read from), but always reads as "as of today", not a fixed
// date that goes stale.
export function generateRecoveryTimeline(): RecoveryStep[] {
  const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const stages = [
    { offset: 75, label: "Payment Default Recorded", detail: "Facility flagged as in default after a missed scheduled repayment." },
    { offset: 60, label: "Formal Notice Issued", detail: "Written notice of default sent to the issuer." },
    { offset: 45, label: "Demand Letter Sent", detail: "Legal demand letter issued via appointed counsel." },
    { offset: 25, label: "Case Referred to Recovery Agency", detail: "Debt recovery agency engaged to pursue the outstanding amount." },
    { offset: 10, label: "Recovery in Progress", detail: "Negotiation and partial recovery efforts currently underway." },
  ];
  return stages.map((s, i) => ({
    label: s.label,
    detail: s.detail,
    date: daysAgo(s.offset),
    current: i === stages.length - 1,
  }));
}
