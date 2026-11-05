import { useMemo, useState } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from "recharts";
import { TrendingUp, TrendingDown, ChevronDown, ChevronRight, ArrowRight, Layers } from "lucide-react";

// ─── 모바일(폰) 전용 그룹 요약 화면 ─────────────────────────────────────────
// 데스크톱/태블릿 레이아웃은 App.jsx의 renderSummaryTab 그대로 유지하고,
// 768px 미만에서는 이 컴포넌트가 대신 렌더된다.
// 구성: 기준기간 → 그룹 KPI 4개 → 계열사별 카드(정렬 가능, 스파크라인) → 접이식 추이 차트

const TYPE_LABEL = {
  securities: "증권",
  asset_mgmt: "자산운용",
  savings_bank: "저축은행",
  vc: "VC",
  pe: "PE",
  capital: "캐피탈",
  npl: "NPL",
};

const UP = "#10b981";
const DOWN = "#ef4444";
const WARN = "#f59e0b";

// 간단한 SVG 스파크라인 (recharts 없이 가볍게)
const Sparkline = ({ values, color, width = 72, height = 26 }) => {
  const nums = (values || []).map((v) => (Number.isFinite(v) ? v : 0));
  if (nums.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...nums, 0);
  const max = Math.max(...nums, 0);
  const range = max - min || 1;
  const stepX = width / (nums.length - 1);
  const pts = nums.map((v, i) => [i * stepX, height - ((v - min) / range) * (height - 4) - 2]);
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const zeroY = height - ((0 - min) / range) * (height - 4) - 2;
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} style={{ overflow: "visible", flexShrink: 0 }}>
      {min < 0 && <line x1={0} x2={width} y1={zeroY} y2={zeroY} stroke="rgba(255,255,255,0.12)" strokeDasharray="2 2" />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.2} fill={color} />
    </svg>
  );
};

// 전기대비 증감 배지
const DeltaChip = ({ change, invert = false, size = 11 }) => {
  if (change === null || change === undefined || change === "0.0" || Number.isNaN(parseFloat(change))) {
    return <span style={{ fontSize: size, color: "#475569" }}>-</span>;
  }
  const v = parseFloat(change);
  const positive = v >= 0;
  const good = invert ? !positive : positive;
  const color = good ? UP : DOWN;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: size, fontWeight: 600, color }}>
      {positive ? <TrendingUp size={size} /> : <TrendingDown size={size} />}
      {Math.abs(v)}%
    </span>
  );
};

