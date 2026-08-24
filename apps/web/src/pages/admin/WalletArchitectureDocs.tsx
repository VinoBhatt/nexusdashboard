import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { PageHeader } from "../../components/layout/PageHeader";

interface Wallet {
  id: string;
  userId: string;
  cifId: string;
  cifType: "INDIVIDUAL" | "CORPORATE" | "ISSUER";
  walletType: "INVESTOR" | "ISSUER";
  walletAddress: string;
  chainId: string;
  status: string;
  createdAt: string;
}

const TREE = `user_id (UUID v4)               — created at Barrier 1 signup
│                                 permanent root key, never changes
│
├── Individual investor CIF     — CIF ID = IC number
│   └── Wallet: wallet_type = INVESTOR
│
├── Corporate investor CIF      — CIF ID = company registration number
│   └── Wallet: wallet_type = INVESTOR
│
└── Issuer CIF                  — CIF ID = company registration number
    └── Wallet: wallet_type = ISSUER
    (same CIF as corporate investor if same company — different wallet address)`;

export default function WalletArchitectureDocs() {
  const { data } = useQuery({ queryKey: ["admin", "recent-wallets"], queryFn: () => apiGet<{ wallets: Wallet[] }>("/api/admin/recent-wallets") });

  return (
    <>
      <PageHeader title="Wallet & CIF Architecture" description="One user_id root, multiple CIFs, one wallet per activated sub-profile. Mock addresses in this demo - no real chain behind it." />
      <div className="card">
        <h3>Identity hierarchy</h3>
        <div className="tree">{TREE}</div>
        <div className="banner-notice" style={{ marginTop: 14 }}>
          <div>
            <b>Key rules:</b> user_id is never exposed to users · CIF IDs are assigned at Barrier 2, not signup · one user_id can bind multiple companies · the same company as investor + issuer shares a CIF but gets
            different wallet addresses.
          </div>
        </div>
      </div>
      <div className="card">
        <h3>Wallet lifecycle</h3>
        <ol style={{ fontSize: "12.5px", lineHeight: 2, paddingLeft: 18 }}>
          <li>Sub-profile activation → wallet row created with cif_id + wallet_type</li>
          <li>A mock address is generated (this demo has no real chain)</li>
          <li>Wallet address is stored against the user and shown here for reference</li>
          <li>
            Wallet types: <span className="pill blue">INVESTOR</span> <span className="pill">ISSUER</span>
          </li>
        </ol>
      </div>
      <div className="card">
        <h3>wallets table</h3>
        <div className="code-block">{`id UUID PK
user_id UUID FK → users
cif_id TEXT NOT NULL
cif_type ENUM('INDIVIDUAL','CORPORATE','ISSUER')
wallet_type ENUM('INVESTOR','ISSUER')
wallet_address TEXT UNIQUE
chain_id TEXT DEFAULT 'Arbitrum'
status ENUM('ACTIVE','FROZEN','CLOSED')
created_at TIMESTAMP`}</div>
      </div>
      <div className="card">
        <h3>Recently activated wallets</h3>
        <div className="table-wrap">
          <table className="table">
            <tbody>
              <tr>
                <th>CIF ID</th>
                <th>CIF type</th>
                <th>Wallet type</th>
                <th>Address</th>
                <th>Chain</th>
              </tr>
              {(data?.wallets ?? []).map((w) => (
                <tr key={w.id}>
                  <td className="mono">{w.cifId}</td>
                  <td>{w.cifType}</td>
                  <td>{w.walletType}</td>
                  <td className="mono">{w.walletAddress}</td>
                  <td>{w.chainId}</td>
                </tr>
              ))}
              {(data?.wallets ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="table-empty">
                    <div className="table-empty-icon" aria-hidden="true">
                      ⌀
                    </div>
                    No wallets activated yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
