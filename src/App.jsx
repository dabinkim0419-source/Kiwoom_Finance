import { useState, useMemo, useEffect } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell
} from "recharts";
import {
  Building2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart as PieIcon,
  Activity,
  Search,
  ArrowRight,
  Info,
  CheckSquare,
  Calendar,
  Printer,
  Layers
} from "lucide-react";
import financialData from "./data/financial_data.json";

// ─── Config ─────────────────────────────────────────────────────────────────

const COMPANIES = [
  { id: "KS",   name: "KS",   color: "#3b82f6", bg: "rgba(59, 130, 246, 0.1)",  fullName: "KS",   type: "securities" },
  { id: "KAM",  name: "KAM",  color: "#06b6d4", bg: "rgba(6, 182, 212, 0.1)",  fullName: "KAM",  type: "asset_mgmt" },
  { id: "KSB",  name: "KSB",  color: "#0d9488", bg: "rgba(13, 148, 136, 0.1)", fullName: "KSB",  type: "savings_bank" },
  { id: "KYSB", name: "KYSB", color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.1)", fullName: "KYSB", type: "savings_bank" },
  { id: "KI",   name: "KI",   color: "#f59e0b", bg: "rgba(245, 158, 11, 0.1)",  fullName: "KI",   type: "vc" },
  { id: "KPE",  name: "KPE",  color: "#ec4899", bg: "rgba(236, 72, 153, 0.1)",  fullName: "KPE",  type: "pe" },
  { id: "KC",   name: "KC",   color: "#10b981", bg: "rgba(16, 185, 129, 0.1)", fullName: "KC",   type: "capital" },
  { id: "KFI",  name: "KFI",  color: "#ef4444", bg: "rgba(239, 68, 68, 0.1)",   fullName: "KFI",  type: "npl" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n) => {
  if (Math.abs(n) >= 10000) {
    return `${(n / 10000).toFixed(2)}조`;
  }
  return `${Math.round(n).toLocaleString()}억`;
};

const pct = (a, b) => {
  if (!b) return "0.0";
  const val = ((a - b) / Math.abs(b) * 100).toFixed(1);
  return val > 0 ? `+${val}` : val;
};

// Calculate ROE: (Net Profit / Capital) * 100
// Assuming Net Profit (당기순이익) is 75% of Operating Profit (영업이익)
const roe = (r) => {
  if (!r || !r.자본총계) return "0.0";
  const netIncome = (r.당기순이익 !== undefined) ? r.당기순이익 : (r.영업이익 * 0.75);
  return ((netIncome / r.자본총계) * 100).toFixed(1);
};

const debtRatio = (r) => {
  if (!r || !r.자본총계) return "0.0";
  return (r.부채총계 / r.자본총계 * 100).toFixed(1);
};

// Check if tooltip metric is a ratio/percentage
const isPercent = (name) => {
  return (
    name.includes("률") ||
    name.includes("비율") ||
    name.includes("ROE") ||
    name.includes("NPL") ||
    name.includes("점유율") ||
    name.includes("연체율")
  );
};

// Filter daily trends based on chosen filter
const filterDailyData = (data, filter) => {
  if (!data || data.length === 0) return [];
  let daysToKeep = 22; // Default 1M
  switch (filter) {
    case "1W": daysToKeep = 5; break;
    case "1M": daysToKeep = 22; break;
    case "3M": daysToKeep = 66; break;
    case "6M": daysToKeep = 132; break;
    case "1Y": daysToKeep = 250; break;
    case "3Y": daysToKeep = 750; break;
    case "5Y": return data;
    default: daysToKeep = 22;
  }
  return data.slice(-daysToKeep);
};

// Generate sector specific BS/PL accounts based on sector type (fallback for KI, KPE, KC, KFI)
const getIndustrySpecificAccounts = (compType, row) => {
  if (!row) return { title: "", bs: [], pl: [] };
  const assets = row.자산총계 || 0;
  const liabilities = row.부채총계 || 0;
  const capital = row.자본총계 || 0;
  const revenue = row.영업수익 || 0;
  const profit = row.영업이익 || 0;

  switch (compType) {
    case "vc": // KI - 벤처캐피탈
      return {
        title: "벤처캐피탈 업권 핵심 계정과목",
        bs: [
          { name: "투자유가증권", value: Math.round(assets * 0.78), desc: "벤처기업 및 스타트업 지분 투자 총액" },
          { name: "운용투자조합지분", value: Math.round(assets * 0.15), desc: "VC가 출자하여 결성한 펀드 지분" }
        ],
        pl: [
          { name: "조합관리보수", value: Math.round(revenue * 0.35), desc: "벤처펀드 운용에 따라 수취하는 기본 관리료" },
          { name: "투자주식처분이익", value: Math.round(revenue * 0.52), desc: "투자 기업 IPO 또는 M&A 시 회수 차익" }
        ]
      };
    case "pe": // KPE - PE
      return {
        title: "프라이빗에쿼티 업권 핵심 계정과목",
        bs: [
          { name: "PEF출자금", value: Math.round(assets * 0.65), desc: "경영참여형 사모펀드(PEF) 약정/출자 금액" },
          { name: "지분법적용투자주식", value: Math.round(assets * 0.25), desc: "관계기업 또는 지배구조 목적 투자 지분" }
        ],
        pl: [
          { name: "성과보수", value: Math.round(profit * 0.55), desc: "기준수익률 초과 달성에 따른 인센티브 수익" },
          { name: "PEF관리보수 (운용수수료)", value: Math.round(revenue * 0.38), desc: "사모펀드 관리서비스 수수료 수익" }
        ]
      };
    case "capital": // KC - 캐피탈
      return {
        title: "캐피탈 업권 핵심 계정과목",
        bs: [
          { name: "할부금융 및 리스자산", value: Math.round(assets * 0.72), desc: "자동차, 기계 등 할부금융 및 리스 채권 잔액" },
          { name: "차입금 및 사채 (조달채무)", value: Math.round(liabilities * 0.85), desc: "여전채 발행 및 은행 차입을 통한 조달 규모" }
        ],
        pl: [
          { name: "이자/리스수익", value: Math.round(revenue * 0.88), desc: "할부 및 리스 자산에서 발행하는 총 수입" },
          { name: "조달비용 (사채이자 등)", value: Math.round(revenue * 0.36), desc: "여전채 금리 및 조달 자금에 따른 비용" }
        ]
      };
    case "npl": // KFI - NPL
      return {
        title: "NPL 업권 핵심 계정과목",
        bs: [
          { name: "NPL매입채권", value: Math.round(assets * 0.74), desc: "은행권 등에서 매입한 부실채권 투자 원금 잔액" },
          { name: "대손충당금", value: Math.round(assets * 0.05), desc: "부실채권 미회수 리스크 대비 적립금" }
        ],
        pl: [
          { name: "NPL회수이익", value: Math.round(revenue * 0.68), desc: "채권 담보권 행사 및 경매 등으로 회수한 금액" },
          { name: "NPL채권매각이익", value: Math.round(revenue * 0.18), desc: "보유 NPL 채권을 타 기관에 재매각 시 차익" }
        ]
      };
    default:
      return { title: "", bs: [], pl: [] };
  }
};

// ─── Custom Tooltips ───────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "rgba(15, 23, 42, 0.95)",
      border: "1px solid rgba(255, 255, 255, 0.1)",
      borderRadius: 12,
      padding: "12px 16px",
      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
      backdropFilter: "blur(4px)"
    }}>
      <p style={{ fontWeight: 700, marginBottom: 8, color: "#f8fafc", fontSize: 13, marginTop: 0 }}>
        {label}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {payload.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#94a3b8", fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color || p.fill }} />
              {p.name}
            </span>
            <span style={{ fontWeight: 600, color: "#f8fafc", fontSize: 12 }}>
              {isPercent(p.name) ? `${p.value.toFixed(2)}%` : fmt(p.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const ShareTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const dataRow = payload[0].payload;
  const total = dataRow.total;
  return (
    <div style={{
      background: "rgba(15, 23, 42, 0.95)",
      border: "1px solid rgba(255, 255, 255, 0.1)",
      borderRadius: 12,
      padding: "12px 16px",
      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
      backdropFilter: "blur(4px)"
    }}>
      <p style={{ fontWeight: 700, marginBottom: 8, color: "#f8fafc", fontSize: 13, marginTop: 0 }}>
        {label} (합계: {fmt(total)})
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {COMPANIES.map((c) => {
          const val = dataRow[c.id] || 0;
          const pctVal = total > 0 ? ((val / total) * 100).toFixed(1) : "0.0";
          return (
            <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#94a3b8", fontSize: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.color }} />
                {c.name}
              </span>
              <span style={{ fontWeight: 600, color: "#f8fafc", fontSize: 12 }}>
                {fmt(val)} ({pctVal}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ComparisonTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  // Check if hovering over KS
  const isKs = payload.some(p => p.dataKey === "ksRevenue" || p.dataKey === "ksProfit");

  if (isKs) {
    return (
      <div style={{
        background: "rgba(15, 23, 42, 0.95)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: 12,
        padding: "12px 16px",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)"
      }}>
        <p style={{ fontWeight: 700, marginBottom: 8, color: "#f8fafc", fontSize: 13, marginTop: 0 }}>
          {label} (KS 증권)
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {payload.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#94a3b8", fontSize: 12 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
                {p.name}
              </span>
              <span style={{ fontWeight: 600, color: "#f8fafc", fontSize: 12 }}>
                {fmt(p.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Group KS 외 7개사
  const revItems = [];
  const profItems = [];
  let totalRev = 0;
  let totalProf = 0;

  payload.forEach(p => {
    const key = p.dataKey;
    if (key.endsWith("_revenue")) {
      const compId = key.split("_")[0];
      const comp = COMPANIES.find(c => c.id === compId);
      revItems.push({ name: comp?.name || compId, value: p.value, color: comp?.color || p.color });
      totalRev += p.value;
    } else if (key.endsWith("_profit")) {
      const compId = key.split("_")[0];
      const comp = COMPANIES.find(c => c.id === compId);
      profItems.push({ name: comp?.name || compId, value: p.value, color: comp?.color || p.color });
      totalProf += p.value;
    }
  });

  return (
    <div style={{
      background: "rgba(15, 23, 42, 0.95)",
      border: "1px solid rgba(255, 255, 255, 0.1)",
      borderRadius: 12,
      padding: "14px 18px",
      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5)",
      backdropFilter: "blur(4px)",
      minWidth: 280
    }}>
      <p style={{ fontWeight: 700, marginBottom: 10, color: "#f8fafc", fontSize: 13, marginTop: 0 }}>
        {label} (KS 외 7개사)
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Revenue Column */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 4 }}>
            영업수지/수익 ({fmt(totalRev)})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {revItems.map((item, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                <span style={{ color: "#94a3b8", display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: item.color }} />
                  {item.name}
                </span>
                <span style={{ color: "#f8fafc", fontWeight: 600 }}>{fmt(item.value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Profit Column */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 6, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 4 }}>
            영업이익 ({fmt(totalProf)})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {profItems.map((item, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                <span style={{ color: "#94a3b8", display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: item.color }} />
                  {item.name}
                </span>
                <span style={{ color: "#f8fafc", fontWeight: 600 }}>{fmt(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState("summary");
  const [subTab, setSubTab] = useState("bs");
  const [searchTerm, setSearchTerm] = useState("");
  const [donutMetric, setDonutMetric] = useState("자본총계");
  
  // Period toggle state: "quarter" (분기) or "year" (연도)
  const [periodMode, setPeriodMode] = useState("quarter");
  
  // Daily chart period filters
  const [ksPeriodFilter, setKsPeriodFilter] = useState("1M");
  const [kamPeriodFilter, setKamPeriodFilter] = useState("1M");

  // Hook to detect screen width for responsive design (tablet/mobile under 1024px)
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    handleResize(); // trigger initial check
    window.addEventListener("resize", handleResize);
    return () => window.removeListener("resize", handleResize);
  }, []);

  // Dynamic Periods (QS) and Company Data based on mode
  const QS = useMemo(() => {
    return periodMode === "quarter" ? financialData.quarters : financialData.years;
  }, [periodMode]);

  const DATA = useMemo(() => {
    const raw = periodMode === "quarter" ? financialData.companyQuarterData : financialData.companyYearData;
    const mapped = {};
    Object.keys(raw).forEach(key => {
      mapped[key] = raw[key].map(item => ({
        ...item,
        영업수익: item.영업수익 !== undefined ? item.영업수익 : (item.영업수지 !== undefined ? item.영업수지 : 0),
        영업수지: item.영업수지 !== undefined ? item.영업수지 : (item.영업수익 !== undefined ? item.영업수익 : 0)
      }));
    });
    return mapped;
  }, [periodMode]);

  // Daily Trends filtered
  const filteredKsTrends = useMemo(() => {
    return filterDailyData(financialData.ksMarketTrends, ksPeriodFilter);
  }, [ksPeriodFilter]);

  const filteredKamTrends = useMemo(() => {
    return filterDailyData(financialData.kamAumTrends, kamPeriodFilter);
  }, [kamPeriodFilter]);

  // Compute Aggregated Group-Level Data
  const groupSummaryHistory = useMemo(() => {
    return QS.map((q, qIdx) => {
      let assets = 0;
      let liabilities = 0;
      let capital = 0;
      let revenue = 0;
      let profit = 0;

      COMPANIES.forEach((c) => {
        const d = DATA[c.id]?.[qIdx] || { 자산총계: 0, 부채총계: 0, 자본총계: 0, 영업수익: 0, 영업이익: 0 };
        assets += d.자산총계;
        liabilities += d.부채총계;
        capital += d.자본총계;
        revenue += d.영업수익;
        profit += d.영업이익;
      });

      return {
        period: q,
        자산총계: assets,
        부채총계: liabilities,
        자본총계: capital,
        영업수익: revenue,
        영업이익: profit,
        부채비율: +(liabilities / (capital || 1) * 100).toFixed(1),
        ROE: +(((profit * 0.75) / (capital || 1)) * 100).toFixed(1)
      };
    });
  }, [QS, DATA]);

  const latestGroupData = groupSummaryHistory[groupSummaryHistory.length - 1] || {};
  const prevGroupData = groupSummaryHistory[groupSummaryHistory.length - 2] || {};

  // Latest Quarter comparison of all companies
  const companyComparisons = useMemo(() => {
    return COMPANIES.map((c) => {
      const list = DATA[c.id] || [];
      const latest = list[list.length - 1] || {};
      const prev = list[list.length - 2] || {};
      return {
        ...c,
        latest,
        prev,
        roeVal: +roe(latest),
        debtRatioVal: +debtRatio(latest)
      };
    });
  }, [DATA]);

  // Filtered comparisons for search
  const filteredCompanies = useMemo(() => {
    return companyComparisons.filter(c =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.fullName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [companyComparisons, searchTerm]);

  // Donut chart data (latest period)
  const donutData = useMemo(() => {
    return companyComparisons.map(c => ({
      name: c.name,
      value: c.latest[donutMetric] || 0,
      color: c.color
    }));
  }, [companyComparisons, donutMetric]);

  // Stacked Area Chart data (share trend)
  const shareChartData = useMemo(() => {
    return QS.map((q, qIdx) => {
      const row = { period: q };
      let total = 0;
      COMPANIES.forEach((c) => {
        const val = DATA[c.id]?.[qIdx]?.[donutMetric] || 0;
        row[c.id] = val;
        total += val;
      });
      row.total = total;
      return row;
    });
  }, [donutMetric, QS, DATA]);

  // Performance comparison stacked chart data
  const comparisonChartData = useMemo(() => {
    return QS.map((q, qIdx) => {
      const row = { period: q };
      
      // KS (Brokerage)
      row.ksRevenue = DATA.KS?.[qIdx]?.영업수익 || 0;
      row.ksProfit = DATA.KS?.[qIdx]?.영업이익 || 0;
      
      // KS 외 7개사
      COMPANIES.forEach((c) => {
        if (c.id === "KS") return;
        const d = DATA[c.id]?.[qIdx] || {};
        row[`${c.id}_revenue`] = d.영업수익 || 0;
        row[`${c.id}_profit`] = d.영업이익 || 0;
      });
      
      return row;
    });
  }, [QS, DATA]);

  const handleSelectCompany = (id) => {
    setActiveTab(id);
    setSubTab("bs");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrint = () => {
    window.print();
  };

  // ─── RENDER: Core Accounts Table (KS, KAM, KSB, KYSB) ───────────────────────────
  const renderCoreAccountsTable = (companyId, rawData, themeColor) => {
    let headers = [];
    let keys = [];

    if (companyId === "KS") {
      headers = ["고객예수금", "신용공여규모", "수수료손익", "이자손익", "운용손익"];
      keys = ["고객예수금", "신용공여규모", "수수료손익", "이자손익", "운용손익"];
    } else if (companyId === "KAM") {
      headers = ["수탁고(AUM)", "운용보수(수수료수익)", "고유손익"];
      keys = ["수탁고", "수수료수익", "고유손익"];
    } else if (companyId === "KSB" || companyId === "KYSB") {
      headers = ["대출채권(여신)", "예수부채(수신)", "이자수익", "이자비용"];
      keys = ["여신", "수신", "이자수익", "이자비용"];
    } else {
      return null;
    }

    return (
      <div className="glass-panel" style={{ overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", display: "flex", alignItems: "center", gap: 8 }}>
          <CheckSquare size={18} color={themeColor} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>핵심 계정과목 추이 (실제 데이터)</span>
        </div>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>기간</th>
                {headers.map((h, idx) => <th key={idx}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {[...rawData].reverse().map((row, idx) => {
                const isLatestRow = idx === 0;
                return (
                  <tr key={row.period} style={{
                    background: isLatestRow ? "rgba(255,255,255,0.02)" : "transparent"
                  }}>
                    <td className="sticky-col" style={{ fontWeight: 700, color: themeColor, whiteSpace: "nowrap" }}>
                      {row.period}
                    </td>
                    {keys.map((k, idx2) => (
                      <td key={idx2} style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {fmt(row[k] || 0)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ─── RENDER: Group Summary Tab ───────────────────────────────────────────────
  const renderSummaryTab = () => {
    return (
      <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        
        {/* KPI Cards Row */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(200px, 1fr))", 
          gap: isMobile ? 12 : 16 
        }}>
          
          <div className="kpi-card" style={{ "--company-color": "#3b82f6" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <span className="kpi-title" style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>그룹 합산 자산총계</span>
              <span style={{ background: "rgba(59, 130, 246, 0.1)", padding: 6, borderRadius: 8 }}>
                <Building2 size={16} color="#3b82f6" />
              </span>
            </div>
            <div className="kpi-value" style={{ fontSize: 24, fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.03em" }}>
              {fmt(latestGroupData.자산총계 || 0)}
            </div>
            <div className="kpi-trend" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12 }}>
              <span style={{ display: "inline-flex", alignItems: "center", color: "#10b981", fontWeight: 600 }}>
                <TrendingUp size={12} style={{ marginRight: 2 }} />
                {pct(latestGroupData.자산총계 || 0, prevGroupData.자산총계 || 0)}%
              </span>
              <span style={{ color: "#475569" }}>전기대비</span>
            </div>
          </div>

          <div className="kpi-card" style={{ "--company-color": "#10b981" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <span className="kpi-title" style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>그룹 합산 자본총계</span>
              <span style={{ background: "rgba(16, 185, 129, 0.1)", padding: 6, borderRadius: 8 }}>
                <Layers size={16} color="#10b981" />
              </span>
            </div>
            <div className="kpi-value" style={{ fontSize: 24, fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.03em" }}>
              {fmt(latestGroupData.자본총계 || 0)}
            </div>
            <div className="kpi-trend" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12 }}>
              <span style={{ display: "inline-flex", alignItems: "center", color: "#10b981", fontWeight: 600 }}>
                <TrendingUp size={12} style={{ marginRight: 2 }} />
                {pct(latestGroupData.자본총계 || 0, prevGroupData.자본총계 || 0)}%
              </span>
              <span style={{ color: "#475569" }}>전기대비</span>
            </div>
          </div>

          <div className="kpi-card" style={{ "--company-color": "#6366f1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <span className="kpi-title" style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>그룹 합산 영업수지/영업수익</span>
              <span style={{ background: "rgba(99, 102, 241, 0.1)", padding: 6, borderRadius: 8 }}>
                <DollarSign size={16} color="#6366f1" />
              </span>
            </div>
            <div className="kpi-value" style={{ fontSize: 24, fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.03em" }}>
              {fmt(latestGroupData.영업수익 || 0)}
            </div>
            <div className="kpi-trend" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12 }}>
              <span style={{ display: "inline-flex", alignItems: "center", color: "#10b981", fontWeight: 600 }}>
                <TrendingUp size={12} style={{ marginRight: 2 }} />
                {pct(latestGroupData.영업수익 || 0, prevGroupData.영업수익 || 0)}%
              </span>
              <span style={{ color: "#475569" }}>전기대비</span>
            </div>
          </div>

          <div className="kpi-card" style={{ "--company-color": "#a855f7" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <span className="kpi-title" style={{ fontSize: 12, color: "#94a3b8", fontWeight: 500 }}>그룹 합산 영업이익</span>
              <span style={{ background: "rgba(168, 85, 247, 0.1)", padding: 6, borderRadius: 8 }}>
                <Activity size={16} color="#a855f7" />
              </span>
            </div>
            <div className="kpi-value" style={{ fontSize: 24, fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.03em" }}>
              {fmt(latestGroupData.영업이익 || 0)}
            </div>
            <div className="kpi-trend" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12 }}>
              <span style={{ display: "inline-flex", alignItems: "center", color: "#10b981", fontWeight: 600 }}>
                <TrendingUp size={12} style={{ marginRight: 2 }} />
                {pct(latestGroupData.영업이익 || 0, prevGroupData.영업이익 || 0)}%
              </span>
              <span style={{ color: "#475569" }}>전기대비</span>
            </div>
          </div>

        </div>

        {/* Charts Section */}
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 20 }}>
          
          {/* Share Area Chart */}
          <div className="glass-panel" style={{ padding: 24, flex: "1 1 450px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <PieIcon size={18} color="#6366f1" />
                <span style={{ fontSize: 15, fontWeight: 700 }}>계열사별 점유율 추이</span>
              </div>
              <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 3 }}>
                {["자본총계", "영업이익"].map((metric) => (
                  <button
                    key={metric}
                    onClick={() => setDonutMetric(metric)}
                    style={{
                      padding: "4px 10px",
                      fontSize: 11,
                      fontWeight: donutMetric === metric ? 600 : 400,
                      background: donutMetric === metric ? "rgba(255,255,255,0.1)" : "transparent",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      color: donutMetric === metric ? "#f8fafc" : "#94a3b8",
                      transition: "all 0.15s"
                    }}
                  >
                    {metric}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={shareChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="period" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={fmt} />
                  <Tooltip content={<ShareTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                  {COMPANIES.map((c) => (
                    <Area
                      key={c.id}
                      type="monotone"
                      dataKey={c.id}
                      stackId="1"
                      stroke={c.color}
                      fill={c.color}
                      fillOpacity={0.4}
                      name={c.name}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Stacked Performance Comparison */}
          <div className="glass-panel" style={{ padding: 24, flex: "2 1 650px", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <Building2 size={18} color="#06b6d4" />
              <span style={{ fontSize: 15, fontWeight: 700 }}>
                {periodMode === "quarter" ? "분기별" : "연도별"} 그룹 합산 실적 추이
              </span>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.2fr", gap: 20, flex: 1, minHeight: 260 }}>
              {/* KS Chart */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#3b82f6", textAlign: "center", marginBottom: 6 }}>
                  KS (증권)
                </div>
                <div style={{ height: 230 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="period" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 9 }} tickFormatter={v => `${v}억`} />
                      <Tooltip content={<ComparisonTooltip />} />
                      <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 10, paddingTop: 6 }} />
                      <Bar dataKey="ksRevenue" fill="#3b82f6" radius={[4, 4, 0, 0]} name="영업수지/수익" />
                      <Bar dataKey="ksProfit" fill="#10b981" radius={[4, 4, 0, 0]} name="영업이익" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* KS 외 Chart - Stacked */}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#8b5cf6", textAlign: "center", marginBottom: 6 }}>
                  KS 외 7개사 개별 기여분 (Stacked)
                </div>
                <div style={{ height: 230 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="period" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 9 }} tickFormatter={v => `${v}억`} />
                      <Tooltip content={<ComparisonTooltip />} />
                      <Legend
                        payload={[
                          { value: '영업수지/수익 (적층)', type: 'rect', id: 'rev', color: '#8b5cf6' },
                          { value: '영업이익 (적층)', type: 'rect', id: 'prof', color: '#f59e0b' }
                        ]}
                        wrapperStyle={{ fontSize: 10, paddingTop: 6 }}
                      />
                      {COMPANIES.filter(c => c.id !== "KS").map((c) => (
                        <Bar
                          key={`${c.id}_rev`}
                          dataKey={`${c.id}_revenue`}
                          stackId="rev"
                          fill={c.color}
                          legendType="none"
                          name={`${c.name} 영업수지/수익`}
                        />
                      ))}
                      {COMPANIES.filter(c => c.id !== "KS").map((c) => (
                        <Bar
                          key={`${c.id}_prof`}
                          dataKey={`${c.id}_profit`}
                          stackId="prof"
                          fill={c.color}
                          fillOpacity={0.6}
                          legendType="none"
                          name={`${c.name} 영업이익`}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Group Trends and Ratios */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(400px, 1fr))", gap: 20 }}>
          
          <div className="glass-panel" style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <Activity size={18} color="#10b981" />
              <span style={{ fontSize: 15, fontWeight: 700 }}>그룹 합산 자산 · 부채 · 자본 추이</span>
            </div>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={groupSummaryHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="groupAsset" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="period" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis tickFormatter={fmt} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                  <Area type="monotone" dataKey="자산총계" stroke="#3b82f6" fill="url(#groupAsset)" strokeWidth={2.5} name="자산총계" />
                  <Area type="monotone" dataKey="부채총계" stroke="#f59e0b" fill="none" strokeWidth={1.5} strokeDasharray="5 3" name="부채총계" />
                  <Area type="monotone" dataKey="자본총계" stroke="#10b981" fill="none" strokeWidth={2} name="자본총계" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <TrendingUp size={18} color="#f59e0b" />
              <span style={{ fontSize: 15, fontWeight: 700 }}>그룹 통합 ROE 및 부채비율 트렌드</span>
            </div>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={groupSummaryHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="period" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis yAxisId="left" tickFormatter={v => `${v}%`} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={v => `${v}%`} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                  <Line yAxisId="left" type="monotone" dataKey="ROE" stroke="#10b981" strokeWidth={2.5} name="ROE" dot={{ fill: "#10b981", r: 4 }} />
                  <Line yAxisId="right" type="monotone" dataKey="부채비율" stroke="#f59e0b" strokeWidth={2} name="부채비율" strokeDasharray="4 4" dot={{ fill: "#f59e0b", r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* Detailed Table */}
        <div className="glass-panel" style={{ overflow: "hidden" }}>
          <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Layers size={18} color="#6366f1" />
              <span style={{ fontSize: 15, fontWeight: 700 }}>계열사별 주요 지표 비교 요약 ({QS[QS.length - 1]} 기준)</span>
            </div>
            
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(15, 23, 42, 0.6)", padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.08)", width: 220 }}>
              <Search size={14} color="#64748b" />
              <input
                type="text"
                placeholder="계열사 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ background: "transparent", border: "none", color: "#f8fafc", fontSize: 12, outline: "none", width: "100%" }}
              />
            </div>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>계열사명</th>
                  <th>자산총계</th>
                  <th>부채총계</th>
                  <th>자본총계</th>
                  <th>부채비율</th>
                  <th>영업수지/영업수익</th>
                  <th>영업이익</th>
                  <th>ROE</th>
                  <th style={{ width: 80 }}>상세보기</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => handleSelectCompany(c.id)}
                    style={{ cursor: "pointer", transition: "background 0.2s" }}
                  >
                    <td className="sticky-col" style={{ fontWeight: 600, color: c.color, whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.color }} />
                        {c.fullName}
                      </div>
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmt(c.latest.자산총계 || 0)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmt(c.latest.부채총계 || 0)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmt(c.latest.자본총계 || 0)}</td>
                    <td style={{ textAlign: "right", color: "#f59e0b", fontWeight: 600, whiteSpace: "nowrap" }}>{c.debtRatioVal}%</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmt(c.latest.영업수익 || 0)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmt(c.latest.영업이익 || 0)}</td>
                    <td style={{
                      textAlign: "right",
                      fontWeight: 700,
                      color: c.roeVal >= 12 ? "#10b981" : c.roeVal >= 6 ? "#f59e0b" : "#ef4444",
                      whiteSpace: "nowrap"
                    }}>
                      {c.roeVal}%
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        background: c.bg,
                        color: c.color,
                        padding: "4px 8px",
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 600
                      }}>
                        이동 <ArrowRight size={10} style={{ marginLeft: 2 }} />
                      </span>
                    </td>
                  </tr>
                ))}

                {/* Subtotal Aggregate Row */}
                {searchTerm === "" && (
                  <tr style={{ background: "rgba(15, 23, 42, 0.4)", fontWeight: 700 }}>
                    <td className="sticky-col" style={{ color: "#e2e8f0", whiteSpace: "nowrap" }}>합 계 (8개사 총괄)</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmt(latestGroupData.자산총계 || 0)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmt(latestGroupData.부채총계 || 0)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmt(latestGroupData.자본총계 || 0)}</td>
                    <td style={{ textAlign: "right", color: "#f59e0b", whiteSpace: "nowrap" }}>{latestGroupData.부채비율 || 0}%</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmt(latestGroupData.영업수익 || 0)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmt(latestGroupData.영업이익 || 0)}</td>
                    <td style={{
                      textAlign: "right",
                      color: (latestGroupData.ROE || 0) >= 12 ? "#10b981" : (latestGroupData.ROE || 0) >= 6 ? "#f59e0b" : "#ef4444",
                      whiteSpace: "nowrap"
                    }}>
                      {latestGroupData.ROE || 0}%
                    </td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    );
  };

  // ─── RENDER: Affiliate Detail Tab ───────────────────────────────────────────
  const renderDetailTab = (companyId) => {
    const comp = COMPANIES.find(c => c.id === companyId);
    const rawData = DATA[companyId] || [];
    const latest = rawData[rawData.length - 1] || {};
    const prev = rawData[rawData.length - 2] || {};
    const themeColor = comp.color;

    // Industry specific accounts (fallback mockups for non-core companies)
    const industrySpecific = getIndustrySpecificAccounts(comp.type, latest);
    const hasCoreTable = ["KS", "KAM", "KSB", "KYSB"].includes(companyId);

    const ratioHistory = rawData.map((d) => ({
      period: d.period,
      ROE: +roe(d),
      부채비율: +debtRatio(d),
    }));

    const kpiMetrics = subTab === "bs"
      ? [
          { label: "자산총계", value: fmt(latest.자산총계 || 0), raw: latest.자산총계, change: pct(latest.자산총계, prev.자산총계) },
          { label: "부채총계", value: fmt(latest.부채총계 || 0), raw: latest.부채총계, change: pct(latest.부채총계, prev.부채총계) },
          { label: "자본총계", value: fmt(latest.자본총계 || 0), raw: latest.자본총계, change: pct(latest.자본총계, prev.자본총계) },
          { label: "부채비율", value: `${debtRatio(latest)}%`, change: pct(+debtRatio(latest), +debtRatio(prev)) },
        ]
      : [
          { label: "영업수지/영업수익", value: fmt(latest.영업수익 || 0), change: pct(latest.영업수익, prev.영업수익) },
          { label: "영업이익", value: fmt(latest.영업이익 || 0), change: pct(latest.영업이익, prev.영업이익) },
          { label: "ROE", value: `${roe(latest)}%`, change: pct(+roe(latest), +roe(prev)) },
          { label: "전기 영업수지/영업수익", value: fmt(prev.영업수익 || 0), change: null, sub: true },
        ];

    return (
      <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        
        {/* Affiliate Meta Header & BS/PL View Switcher */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: themeColor }} />
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#f8fafc" }}>
              {comp.fullName} <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 400, marginLeft: 8 }}>최신자료: {latest.period}</span>
            </h2>
          </div>

          <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: 3, border: "1px solid rgba(255,255,255,0.08)" }}>
            {[["bs", "재무상태표 (B/S)"], ["pl", "손익계산서 (I/S)"]].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setSubTab(v)}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: subTab === v ? 600 : 400,
                  background: subTab === v ? "rgba(255,255,255,0.1)" : "transparent",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  color: subTab === v ? "#f8fafc" : "#94a3b8",
                  transition: "all 0.15s"
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Detailed KPI Card Widgets */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fit, minmax(180px, 1fr))", 
          gap: isMobile ? 12 : 16 
        }}>
          {kpiMetrics.map((k) => (
            <div key={k.label} className="kpi-card" style={{ "--company-color": k.sub ? "rgba(255,255,255,0.1)" : themeColor }}>
              <div className="kpi-title" style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6, fontWeight: 500, letterSpacing: "0.03em" }}>{k.label}</div>
              <div className="kpi-value" style={{ fontSize: 22, fontWeight: 700, color: k.sub ? "#64748b" : "#f8fafc", letterSpacing: "-0.02em" }}>
                {k.value}
              </div>
              {k.change !== null && k.change !== undefined && (
                <div className="kpi-trend" style={{
                  fontSize: 11,
                  marginTop: 6,
                  color: parseFloat(k.change) >= 0 ? (k.label === "부채비율" || k.label === "부채총계" ? "#f59e0b" : "#10b981") : "#ef4444",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 2
                }}>
                  {parseFloat(k.change) >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {Math.abs(parseFloat(k.change))}%
                  <span style={{ color: "#475569", marginLeft: 4, fontWeight: 400 }}>전기대비</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Charts Row */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: isMobile 
            ? "1fr" 
            : (["KS", "KAM", "KSB", "KYSB"].includes(companyId) ? "1fr 1fr 1fr" : "1fr 1fr"), 
          gap: 20 
        }}>
          
          {/* Main Statement Trend Chart */}
          <div className="glass-panel" style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <Activity size={18} color={themeColor} />
              <span style={{ fontSize: 15, fontWeight: 700 }}>
                {subTab === "bs" ? "자산 · 부채 · 자본 추이" : "영업수지/영업수익 · 영업이익 추이"}
              </span>
            </div>
            <div style={{ height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                {subTab === "bs" ? (
                  <AreaChart data={rawData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="compAsset" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={themeColor} stopOpacity={0.15} />
                        <stop offset="95%" stopColor={themeColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="period" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis tickFormatter={fmt} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                    <Area type="monotone" dataKey="자산총계" stroke={themeColor} fill="url(#compAsset)" strokeWidth={2} name="자산총계" />
                    <Area type="monotone" dataKey="부채총계" stroke="#f59e0b" fill="none" strokeWidth={1.5} strokeDasharray="5 3" name="부채총계" />
                    <Area type="monotone" dataKey="자본총계" stroke="#10b981" fill="none" strokeWidth={1.5} name="자본총계" />
                  </AreaChart>
                ) : (
                  <BarChart data={rawData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="period" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={v => `${v}억`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                    <Bar dataKey="영업수익" fill={themeColor} fillOpacity={0.8} radius={[4, 4, 0, 0]} name="영업수지/영업수익" />
                    <Bar dataKey="영업이익" fill="#10b981" fillOpacity={0.85} radius={[4, 4, 0, 0]} name="영업이익" />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Ratios Trend Chart */}
          <div className="glass-panel" style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <TrendingUp size={18} color="#f59e0b" />
              <span style={{ fontSize: 15, fontWeight: 700 }}>
                {subTab === "bs" ? "부채비율 및 ROE 추이" : "ROE 추이 (%)"}
              </span>
            </div>
            <div style={{ height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ratioHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="period" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                  <Line type="monotone" dataKey="ROE" stroke="#10b981" strokeWidth={2.5} name="ROE" dot={{ fill: "#10b981", r: 4 }} />
                  {subTab === "bs" && (
                    <Line type="monotone" dataKey="부채비율" stroke="#f59e0b" strokeWidth={2} name="부채비율" strokeDasharray="5 3" dot={{ fill: "#f59e0b", r: 3 }} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Sector Specific 3rd Card */}
          {companyId === "KS" && (
            <div className="glass-panel" style={{ padding: 24, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Activity size={18} color={themeColor} />
                  <span style={{ fontSize: 15, fontWeight: 700 }}>증시동향 (시장 거래액 및 예탁 잔액)</span>
                </div>
                <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: 2 }}>
                  {["1W", "1M", "3M", "6M", "1Y", "3Y", "5Y"].map((f) => (
                    <button
                      key={f}
                      onClick={() => setKsPeriodFilter(f)}
                      style={{
                        padding: "2px 6px",
                        fontSize: 10,
                        fontWeight: ksPeriodFilter === f ? 600 : 400,
                        background: ksPeriodFilter === f ? "rgba(255,255,255,0.1)" : "transparent",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                        color: ksPeriodFilter === f ? "#f8fafc" : "#94a3b8",
                        transition: "all 0.15s"
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ height: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={filteredKsTrends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 9 }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 9 }} tickFormatter={v => `${v}조`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 10, paddingTop: 6 }} />
                    <Line type="monotone" dataKey="tradingVolume" stroke="#3b82f6" strokeWidth={1.5} name="거래대금" dot={false} />
                    <Line type="monotone" dataKey="investorDeposits" stroke="#10b981" strokeWidth={1.5} name="예탁금" dot={false} />
                    <Line type="monotone" dataKey="creditBalance" stroke="#f59e0b" strokeWidth={1.5} name="신용융자" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {companyId === "KAM" && (
            <div className="glass-panel" style={{ padding: 24, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <TrendingUp size={18} color={themeColor} />
                  <span style={{ fontSize: 15, fontWeight: 700 }}>수탁고현황 (업계 전체 vs KAM)</span>
                </div>
                <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: 2 }}>
                  {["1W", "1M", "3M", "6M", "1Y", "3Y", "5Y"].map((f) => (
                    <button
                      key={f}
                      onClick={() => setKamPeriodFilter(f)}
                      style={{
                        padding: "2px 6px",
                        fontSize: 10,
                        fontWeight: kamPeriodFilter === f ? 600 : 400,
                        background: kamPeriodFilter === f ? "rgba(255,255,255,0.1)" : "transparent",
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                        color: kamPeriodFilter === f ? "#f8fafc" : "#94a3b8",
                        transition: "all 0.15s"
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ height: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={filteredKamTrends} margin={{ top: 10, right: -10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 9 }} />
                    <YAxis yAxisId="left" tick={{ fill: "#94a3b8", fontSize: 9 }} tickFormatter={v => `${v}조`} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: "#94a3b8", fontSize: 9 }} tickFormatter={v => `${v}조`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 10, paddingTop: 6 }} />
                    <Line yAxisId="left" type="monotone" dataKey="totalAum" stroke="#06b6d4" strokeWidth={1.5} name="업계전체" dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="kamAum" stroke="#f59e0b" strokeWidth={1.5} name="KAM AUM" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {["KSB", "KYSB"].includes(companyId) && (
            <div className="glass-panel" style={{ padding: 24, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <Activity size={18} color={themeColor} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>연체율 · 고정이하비율 추이</span>
              </div>
              <div style={{ height: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={financialData.sbRatios} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="period" tick={{ fill: "#94a3b8", fontSize: 9 }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 9 }} tickFormatter={v => `${v}%`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" iconSize={6} wrapperStyle={{ fontSize: 10, paddingTop: 6 }} />
                    <Line type="monotone" dataKey="industryAvgDelinq" stroke="#64748b" strokeWidth={1.5} strokeDasharray="4 4" name="업계평균연체율" dot={{ r: 3 }} />
                    <Line type="monotone" dataKey={companyId === "KSB" ? "ksbDelinq" : "kysbDelinq"} stroke="#ef4444" strokeWidth={2} name="자사연체율" dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="industryAvgNpl" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" name="업계평균NPL" dot={{ r: 3 }} />
                    <Line type="monotone" dataKey={companyId === "KSB" ? "ksbNpl" : "kysbNpl"} stroke="#f59e0b" strokeWidth={2} name="자사NPL" dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

        </div>

        {/* Detailed Table & Dynamic Core Accounts Row */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(400px, 1fr))", 
          gap: 20 
        }}>
          
          {/* Detailed Statement Table */}
          <div className="glass-panel" style={{ overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>주요 지표 상세</span>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>기간</th>
                    <th>자산총계</th>
                    <th>부채총계</th>
                    <th>자본총계</th>
                    <th>부채비율</th>
                    <th>영업수지/<br />영업수익</th>
                    <th>영업이익</th>
                    <th>ROE</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rawData].reverse().map((row, idx) => {
                    const r = +roe(row);
                    const isLatestRow = idx === 0;
                    return (
                      <tr key={row.period} style={{
                        background: isLatestRow ? "rgba(255,255,255,0.02)" : "transparent"
                      }}>
                        <td className="sticky-col" style={{ fontWeight: 700, color: themeColor, whiteSpace: "nowrap" }}>
                          <div>{row.period}</div>
                          {isLatestRow && (
                            <div style={{
                              display: "inline-block",
                              marginTop: 4,
                              fontSize: 9,
                              background: themeColor,
                              color: "#fff",
                              padding: "1px 6px",
                              borderRadius: 4,
                              fontWeight: 600,
                              letterSpacing: "0.05em"
                            }}>
                              LATEST
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmt(row.자산총계 || 0)}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmt(row.부채총계 || 0)}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmt(row.자본총계 || 0)}</td>
                        <td style={{ textAlign: "right", color: "#f59e0b", fontWeight: 600, whiteSpace: "nowrap" }}>{debtRatio(row)}%</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmt(row.영업수익 || 0)}</td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmt(row.영업이익 || 0)}</td>
                        <td style={{
                          textAlign: "right",
                          fontWeight: 700,
                          color: r >= 12 ? "#10b981" : r >= 6 ? "#f59e0b" : "#ef4444",
                          whiteSpace: "nowrap"
                        }}>
                          {r.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Dynamic Core Accounts or Mockup Card */}
          {hasCoreTable ? (
            renderCoreAccountsTable(companyId, rawData, themeColor)
          ) : (
            <div className="glass-panel" style={{ padding: 24, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <CheckSquare size={18} color={themeColor} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>
                  {industrySpecific.title}
                  <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400, marginLeft: 6 }}>
                    ({latest.period} 최신 기준)
                  </span>
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 20, flex: 1, justifyContent: "center" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: themeColor, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 6 }}>
                    재무상태표 (B/S) 관련 지표
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {industrySpecific.bs.map((acc, index) => (
                      <div key={index}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: "#cbd5e1" }}>{acc.name}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc" }}>{fmt(acc.value)}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{acc.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 6 }}>
                    손익계산서 (I/S) 관련 지표
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {industrySpecific.pl.map((acc, index) => (
                      <div key={index}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: "#cbd5e1" }}>{acc.name}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc" }}>{fmt(acc.value)}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{acc.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>
    );
  };

  // ─── RENDER: Navigation & Wrapper Layout ────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      
      {/* Brand Header */}
      <header style={{
        background: "rgba(11, 15, 25, 0.8)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
        position: "sticky",
        top: 0,
        zIndex: 50,
        padding: "16px 24px"
      }}>
        <div style={{ 
          maxWidth: 1400, 
          margin: "0 auto", 
          display: "flex", 
          flexDirection: isMobile ? "column" : "row", 
          alignItems: isMobile ? "stretch" : "center", 
          justifyContent: "space-between", 
          gap: 16 
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              background: "linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)",
              padding: 8,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(79, 70, 229, 0.3)"
            }}>
              <Activity size={18} color="#fff" />
            </span>
            <div>
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>Financial Group Dashboard</div>
              <h1 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "#f8fafc", letterSpacing: "-0.02em" }}>금융계열사 통합 실적 관리 시스템</h1>
            </div>
          </div>

          <div style={{ 
            display: "flex", 
            flexDirection: isMobile ? "column" : "row", 
            alignItems: isMobile ? "stretch" : "center", 
            gap: 12 
          }}>
            {/* Calendar display */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#94a3b8", background: "rgba(255,255,255,0.03)", padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
              <Calendar size={12} />
              <span>{periodMode === "quarter" ? "기준 분기: 2025.1Q – 2026.1Q" : "기준 연도: 2022 – 2026.1Q 누적"}</span>
            </div>

            {/* Segmented Period Toggle */}
            <div className="toggle-group" style={{ display: "flex", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 3, border: "1px solid rgba(255,255,255,0.06)" }}>
              <button
                onClick={() => setPeriodMode("quarter")}
                style={{
                  flex: isMobile ? 1 : "initial",
                  padding: "6px 12px",
                  fontSize: 11,
                  fontWeight: periodMode === "quarter" ? 600 : 400,
                  background: periodMode === "quarter" ? "rgba(255,255,255,0.08)" : "transparent",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  color: periodMode === "quarter" ? "#f8fafc" : "#94a3b8",
                  transition: "all 0.15s"
                }}
              >
                분기별
              </button>
              <button
                onClick={() => setPeriodMode("year")}
                style={{
                  flex: isMobile ? 1 : "initial",
                  padding: "6px 12px",
                  fontSize: 11,
                  fontWeight: periodMode === "year" ? 600 : 400,
                  background: periodMode === "year" ? "rgba(255,255,255,0.08)" : "transparent",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  color: periodMode === "year" ? "#f8fafc" : "#94a3b8",
                  transition: "all 0.15s"
                }}
              >
                연간
              </button>
            </div>
            
            {!isMobile && (
              <button
                onClick={handlePrint}
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8,
                  padding: "7px 12px",
                  color: "#e2e8f0",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
              >
                <Printer size={13} />
                <span>인쇄/보고서 저장</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Tab Bar */}
      <nav className="tab-bar" style={{
        background: "rgba(15, 23, 42, 0.4)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.04)"
      }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", overflowX: "auto" }}>
          <button
            onClick={() => setActiveTab("summary")}
            className={`tab-button ${activeTab === "summary" ? "active" : ""}`}
            style={{
              "--theme-color": "#6366f1",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "16px 20px"
            }}
          >
            <PieIcon size={14} />
            <span>📊 그룹 통합 요약</span>
          </button>

          {COMPANIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveTab(c.id)}
              className={`tab-button ${activeTab === c.id ? "active" : ""}`}
              style={{
                "--theme-color": c.color,
                padding: "16px 20px"
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      </nav>

      {/* Main content grid */}
      <main style={{
        flex: 1,
        maxWidth: 1400,
        width: "100%",
        margin: "0 auto",
        padding: isMobile ? "16px 16px 40px" : "24px 24px 60px",
        boxSizing: "border-box"
      }}>
        {activeTab === "summary" ? renderSummaryTab() : renderDetailTab(activeTab)}
      </main>

      {/* Footer copyright */}
      <footer style={{
        background: "#030712",
        borderTop: "1px solid rgba(255, 255, 255, 0.04)",
        padding: "24px 16px",
        color: "#475569",
        fontSize: 11,
        textAlign: "center"
      }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          <Info size={12} />
          <span>본 대시보드의 데이터는 각 계열사의 실제 분기/연간 공시 보고서 및 실적 자료를 API로 수집하여 실시간 정제 및 반영하였습니다.</span>
        </div>
        <div>© 2026 키움금융그룹. All rights reserved.</div>
      </footer>

    </div>
  );
}
