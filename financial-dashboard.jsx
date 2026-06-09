import { useState } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line,
} from "recharts";

// ─── Config ─────────────────────────────────────────────────────────────────

const COMPANIES = [
  { id: "securities",    name: "증권",      color: "#2563eb", bg: "#eff6ff" },
  { id: "asset_mgmt",   name: "자산운용",   color: "#0891b2", bg: "#ecfeff" },
  { id: "savings_bank", name: "저축은행",   color: "#0d9488", bg: "#f0fdfa" },
  { id: "pe",           name: "PE",         color: "#7c3aed", bg: "#f5f3ff" },
  { id: "capital",      name: "캐피탈",     color: "#d97706", bg: "#fffbeb" },
  { id: "insurance",    name: "생명보험",   color: "#be185d", bg: "#fdf2f8" },
  { id: "re_trust",     name: "부동산신탁", color: "#15803d", bg: "#f0fdf4" },
  { id: "advisory",     name: "투자자문",   color: "#dc2626", bg: "#fef2f2" },
];

// ─── Data ────────────────────────────────────────────────────────────────────

const QS = ["23Q1","23Q2","23Q3","23Q4","24Q1","24Q2","24Q3","24Q4"];
const mk = (a, l, r, p) => QS.map((q, i) => ({
  period: q,
  자산총계: a[i], 부채총계: l[i], 자본총계: a[i] - l[i],
  영업수익: r[i], 영업이익: p[i],
}));

const DATA = {
  securities:   mk([31200,31800,32500,33100,33800,34200,34900,35600],[25800,26100,26800,27200,27600,28000,28500,29000],[1420,1380,1560,1780,1510,1490,1620,1850],[260,240,290,380,275,265,310,420]),
  asset_mgmt:   mk([4600,4750,4820,4980,5100,5230,5350,5480],[1150,1180,1200,1250,1280,1310,1340,1380],[205,198,218,245,212,208,225,260],[52,48,55,68,54,51,58,72]),
  savings_bank: mk([21000,21500,22100,22600,23000,23500,24000,24600],[18500,18900,19400,19800,20100,20500,21000,21500],[620,605,640,680,635,618,655,695],[95,88,105,125,98,92,110,132]),
  pe:           mk([7200,7380,7550,7800,7950,8100,8300,8500],[3900,3980,4050,4200,4280,4350,4450,4560],[365,342,388,420,375,358,395,445],[148,138,160,185,155,145,168,198]),
  capital:      mk([23500,24100,24600,25200,25800,26300,26900,27500],[20100,20600,21000,21500,22000,22400,22900,23400],[695,672,715,768,705,685,728,780],[118,110,128,148,122,115,132,155]),
  insurance:    mk([46500,47200,48000,48800,49500,50200,51000,51800],[40200,40800,41500,42200,42800,43400,44100,44800],[945,918,975,1045,958,935,985,1055],[195,182,210,245,202,192,218,258]),
  re_trust:     mk([2650,2720,2800,2890,2960,3020,3100,3180],[780,810,840,875,905,935,965,995],[138,132,145,160,142,136,150,168],[58,54,62,72,61,57,65,76]),
  advisory:     mk([920,942,968,995,1018,1042,1068,1095],[195,202,210,220,228,236,245,254],[46,44,49,55,48,46,51,57],[15,14,16,19,16,15,17,20]),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n) => n >= 10000 ? `${(n / 10000).toFixed(2)}조` : `${n.toLocaleString()}억`;