const MobileTooltip = ({ active, payload, label, fmt }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 10px", fontSize: 11 }}>
      <div style={{ color: "#94a3b8", marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color, display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 600 }}>{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function MobileSummary({
  companies,
  DATA,
  QS,
  periodMode,
  groupSummaryHistory,
  latestGroupData,
  prevGroupData,
  companyComparisons,
  onSelectCompany,
  onShowFull,
  fmt,
  pct,
}) {
  const [sortKey, setSortKey] = useState("default"); // default | profit | roe
  const [trendOpen, setTrendOpen] = useState(false);
  const [bsOpen, setBsOpen] = useState(false);

  const latestPeriod = QS[QS.length - 1];
  const prevPeriod = QS[QS.length - 2];
  const deltaLabel = periodMode === "quarter" ? "전분기 대비" : "전년 대비";

  const kpis = [
    { label: "자산총계", key: "자산총계", color: "#3b82f6" },
    { label: "자본총계", key: "자본총계", color: "#10b981" },
    { label: "영업수익", key: "영업수익", color: "#8b5cf6" },
    { label: "영업이익", key: "영업이익", color: "#f59e0b" },
  ];

  const sorted = useMemo(() => {
    const list = [...companyComparisons];
    if (sortKey === "profit") list.sort((a, b) => (b.latest.영업이익 || 0) - (a.latest.영업이익 || 0));
    if (sortKey === "roe") list.sort((a, b) => b.roeVal - a.roeVal);
    return list;
  }, [companyComparisons, sortKey]);

  const trendData = useMemo(
    () => groupSummaryHistory.map((r) => ({ period: r.period, 영업수익: r.영업수익, 영업이익: r.영업이익 })),
    [groupSummaryHistory]
  );
  const bsData = useMemo(
    () => groupSummaryHistory.map((r) => ({ period: r.period, 자산총계: r.자산총계, 부채총계: r.부채총계, 자본총계: r.자본총계 })),
    [groupSummaryHistory]
  );

  const sectionTitle = (text, extra) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{text}</span>
      {extra}
    </div>
  );

  return (
    <div className="animate-fade-in m-summary" style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* 기준 기간 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#94a3b8" }}>
        <span>
          <b style={{ color: "#f8fafc", fontWeight: 700 }}>{latestPeriod}</b> 기준 · 증감은 {deltaLabel}{prevPeriod ? ` (${prevPeriod})` : ""}
        </span>
        <span style={{ color: "#64748b" }}>단위: 억원</span>
      </div>

      {/* 그룹 합산 KPI 4개 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {kpis.map((k) => {
          const cur = latestGroupData[k.key] || 0;
          const prev = prevGroupData[k.key] || 0;
          return (
            <div key={k.key} className="m-kpi" style={{ "--company-color": k.color }}>
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>그룹 {k.label}</div>
              <div style={{ fontSize: 21, fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.03em", margin: "4px 0 2px", whiteSpace: "nowrap" }}>
                {fmt(cur)}
              </div>
              <DeltaChip change={prevGroupData[k.key] !== undefined ? pct(cur, prev) : null} />
            </div>
          );
        })}
      </div>

      {/* 계열사별 카드 */}
      <div>
        {sectionTitle(
          "계열사별 실적",
          <div className="m-seg">
            {[["default", "기본"], ["profit", "이익순"], ["roe", "ROE순"]].map(([v, label]) => (
              <button key={v} className={sortKey === v ? "active" : ""} onClick={() => setSortKey(v)}>{label}</button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sorted.map((c) => {
            const series = (DATA[c.id] || []).map((r) => r.영업이익 || 0);
            const profitChange = pct(c.latest.영업이익 || 0, c.prev.영업이익 || 0);
            const roeColor = c.roeVal >= 12 ? UP : c.roeVal >= 6 ? WARN : DOWN;
            return (
              <button
                key={c.id}
                className="m-card"
                style={{ "--company-color": c.color }}
                onClick={() => onSelectCompany(c.id)}
              >
                {/* 1행: 회사명 · 업종 · ROE · 화살표 */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: c.color, letterSpacing: "-0.01em" }}>{c.fullName}</span>
                  <span className="m-tag">{TYPE_LABEL[c.type] || ""}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8" }}>
                    ROE <b style={{ color: roeColor, fontWeight: 700 }}>{c.roeVal}%</b>
                  </span>
                  <ArrowRight size={13} color="#475569" />
                </div>

                {/* 2행: 핵심 수치 3개 + 스파크라인 */}
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginTop: 8 }}>
                  <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr", gap: 6 }}>
                    <div>
                      <div className="m-stat-label">영업이익</div>
                      <div className="m-stat-value" style={{ color: (c.latest.영업이익 || 0) < 0 ? DOWN : "#f8fafc" }}>
                        {fmt(c.latest.영업이익 || 0)}
                      </div>
                      <DeltaChip change={profitChange} size={10} />
                    </div>
                    <div>
                      <div className="m-stat-label">영업수익</div>
                      <div className="m-stat-value">{fmt(c.latest.영업수익 || 0)}</div>
                      <div style={{ fontSize: 10, color: "#475569" }}>&nbsp;</div>
                    </div>
                    <div>
                      <div className="m-stat-label">자본총계</div>
                      <div className="m-stat-value">{fmt(c.latest.자본총계 || 0)}</div>
                      <div style={{ fontSize: 10, color: "#64748b", whiteSpace: "nowrap" }}>부채비율 {c.debtRatioVal}%</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                    <Sparkline values={series} color={c.color} />
                    <span style={{ fontSize: 9, color: "#475569" }}>영업이익 추이</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* 합계 행 */}
        <div className="m-total">
          <span style={{ fontWeight: 700, color: "#e2e8f0" }}>합계 (8개사)</span>
          <span>영업이익 <b>{fmt(latestGroupData.영업이익 || 0)}</b></span>
          <span>ROE <b style={{ color: (latestGroupData.ROE || 0) >= 12 ? UP : (latestGroupData.ROE || 0) >= 6 ? WARN : DOWN }}>{latestGroupData.ROE || 0}%</b></span>
        </div>
      </div>

      {/* 접이식: 그룹 손익 추이 */}
      <div className="glass-panel m-collapse">
        <button className="m-collapse-head" onClick={() => setTrendOpen((o) => !o)}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Layers size={14} color="#8b5cf6" />
            그룹 합산 손익 추이
          </span>
          {trendOpen ? <ChevronDown size={16} color="#94a3b8" /> : <ChevronRight size={16} color="#94a3b8" />}
        </button>
        {trendOpen && (
          <div style={{ height: 190, padding: "4px 8px 8px 0" }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="period" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => fmt(v)} />
                <Tooltip content={<MobileTooltip fmt={fmt} />} />
                <Bar dataKey="영업수익" fill="rgba(139,92,246,0.55)" radius={[3, 3, 0, 0]} />
                <Line dataKey="영업이익" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2.5, fill: "#f59e0b" }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 접이식: 자산·부채·자본 추이 */}
      <div className="glass-panel m-collapse">
        <button className="m-collapse-head" onClick={() => setBsOpen((o) => !o)}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Layers size={14} color="#3b82f6" />
            그룹 합산 자산 · 부채 · 자본 추이
          </span>
          {bsOpen ? <ChevronDown size={16} color="#94a3b8" /> : <ChevronRight size={16} color="#94a3b8" />}
        </button>
        {bsOpen && (
          <div style={{ height: 190, padding: "4px 8px 8px 0" }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={bsData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="period" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => fmt(v)} />
                <Tooltip content={<MobileTooltip fmt={fmt} />} />
                <Line dataKey="자산총계" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line dataKey="부채총계" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                <Line dataKey="자본총계" stroke="#10b981" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* 전체 화면 보기 */}
      <button className="m-link" onClick={onShowFull}>
        전체 차트·표 보기 (데스크톱 레이아웃) <ArrowRight size={12} />
      </button>
    </div>
  );
}
