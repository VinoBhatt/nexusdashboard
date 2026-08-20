export function generateInvestorRefNo(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

const REFERRAL_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity

export function generateReferralCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += REFERRAL_CHARS[Math.floor(Math.random() * REFERRAL_CHARS.length)];
  return code;
}