const fmtY = (n) => n >= 10000 ? `${(n / 10000).toFixed(1)}조` : `${n}억`;
const pct = (a, b) => ((a - b) / Math.abs(b) * 100).toFixed(1);
const margin = (r) => (r.영업이익 / r.영업수익 * 100).toFixed(1);
const debtRatio = (r) => (r.부채총계 / r.자본총계 * 100).toFixed(1);

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", fontSize: 13, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>
      <p style={{ fontWeight: 700, marginBottom: 6, color: "#0f172a", marginTop: 0 }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 2 }}>
          <span style={{ color: p.color, fontSize: 12 }}>{p.name}</span>
          <span style={{ fontWeight: 600, color: "#0f172a" }}>
            {typeof p.value === "number" && p.name.includes("률") ? `${p.value}%` : fmt(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

// ─── Section Card ─────────────────────────────────────────────────────────────

const Card = ({ title, children, style }) => (
  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", ...style }}>
    {title && (
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #f1f5f9", fontSize: 13, fontWeight: 600, color: "#374151" }}>
        {title}
      </div>
    )}
    {children}
  </div>
);

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function FinancialDashboard() {
  const [sel, setSel] = useState("securities");
  const [tab, setTab] = useState("bs");

  const company = COMPANIES.find((c) => c.id === sel);
  const data = DATA[sel];
  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const c = company.color;

  const ratioData = data.map((d) => ({
    period: d.period,
    영업이익률: +margin(d),
    부채비율: +debtRatio(d),
  }));

  const kpis =
    tab === "bs"
      ? [
          { label: "자산총계", value: fmt(last.자산총계), raw: last.자산총계, change: pct(last.자산총계, prev.자산총계) },
          { label: "부채총계", value: fmt(last.부채총계), raw: last.부채총계, change: pct(last.부채총계, prev.부채총계) },
          { label: "자본총계", value: fmt(last.자본총계), raw: last.자본총계, change: pct(last.자본총계, prev.자본총계) },
          { label: "부채비율", value: `${debtRatio(last)}%`, change: pct(+debtRatio(last), +debtRatio(prev)) },
        ]
      : [
          { label: "영업수익", value: fmt(last.영업수익), change: pct(last.영업수익, prev.영업수익) },
          { label: "영업이익", value: fmt(last.영업이익), change: pct(last.영업이익, prev.영업이익) },
          { label: "영업이익률", value: `${margin(last)}%`, change: pct(+margin(last), +margin(prev)) },
          { label: "전분기 영업수익", value: fmt(prev.영업수익), change: null, sub: true },
        ];

  return (
    <div style={{ fontFamily: "'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR',system-ui,sans-serif", background: "#f1f5f9", minHeight: "100vh" }}>

      {/* ── Header ── */}
      <div style={{ background: "#0f172a", padding: "18px 24px 14px" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.12em", color: "#475569", textTransform: "uppercase", marginBottom: 4 }}>
          Financial Group · 통합 실적 대시보드
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.02em" }}>
            금융계열사 실적 현황
          </span>
          <span style={{ fontSize: 12, color: "#64748b" }}>2023 Q1 – 2024 Q4 · 단위: 억원</span>
        </div>
      </div>

      {/* ── Company Tabs ── */}
      <div style={{ background: "#1e293b", overflowX: "auto", paddingLeft: 24 }}>
        <div style={{ display: "flex", minWidth: "max-content" }}>
          {COMPANIES.map((comp) => (
            <button
              key={comp.id}
              onClick={() => setSel(comp.id)}
              style={{
                padding: "11px 16px",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: sel === comp.id ? 700 : 400,
                background: "transparent",
                color: sel === comp.id ? comp.color : "#64748b",
                borderBottom: sel === comp.id ? `2.5px solid ${comp.color}` : "2.5px solid transparent",
                transition: "all 0.15s",
                whiteSpace: "nowrap",
                fontFamily: "inherit",
              }}
            >
              {comp.name}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div style={{ padding: "20px 16px 40px", maxWidth: 1400, margin: "0 auto" }}>

        {/* ── Title + Toggle ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: c, display: "inline-block" }} />
            <span style={{ fontSize: 17, fontWeight: 700, color: "#0f172a" }}>{company.name}</span>
            <span style={{ fontSize: 12, color: "#94a3b8", background: "#f1f5f9", padding: "3px 8px", borderRadius: 6 }}>
              최신: {last.period}
            </span>
          </div>
          <div style={{ display: "flex", background: "#e2e8f0", borderRadius: 8, padding: 3 }}>
            {[["bs", "재무상태표"], ["pl", "손익계산서"]].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setTab(v)}
                style={{
                  padding: "6px 14px", fontSize: 12, fontWeight: tab === v ? 700 : 400,
                  background: tab === v ? "#fff" : "transparent",
                  border: "none", borderRadius: 6, cursor: "pointer",
                  color: tab === v ? "#0f172a" : "#94a3b8",
                  boxShadow: tab === v ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  transition: "all 0.15s", fontFamily: "inherit",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 16 }}>
          {kpis.map((k) => (
            <div key={k.label} style={{
              background: "#fff", borderRadius: 10, padding: "14px 16px",
              borderTop: `3px solid ${k.sub ? "#e2e8f0" : c}`,
              border: "1px solid #e2e8f0", borderTopColor: k.sub ? "#e2e8f0" : c,
            }}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontWeight: 500, letterSpacing: "0.03em" }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: k.sub ? "#cbd5e1" : "#0f172a", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                {k.value}
              </div>
              {k.change !== null && k.change !== undefined && (
                <div style={{ fontSize: 11, marginTop: 6, color: parseFloat(k.change) >= 0 ? "#16a34a" : "#dc2626", fontWeight: 500 }}>
                  {parseFloat(k.change) >= 0 ? "▲" : "▼"} {Math.abs(k.change)}%
                  <span style={{ color: "#cbd5e1", marginLeft: 4 }}>전분기比</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Charts Row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12, marginBottom: 12 }}>

          {/* Chart 1: BS or PL */}
          <Card title={tab === "bs" ? "자산 · 부채 · 자본 추이" : "영업수익 · 영업이익 추이"}>
            <div style={{ padding: "16px 8px 12px" }}>
              <ResponsiveContainer width="100%" height={220}>
                {tab === "bs" ? (
                  <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={c} stopOpacity={0.18} />
                        <stop offset="95%" stopColor={c} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="period" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <YAxis tickFormatter={fmtY} tick={{ fontSize: 10, fill: "#94a3b8" }} width={52} />
                    <Tooltip content={<Tip />} />
                    <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                    <Area type="monotone" dataKey="자산총계" stroke={c} fill="url(#g1)" strokeWidth={2} dot={false} name="자산총계" />
                    <Area type="monotone" dataKey="부채총계" stroke="#f97316" fill="none" strokeWidth={1.5} strokeDasharray="5 3" dot={false} name="부채총계" />
                    <Area type="monotone" dataKey="자본총계" stroke="#22c55e" fill="none" strokeWidth={1.5} dot={false} name="자본총계" />
                  </AreaChart>
                ) : (
                  <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="period" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} width={52} tickFormatter={v => `${v}억`} />
                    <Tooltip content={<Tip />} />
                    <Legend iconType="square" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                    <Bar dataKey="영업수익" fill={c} fillOpacity={0.8} radius={[3, 3, 0, 0]} name="영업수익" />
                    <Bar dataKey="영업이익" fill="#22c55e" fillOpacity={0.85} radius={[3, 3, 0, 0]} name="영업이익" />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Chart 2: Ratio Trends */}
          <Card title={tab === "bs" ? "부채비율 · 영업이익률 추이" : "영업이익률 추이 (%)"}>
            <div style={{ padding: "16px 8px 12px" }}>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={ratioData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="period" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} width={40} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                  <Line type="monotone" dataKey="영업이익률" stroke="#22c55e" strokeWidth={2} dot={{ fill: "#22c55e", r: 3, strokeWidth: 0 }} name="영업이익률" />
                  {tab === "bs" && (
                    <Line type="monotone" dataKey="부채비율" stroke="#f97316" strokeWidth={2} dot={{ fill: "#f97316", r: 3, strokeWidth: 0 }} name="부채비율" strokeDasharray="5 3" />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* ── Quarterly Detail Table ── */}
        <Card title={`${company.name} 분기별 상세 데이터`} style={{ marginBottom: 12 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["기간", "자산총계", "부채총계", "자본총계", "부채비율", "영업수익", "영업이익", "이익률"].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: h === "기간" ? "left" : "right", color: "#64748b", fontWeight: 600, borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap", fontSize: 12 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...data].reverse().map((row, i) => {
                  const m = +margin(row);
                  const isLast = i === 0;
                  return (
                    <tr key={row.period} style={{ background: isLast ? company.bg : i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "9px 14px", fontWeight: 700, color: c, borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>{row.period}</td>
                      {[row.자산총계, row.부채총계, row.자본총계].map((v, j) => (
                        <td key={j} style={{ padding: "9px 14px", textAlign: "right", color: "#374151", borderBottom: "1px solid #f1f5f9", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>{fmt(v)}</td>
                      ))}
                      <td style={{ padding: "9px 14px", textAlign: "right", color: "#f97316", fontWeight: 600, borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>{debtRatio(row)}%</td>
                      {[row.영업수익, row.영업이익].map((v, j) => (
                        <td key={j} style={{ padding: "9px 14px", textAlign: "right", color: "#374151", borderBottom: "1px solid #f1f5f9", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>{fmt(v)}</td>
                      ))}
                      <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 700, borderBottom: "1px solid #f1f5f9", fontSize: 13, color: m >= 20 ? "#16a34a" : m >= 12 ? "#d97706" : "#dc2626" }}>
                        {m.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── All Companies Summary ── */}
        <Card title="계열사 전체 비교 (최신 분기 기준) · 행 클릭 시 상세 조회">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["계열사", "기간", "자산총계", "부채총계", "자본총계", "부채비율", "영업수익", "영업이익", "이익률"].map((h) => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: h === "계열사" || h === "기간" ? "left" : "right", color: "#64748b", fontWeight: 600, borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap", fontSize: 12 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPANIES.map((comp, i) => {
                  const d = DATA[comp.id];
                  const l = d[d.length - 1];
                  const m = +margin(l);
                  const isSelected = sel === comp.id;
                  return (
                    <tr
                      key={comp.id}
                      onClick={() => setSel(comp.id)}
                      style={{ background: isSelected ? comp.bg : i % 2 === 0 ? "#fff" : "#fafafa", cursor: "pointer", transition: "background 0.1s" }}
                    >
                      <td style={{ padding: "9px 14px", borderBottom: "1px solid #f1f5f9" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 9, height: 9, borderRadius: "50%", background: comp.color, flexShrink: 0, boxShadow: isSelected ? `0 0 0 2px ${comp.color}44` : "none" }} />
                          <span style={{ fontWeight: isSelected ? 700 : 500, color: comp.color }}>{comp.name}</span>
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px", color: "#94a3b8", fontSize: 12, borderBottom: "1px solid #f1f5f9" }}>{l.period}</td>
                      {[l.자산총계, l.부채총계, l.자본총계].map((v, j) => (
                        <td key={j} style={{ padding: "9px 14px", textAlign: "right", color: "#374151", borderBottom: "1px solid #f1f5f9", fontVariantNumeric: "tabular-nums" }}>{fmt(v)}</td>
                      ))}
                      <td style={{ padding: "9px 14px", textAlign: "right", color: "#f97316", fontWeight: 600, borderBottom: "1px solid #f1f5f9" }}>{debtRatio(l)}%</td>
                      {[l.영업수익, l.영업이익].map((v, j) => (
                        <td key={j} style={{ padding: "9px 14px", textAlign: "right", color: "#374151", borderBottom: "1px solid #f1f5f9", fontVariantNumeric: "tabular-nums" }}>{fmt(v)}</td>
                      ))}
                      <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 700, borderBottom: "1px solid #f1f5f9", color: m >= 20 ? "#16a34a" : m >= 12 ? "#d97706" : "#dc2626" }}>
                        {m.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}

                {/* Subtotal Row */}
                {(() => {
                  const totals = COMPANIES.reduce((acc, comp) => {
                    const l = DATA[comp.id][DATA[comp.id].length - 1];
                    return {
                      자산총계: acc.자산총계 + l.자산총계,
                      부채총계: acc.부채총계 + l.부채총계,
                      자본총계: acc.자본총계 + l.자본총계,
                      영업수익: acc.영업수익 + l.영업수익,
                      영업이익: acc.영업이익 + l.영업이익,
                    };
                  }, { 자산총계: 0, 부채총계: 0, 자본총계: 0, 영업수익: 0, 영업이익: 0 });
                  const m = +((totals.영업이익 / totals.영업수익) * 100).toFixed(1);
                  return (
                    <tr style={{ background: "#f8fafc", fontWeight: 700 }}>
                      <td style={{ padding: "10px 14px", color: "#0f172a", borderTop: "2px solid #e2e8f0" }} colSpan={2}>합 계</td>
                      {[totals.자산총계, totals.부채총계, totals.자본총계].map((v, j) => (
                        <td key={j} style={{ padding: "10px 14px", textAlign: "right", color: "#0f172a", borderTop: "2px solid #e2e8f0", fontVariantNumeric: "tabular-nums" }}>{fmt(v)}</td>
                      ))}
                      <td style={{ padding: "10px 14px", textAlign: "right", color: "#f97316", borderTop: "2px solid #e2e8f0" }}>
                        {((totals.부채총계 / totals.자본총계) * 100).toFixed(1)}%
                      </td>
                      {[totals.영업수익, totals.영업이익].map((v, j) => (
                        <td key={j} style={{ padding: "10px 14px", textAlign: "right", color: "#0f172a", borderTop: "2px solid #e2e8f0", fontVariantNumeric: "tabular-nums" }}>{fmt(v)}</td>
                      ))}
                      <td style={{ padding: "10px 14px", textAlign: "right", color: m >= 20 ? "#16a34a" : m >= 12 ? "#d97706" : "#dc2626", borderTop: "2px solid #e2e8f0" }}>
                        {m.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </Card>

      </div>
    </div>
  );
}
