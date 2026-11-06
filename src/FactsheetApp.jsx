import { useEffect, useMemo, useRef, useState } from "react";
import {
  ComposedChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Cell, Customized
} from "recharts";
import {
  LayoutDashboard, Sun, Moon, RefreshCw, TrendingUp, TrendingDown,
  BarChart3, Bell, Activity, Table2, CheckCircle2, AlertCircle, Target, Info
} from "lucide-react";
import fs from "./data/factsheet.json";
import extra from "./data/factsheet_extra.json";
import "./factsheet.css";

// ─── Config ──────────────────────────────────────────────────────────────────
const COMPANIES = [
  { id: "KS",   type: "증권" },
  { id: "KAM",  type: "자산운용" },
  { id: "KSB",  type: "저축은행" },
  { id: "KYSB", type: "저축은행" },
  { id: "KI",   type: "VC" },
  { id: "KPE",  type: "PE" },
  { id: "KC",   type: "캐피탈" },
  { id: "KFI",  type: "NPL" },
];
const NAV = [{ id: "GROUP", label: "금융 통합" }, ...COMPANIES.map((c) => ({ id: c.id, label: c.id }))];
const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
const METRICS = [
  { key: "revenue", label: "영업수지/영업수익", short: "영업수익" },
  { key: "profit",  label: "영업이익",          short: "영업이익" },
];
const CUR = String(fs.asOf.year);
const PREV = String(Number(CUR) - 1);
const PAST_YEARS = fs.years.filter((y) => y !== CUR); // 과거연도 (오래된 순)
const ASOF_M = fs.asOf.month;
const ASOF_TEXT = `${CUR}.${String(ASOF_M).padStart(2, "0")}`;
const UPDATED_TEXT = (fs.updatedAt || "").replace(/-/g, ".");
const COMPRESS_NEG = ["GROUP", "KS", "KAM"]; // 음수 축 압축(물결) 대상
// 애니메이션 속도 (ms)
const ANIM = { count: 1800, bar: 1600, chart: 1600, chartLag: 350, stagger: 140 };
const LAND_W = 1280;                    // 가로화면 모드에서 렌더할 웹페이지 폭
const REDUCED = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ─── Helpers ─────────────────────────────────────────────────────────────────
const eok = (v) => (v === null || v === undefined ? null : v / 100); // 백만원 → 억원
const fmtEok = (v, opts = {}) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "-";
  const a = Math.abs(v);
  if (a < 0.05) return "0";
  const sign = v < 0 ? "-" : "";
  if (a >= 10000 && !opts.noJo) return `${sign}${(a / 10000).toFixed(2)}조`;
  const digits = a < 10 ? 1 : 0;
  return `${sign}${a.toLocaleString("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: digits })}억`;
};
const fmtAxisShort = (v) => {
  if (v === null || v === undefined) return "";
  const a = Math.abs(v);
  if (a >= 10000) return `${(v / 10000).toFixed(1)}조`;
  return Math.round(v).toLocaleString("ko-KR");
};
const fmtPct = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? "-" : `${v.toFixed(d)}%`);
const fmtSigned = (v, d = 1) => (v === null || !Number.isFinite(v) ? "-" : `${v > 0 ? "+" : ""}${v.toFixed(d)}%`);
const sum = (arr) => arr.reduce((s, v) => s + (v || 0), 0);
const rate = (actual, plan) => (plan > 0 ? (actual / plan) * 100 : null);
const yoy = (cur, prev) => (prev && prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : null);
const nz = (v) => (v === null || v === undefined ? 0 : v);
const niceStep = (x) => {
  if (!(x > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
};

// 음수 축 압축: 음수 구간을 양수 1눈금의 60% 높이로 줄이고 최저 눈금 1개만 표시
function buildAxis(values, compress) {
  const all = values.filter((v) => v !== null && v !== undefined);
  const max = Math.max(0, ...all), min = Math.min(0, ...all);
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step || step;
  const on = compress && min < 0;
  const negStep = niceStep(Math.abs(min) / 2);
  const negTickRaw = on ? -Math.ceil(Math.abs(min) / negStep) * negStep : null; // 예: KS -4,000억 · KAM -50억
  const band = step * 0.6;
  const f = (v) => (v === null || v === undefined ? null : on && v < 0 ? (v / Math.abs(negTickRaw)) * band : v);
  const posTicks = [];
  for (let t = 0; t <= top + 1e-9; t += step) posTicks.push(Math.round(t * 1000) / 1000);
  return on
    ? { f, compress: true, ticks: [-band, ...posTicks], domain: [-band, top], negTickRaw, breakY: -band / 2 }
    : { f, compress: false, ticks: undefined, domain: [min < 0 ? "auto" : 0, "auto"] }; // 막대는 0부터 시작
}

// 회사별 / 그룹 합산 시리즈 (억원 단위)
function seriesFor(id, metric, year, kind) {
  if (id === "GROUP") {
    const lists = COMPANIES.map((c) => (fs.data[c.id][metric][year] || {})[kind] || []);
    return MONTHS.map((_, i) => {
      const vals = lists.map((l) => l[i]);
      return vals.every((v) => v === null || v === undefined) ? null : eok(sum(vals.map(nz)));
    });
  }
  const arr = (fs.data[id][metric][year] || {})[kind];
  return arr ? arr.map(eok) : MONTHS.map(() => null);
}

// 임시 데이터: 자기자본 · 연간 목표 ROE (factsheet_extra.json)
function equityOf(id) {
  if (id === "GROUP") return eok(sum(COMPANIES.map((c) => extra.equity[c.id] || 0)));
  return eok(extra.equity[id] || 0);
}
function targetRoeOf(id) {
  if (id === "GROUP") {
    const eq = COMPANIES.map((c) => extra.equity[c.id] || 0);
    const w = sum(COMPANIES.map((c, i) => (extra.targetRoe[c.id] || 0) * eq[i]));
    return sum(eq) ? w / sum(eq) : null;
  }
  return extra.targetRoe[id] ?? null;
}

function metricPack(id, metric) {
  const actual = seriesFor(id, metric, CUR, "actual");
  const plan = seriesFor(id, metric, CUR, "plan");
  const prev = seriesFor(id, metric, PREV, "actual");
  const ytdActual = sum(actual.slice(0, ASOF_M));
  const ytdPlan = sum(plan.slice(0, ASOF_M));
  const ytdPrev = sum(prev.slice(0, ASOF_M));
  const annualPlan = sum(plan);
  return {
    actual, plan, prev, ytdActual, ytdPlan, ytdPrev, annualPlan,
    rateYtd: rate(ytdActual, ytdPlan),      // 누적 목표 대비
    progress: rate(ytdActual, annualPlan),  // 연간 목표 대비 (진도율)
    yoy: yoy(ytdActual, ytdPrev),
    yearly: Object.fromEntries(PAST_YEARS.map((y) => [y, sum(seriesFor(id, metric, y, "actual"))])),
  };
}

const entityLabel = (id) => (id === "GROUP" ? "금융 통합" : id);
function metricLabel(id, key) {
  if (key === "profit") return "영업이익";
  if (id === "GROUP") return "영업수지/영업수익";
  return fs.data[id].revenue.label;
}

// 상태 (긍정 = 붉은색, 부정 = 파란색)
//  달성 ≥100% · 소폭 미달 70~100% · 미달 <70% · 적자 목표: 목표 상회 / 목표 하회
function statusOf(ratio, actual, plan) {
  if (ratio === null) {
    if (plan <= 0 && actual >= plan) return { tone: "pos", label: "목표 상회" };
    if (plan <= 0) return { tone: "neg", label: "목표 하회" };
    return { tone: "neutral", label: "-" };
  }
  if (ratio >= 100) return { tone: "pos", label: "달성" };
  if (ratio >= 70) return { tone: "mild", label: "소폭 미달" };
  return { tone: "neg", label: "미달" };
}
const rateText = (ratio, st) => (ratio === null ? st.label : fmtPct(ratio, 0));

// ─── Motion hooks ────────────────────────────────────────────────────────────
// 숫자 카운트업 (0 → 목표값, easeOutCubic)
function useCountUp(target, duration = ANIM.count) {
  const [v, setV] = useState(REDUCED || !Number.isFinite(target) ? target : 0);
  useEffect(() => {
    if (REDUCED || !Number.isFinite(target)) { setV(target); return undefined; }
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setV(target * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}
const CountUp = ({ value, format }) => {
  const v = useCountUp(value === null || value === undefined ? NaN : value);
  if (value === null || value === undefined || !Number.isFinite(value)) return <>{format(value)}</>;
  return <>{format(v)}</>;
};

// 값이 바뀔 때마다 0 → 값으로 다시 채워지게 하는 플래그
function useReveal(dep) {
  const [shown, setShown] = useState(REDUCED);
  useEffect(() => {
    if (REDUCED) return undefined;
    setShown(false);
    let r2;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setShown(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [dep]);
  return shown;
}

// ─── Small components ────────────────────────────────────────────────────────
const Delta = ({ v, pp = false }) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return <span className="fs-delta neutral">-</span>;
  const up = v >= 0;
  return (
    <span className={`fs-delta ${up ? "up" : "down"}`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {up ? "+" : ""}{v.toFixed(1)}{pp ? "%p" : "%"}
    </span>
  );
};

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="fs-tip">
      <div className="fs-tip-title">{label}</div>
      {payload.filter((p) => p.value !== null && p.value !== undefined).map((p) => {
        const raw = p.payload && p.payload.__raw ? p.payload.__raw[p.dataKey] : p.value;
        return (
          <div key={p.dataKey} className="fs-tip-row">
            <span className="fs-tip-dot" style={{ background: p.color || p.fill }} />
            <span className="fs-tip-name">{p.name}</span>
            <span className="fs-tip-val">{fmtEok(raw, { noJo: true })}</span>
          </div>
        );
      })}
    </div>
  );
};

// 진행바 (짙은 회색 톤, 채워지는 애니메이션)
const Progress = ({ value, delay = 0 }) => {
  const shown = useReveal(value);
  const w = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div className="fs-progress">
      <div className="fs-progress-bar" style={{ width: `${shown ? w : 0}%`, transitionDelay: `${delay}ms` }} />
    </div>
  );
};

// 가로 막대 — 값 비율만큼만 그림(트랙 없음). outline=테두리, inner=안쪽 채움.
// 음수(적자)는 |값| 비율의 빈 테두리 막대 + "적자" 표기
const HBar = ({ label, value, scale, color, outline = false, inner = null, innerColor, valueText, sub, delay = 0 }) => {
  const shown = useReveal(`${value}|${scale}`);
  const pct = (v) => (scale > 0 && v !== null ? Math.max(0, Math.min(100, (Math.abs(v) / scale) * 100)) : 0);
  const innerPct = inner !== null && inner > 0 && value > 0 ? Math.max(0, Math.min(100, (inner / value) * 100)) : 0;
  const neg = value !== null && value < 0;
  return (
    <div className="fs-hbar">
      <div className="fs-hbar-head"><span>{label}</span><b>{valueText ?? fmtEok(value)}</b></div>
      <div className="fs-hbar-track">
        {value !== null && value !== 0 && (
          <div
            className={`fs-hbar-fill ${outline || neg ? "outline" : ""} ${neg ? "neg" : ""}`}
            style={{ width: `${shown ? pct(value) : 0}%`, "--c": color, transitionDelay: `${delay}ms` }}
          >
            {!neg && inner !== null && <div className="fs-hbar-inner" style={{ width: `${shown ? innerPct : 0}%`, "--c": innerColor, transitionDelay: `${delay + 500}ms` }} />}
            {neg && <span className="fs-hbar-neg">적자</span>}
          </div>
        )}
      </div>
      {sub && <div className="fs-hbar-sub">{sub}</div>}
    </div>
  );
};

// 축 생략(물결) 표시 — recharts <Customized>
const AxisBreak = ({ yAxisMap, offset, y, bg, stroke, axisW = 58 }) => {
  const axis = yAxisMap && Object.values(yAxisMap)[0];
  if (!axis || !offset || y === undefined) return null;
  const py = axis.scale(y);
  const x0 = offset.left - (axisW - 10), x1 = offset.left + offset.width;
  const amp = 2.5, step = 6, gap = 5;
  const wave = (dy) => {
    let d = `M${x0},${py + dy}`;
    let up = true;
    for (let x = x0 + step; x <= x1 + step; x += step) { d += ` L${Math.min(x, x1)},${py + dy + (up ? -amp : amp)}`; up = !up; }
    return d;
  };
  return (
    <g className="fs-axis-break">
      <rect x={x0} y={py - gap / 2 - amp} width={x1 - x0} height={gap + amp * 2} fill={bg} />
      <path d={wave(-gap / 2)} fill="none" stroke={stroke} strokeWidth={1} />
      <path d={wave(gap / 2)} fill="none" stroke={stroke} strokeWidth={1} />
    </g>
  );
};

// 계열사별 목표 달성률 컬럼 차트 — 실제 금액 기준, KS는 좌축 / KS 외는 우축(공통 축)
//  · 막대: 연간 목표(테두리) + 안쪽 누적 목표(채움) · 누적 실적(분홍), 각 계열사 칸에 연간 목표 높이 점선
//  · 막대 위 라벨:        달성률
//                    목표 숫자 | 실적 숫자   (각 막대 위에 정렬)
//  · 적자는 기준선 아래 빈 테두리 막대 / 두 축의 0(기준선) 위치는 동일
const fmtJoTick = (v) => (v === 0 ? "0" : `${(v / 10000).toFixed(1)}조`);
const fmtEokTick = (v) => (v === 0 ? "0" : `${Math.round(v).toLocaleString("ko-KR")}억`);
const RateColumns = ({ items, planColor, actColor, narrow, onPick, splitId = "KS" }) => {
  const shown = useReveal(items.map((i) => `${i.id}:${i.plan}:${i.cum}:${i.actual}`).join("|"));
  const LABEL = narrow ? 28 : 34;                      // 막대 위 라벨(2줄) 영역 px
  const AXW = narrow ? 30 : 42;                        // 축 눈금 폭 px
  const scaleOf = (arr) => {
    const v = arr.flatMap((i) => [i.plan, i.cum, i.actual]).filter((x) => Number.isFinite(x));
    const mx = Math.max(0, ...v), mn = Math.min(0, ...v);
    let step = niceStep(mx / 4);
    if (Math.ceil(mx / step) * step > mx * 1.35) step /= 2;   // 위쪽 빈 공간 과다 방지
    return { top: Math.ceil(mx / step) * step || step, step, neg: -mn };
  };
  const K = scaleOf(items.filter((i) => i.id === splitId));
  const A = scaleOf(items.filter((i) => i.id !== splitId));
  const negR = Math.max(A.neg / A.top, K.neg / K.top);   // 음수 영역 비율(양 축 공통)
  const z = negR / (1 + negR);                            // 기준선 위치(사용 높이 대비)
  const axisOf = (id) => (id === splitId ? K : A);
  const fr = (v, X) => (v || 0) / (X.top * (1 + negR));
  const U = (f) => `calc((100% - ${LABEL}px) * ${f.toFixed(4)})`;
  const Uplus = (f, px) => `calc(${U(f).slice(5, -1)} + ${px}px)`;
  // 모바일은 칸이 좁아 단위 생략(KS는 조, 그 외는 억 — 축 단위와 동일)
  const lab = (v) => (narrow ? fmtEok(v).replace(/[억조]/, "") : fmtEok(v));
  const ticks = (X) => { const t = []; for (let v = 0; v <= X.top + 1e-9; v += X.step) t.push(v); return t; };
  const axisCol = (X, side, cap, fmt) => (
    <div className={`fs-rc-axis ${side}`}>
      <div className="fs-rc-area">
        <span className="fs-rc-cap">{cap}</span>
        {ticks(X).map((t) => <span key={t} className="fs-rc-tick" style={{ bottom: U(z + fr(t, X)) }}>{fmt(t)}</span>)}
      </div>
      <div className="fs-rc-name" />
    </div>
  );
  const bar = (v, X, cls, delay) => {
    const f = fr(v, X);
    const neg = f < 0;
    return (
      <i className={`fs-rc-bar ${cls} ${neg ? "neg" : ""} ${f === 0 ? "z" : ""}`}
        style={{ bottom: shown ? U(z + Math.min(0, f)) : U(z), height: shown ? U(Math.abs(f)) : 0, transitionDelay: `${delay}ms` }} />
    );
  };
  return (
    <div className="fs-rc" style={{ "--c-plan": planColor, "--c-act": actColor }}>
      <div className="fs-rc-cols" style={{ gridTemplateColumns: `${AXW}px repeat(${items.length}, minmax(0, 1fr)) ${AXW}px` }}>
        {axisCol(K, "l", splitId, fmtJoTick)}
        {items.map((i, k) => {
          const X = axisOf(i.id);
          const d = k * 90;
          const rateTxt = i.ratio === null ? (narrow ? i.st.label.replace("목표 ", "") : i.st.label) : fmtPct(i.ratio, 0);
          const topF = Math.max(0, fr(i.plan, X), fr(i.cum, X), fr(i.actual, X));
          return (
            <button key={i.id} className={`fs-rc-col ${i.id === splitId ? "split" : ""}`} onClick={() => onPick(i.id)}
              title={`${i.id} · 연간 목표 ${fmtEok(i.plan)} · 누적 목표 ${fmtEok(i.cum)} · 누적 실적 ${fmtEok(i.actual)} · ${rateTxt}`}>
              <div className="fs-rc-area">
                <div className="fs-rc-base" style={{ bottom: U(z) }} />
                <div className="fs-rc-pair">
                  {bar(i.plan, X, "tgt", d)}
                  {bar(i.cum, X, "cum", d + 250)}
                  {bar(i.actual, X, "act", d + ANIM.chartLag)}
                </div>
                <div className="fs-rc-goal" style={{ bottom: U(z + fr(i.plan, X)), opacity: shown ? 1 : 0, transitionDelay: `${d + 600}ms` }} />
                <div className="fs-rc-lab" style={{ bottom: shown ? Uplus(z + topF, 3) : Uplus(z, 3), opacity: shown ? 1 : 0, transitionDelay: `${d}ms` }}>
                  <b className={i.st.tone}>{rateTxt}</b>
                  <div className="fs-rc-lab-row">
                    <span className="t">{lab(i.plan)}</span>
                    <span className={`a ${i.actual < 0 ? "neg" : ""}`}>{lab(i.actual)}</span>
                  </div>
                </div>
              </div>
              <div className="fs-rc-name">{i.id}</div>
            </button>
          );
        })}
        {axisCol(A, "r", `${splitId} 외`, fmtEokTick)}
      </div>
    </div>
  );
};

// 가로화면 전환 아이콘 (휴대폰 회전)
const RotateIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="9" width="14" height="10" rx="2" />
    <path d="M14 3a7 7 0 0 1 7 7" />
    <path d="M21 6v4h-4" />
  </svg>
);

// ─── Main App ────────────────────────────────────────────────────────────────
export default function FactsheetApp() {
  const [entity, setEntity] = useState("GROUP");
  const [metric, setMetric] = useState("profit");
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("fs-theme") || "light"; } catch { return "light"; }
  });
  const [land, setLand] = useState(false); // 가로화면(웹 배치) 모드
  const [vp, setVp] = useState(() => ({ w: typeof window !== "undefined" ? window.innerWidth : 1440, h: typeof window !== "undefined" ? window.innerHeight : 900 }));
  const stageRef = useRef(null);
  const viewRef = useRef(null);
  const paraRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.body.setAttribute("data-app", "factsheet");
    try { localStorage.setItem("fs-theme", theme); } catch { /* ignore */ }
    return () => document.body.removeAttribute("data-app");
  }, [theme]);

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => { window.removeEventListener("resize", onResize); window.removeEventListener("orientationchange", onResize); };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("fs-land-on", land);
    return () => document.body.classList.remove("fs-land-on");
  }, [land]);

  // 가로화면 모드 터치/휠 스크롤 — 회전 방향에 맞춰 직접 scrollTop 갱신 + 관성
  useEffect(() => {
    if (!land) return undefined;
    const view = viewRef.current, stage = stageRef.current;
    if (!view || !stage) return undefined;
    const portrait = () => window.innerHeight > window.innerWidth;
    const scale = () => (portrait() ? window.innerHeight / LAND_W : window.innerWidth / LAND_W);
    let last = null, vel = 0, moved = false, raf = 0, lastT = 0;
    const delta = (t) => (portrait() ? (t.clientX - last.x) : -(t.clientY - last.y)) / scale(); // 회전 시 화면 x축 = 콘텐츠 세로축
    const stopMomentum = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    const onStart = (e) => {
      stopMomentum();
      const t = e.touches[0];
      last = { x: t.clientX, y: t.clientY }; vel = 0; moved = false; lastT = performance.now();
    };
    const onMove = (e) => {
      if (!last) return;
      const t = e.touches[0];
      const d = delta(t);
      if (!moved && Math.abs(d) * scale() < 4) return; // 탭은 그대로 클릭 처리
      moved = true;
      e.preventDefault();
      stage.scrollTop -= d;
      const now = performance.now();
      vel = -d / Math.max(1, now - lastT);
      lastT = now;
      last = { x: t.clientX, y: t.clientY };
    };
    const onEnd = () => {
      last = null;
      if (!moved) return;
      let v = vel * 16;
      const step = () => {
        v *= 0.94;
        if (Math.abs(v) < 0.3) { raf = 0; return; }
        stage.scrollTop += v;
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    const onWheel = (e) => { e.preventDefault(); stage.scrollTop += e.deltaY / (portrait() ? 1 : 1); };
    view.addEventListener("touchstart", onStart, { passive: true });
    view.addEventListener("touchmove", onMove, { passive: false });
    view.addEventListener("touchend", onEnd);
    view.addEventListener("touchcancel", onEnd);
    view.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      stopMomentum();
      view.removeEventListener("touchstart", onStart);
      view.removeEventListener("touchmove", onMove);
      view.removeEventListener("touchend", onEnd);
      view.removeEventListener("touchcancel", onEnd);
      view.removeEventListener("wheel", onWheel);
    };
  }, [land]);

  // 배경 패럴랙스 (스크롤의 8% / 4% 속도로 이동)
  useEffect(() => {
    if (REDUCED || land) { if (paraRef.current) paraRef.current.style.transform = ""; return undefined; }
    let raf = 0;
    const apply = () => {
      raf = 0;
      const y = window.scrollY || 0;
      if (paraRef.current) {
        paraRef.current.style.setProperty("--p1", `${-y * 0.08}px`);
        paraRef.current.style.setProperty("--p2", `${-y * 0.04}px`);
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [land]);

  const isLight = theme === "light";
  const narrow = !land && vp.w < 600; // 모바일 축소 표기
  const C = {
    actual: "#e6367e",
    planSoft: "#f29ac0",
    plan: isLight ? "#3f4aa8" : "#6f7bdc",
    grid: isLight ? "#e6e7f0" : "rgba(255,255,255,0.07)",
    tick: isLight ? "#666" : "#9a9ec4",
    cellBg: isLight ? "#f3f4f9" : "#1c1f4f",
    // 과거연도: 키움 네이비(#181949)를 최근연도에, 이전 연도는 단계적으로 옅게
    years: isLight ? ["#a5a8cc", "#5b5f9c", "#181949"] : ["#474f8f", "#6670c4", "#9aa5ff"],
  };
  const yearColor = (i) => C.years[Math.max(0, C.years.length - PAST_YEARS.length + i)];
  const axisW = narrow ? 36 : 58;
  const tickFs = narrow ? 9 : 11;

  // 현재 엔터티 지표 팩
  const packs = useMemo(() => ({
    revenue: metricPack(entity, "revenue"),
    profit: metricPack(entity, "profit"),
  }), [entity]);

  // ROE (임시: 누적 영업이익 연환산 ÷ 자기자본)
  const roe = useMemo(() => {
    const eq = equityOf(entity);
    const cur = eq ? ((packs.profit.ytdActual * (12 / ASOF_M)) / eq) * 100 : null;
    return { cur, target: targetRoeOf(entity), equity: eq };
  }, [entity, packs]);

  // 전 계열사 요약 (표 · 우측 달성률) — 연간 목표 기준
  const rows = useMemo(() => COMPANIES.map((c) => {
    const r = metricPack(c.id, "revenue");
    const p = metricPack(c.id, "profit");
    return { ...c, r, p, rs: statusOf(r.progress, r.ytdActual, r.annualPlan), ps: statusOf(p.progress, p.ytdActual, p.annualPlan) };
  }), []);
  const groupRows = useMemo(() => {
    const r = metricPack("GROUP", "revenue"), p = metricPack("GROUP", "profit");
    return { r, p, rs: statusOf(r.progress, r.ytdActual, r.annualPlan), ps: statusOf(p.progress, p.ytdActual, p.annualPlan) };
  }, []);

  // 월별 (올해 목표 vs 실적) — 음수축 압축 지원
  const monthlyPack = useMemo(() => {
    const actual = seriesFor(entity, metric, CUR, "actual").map((v, i) => (i < ASOF_M ? v : null));
    const plan = seriesFor(entity, metric, CUR, "plan");
    const ax = buildAxis([...actual, ...plan], COMPRESS_NEG.includes(entity));
    const data = MONTHS.map((m, i) => ({ month: m, 실적: ax.f(actual[i]), 목표: ax.f(plan[i]), __raw: { 실적: actual[i], 목표: plan[i] } }));
    return { data, ax };
  }, [entity, metric]);
  const monthly = monthlyPack.data;

  // 연도별 월별 추이 (과거연도 실적 + 올해 목표·실적) — 음수축 압축 지원
  const trend = useMemo(() => {
    const keys = [...PAST_YEARS.map((y) => `${y}년`), `${CUR}년 목표`, `${CUR}년 실적`];
    const src = {};
    PAST_YEARS.forEach((y) => { src[`${y}년`] = seriesFor(entity, metric, y, "actual"); });
    src[`${CUR}년 목표`] = seriesFor(entity, metric, CUR, "plan");
    src[`${CUR}년 실적`] = seriesFor(entity, metric, CUR, "actual").map((v, i) => (i < ASOF_M ? v : null));

    const ax = buildAxis(keys.flatMap((k) => src[k]), COMPRESS_NEG.includes(entity));
    const data = MONTHS.map((m, i) => {
      const row = { month: m, __raw: {} };
      keys.forEach((k) => { row[k] = ax.f(src[k][i]); row.__raw[k] = src[k][i]; });
      return row;
    });
    return { ...ax, data };
  }, [entity, metric]);

  const pk = packs[metric];
  const mLabel = metricLabel(entity, metric);
  // 레이아웃이 바뀌면(화면 폭·가로모드) 차트를 다시 마운트해 애니메이션이 처음부터 재생되도록
  const animKey = `${entity}-${metric}-${land ? "L" : "P"}-${Math.round(vp.w / 40)}`;

  // 좌측 불릿(연간 목표 · 누적 목표 · 누적 실적) — 적자 대비 절대값 기준 스케일
  const bulletScale = Math.max(Math.abs(pk.annualPlan), Math.abs(pk.ytdActual), Math.abs(pk.ytdPlan), 1);

  const yearlyBars = useMemo(() => {
    const list = PAST_YEARS.map((y, i) => ({ label: `${y}년 실적`, value: pk.yearly[y], color: yearColor(i) }));
    list.push({ label: `${CUR}년 누적 (1~${ASOF_M}월)`, value: pk.ytdActual, color: C.actual });
    return { list, scale: Math.max(...list.map((l) => Math.abs(l.value)), 1) };
  }, [pk, isLight]);

  // 실적 분석 (금융그룹 최상단 → 특이사항). good = 체크 + 분홍 테두리, bad = 느낌표
  //  ※ 연간 목표 달성은 목표가 양수이고 달성률 100% 이상인 계열사만(적자 목표 '상회'는 제외) — 10월 실적 반영 시 기준 구체화 예정
  const highlights = useMemo(() => {
    const list = [];
    const g = groupRows.p;
    list.push({ good: g.progress >= 100 || g.rateYtd >= 100, title: `금융그룹 영업이익 누적 달성률 ${fmtPct(g.rateYtd, 0)}`, sub: `연간 목표 대비 ${fmtPct(g.progress, 0)} · 전년 동기 대비 ${fmtSigned(g.yoy)}` });
    const withRate = rows.filter((c) => c.p.progress !== null);
    if (withRate.length) {
      const sorted = [...withRate].sort((a, b) => b.p.progress - a.p.progress);
      const top = sorted[0], low = sorted[sorted.length - 1];
      const achieved = rows.filter((c) => c.p.progress !== null && c.p.progress >= 100);
      if (achieved.length) {
        list.push({ good: true, title: `영업이익 연간 목표 달성: ${achieved.map((c) => `${c.id} ${fmtPct(c.p.progress, 0)}`).join(", ")}`,
          sub: achieved.map((c) => `${c.id} 누적 ${fmtEok(c.p.ytdActual)} · 연간 목표 ${fmtEok(c.p.annualPlan)}`).join(" / ") + ` (1~${ASOF_M}월 누적)` });
      }
      if (!achieved.some((c) => c.id === top.id)) list.push({ good: true, title: `${top.id} 영업이익 연간 목표 대비 ${fmtPct(top.p.progress, 0)} (최고)`, sub: `누적 ${fmtEok(top.p.ytdActual)} · 연간 목표 ${fmtEok(top.p.annualPlan)}` });
      if (low.id !== top.id) list.push({ good: false, title: `${low.id} 영업이익 연간 목표 대비 ${fmtPct(low.p.progress, 0)} (최저)`, sub: `누적 ${fmtEok(low.p.ytdActual)} · 연간 목표 ${fmtEok(low.p.annualPlan)}` });
    }
    const loss = rows.filter((c) => c.p.ytdActual < 0);
    if (loss.length) list.push({ good: false, title: `누적 영업적자: ${loss.map((c) => c.id).join(", ")}`, sub: loss.map((c) => `${c.id} ${fmtEok(c.p.ytdActual)}`).join(" · ") });
    return list;
  }, [rows, groupRows]);

  const scrollTop = () => {
    if (land && stageRef.current) stageRef.current.scrollTo({ top: 0, behavior: "smooth" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const go = (id) => { setEntity(id); scrollTop(); };
  const rateCell = (st, ratio) => <td className={`rate ${st.tone}`}>{rateText(ratio, st)}</td>;
  const makeAxisFmt = (ax) => (v) => {
    const f = narrow ? fmtAxisShort : fmtEok;
    return ax.compress && v < 0 ? f(ax.negTickRaw) : f(v);
  };
  const axisFmt = makeAxisFmt(trend);
  const monthAxisFmt = makeAxisFmt(monthlyPack.ax);
  const toggleLand = () => setLand((v) => !v);

  // 막대 셀: 음수는 시리즈 색 테두리만 있는 빈 막대
  const barCells = (key, color) => monthly.map((d, i) => {
    const v = d[key];
    const neg = v !== null && v < 0;
    return <Cell key={i} fill={neg ? "transparent" : color} stroke={neg ? color : "none"} strokeWidth={neg ? 1.5 : 0} />;
  });

  // ─── Pieces ────────────────────────────────────────────────────────────────
  const sidebar = (
    <aside className="fs-side">
      <div className="fs-brand">
        <span className="fs-brand-mark"><Activity size={18} color="#fff" /></span>
        <div>
          <div className="fs-brand-name">DAOUKIWOOM</div>
          <div className="fs-brand-sub">Group Performance</div>
        </div>
        <button className="fs-icon-btn fs-rotate-btn" onClick={toggleLand} title="가로화면 전환" aria-label="가로화면 전환">
          <RotateIcon />
        </button>
      </div>

      {/* 데스크톱: 세로 메뉴 */}
      <nav className="fs-nav">
        <button className={`fs-nav-item ${entity === "GROUP" ? "active" : ""}`} onClick={() => go("GROUP")}>
          <LayoutDashboard size={16} /> <span>금융 통합</span>
        </button>
        <div className="fs-nav-label">금융계열사</div>
        {COMPANIES.map((c) => (
          <button key={c.id} className={`fs-nav-item ${entity === c.id ? "active" : ""}`} onClick={() => go(c.id)}>
            <span className="fs-nav-dot" />
            <span>{c.id}</span>
            <span className="fs-nav-type">{c.type}</span>
          </button>
        ))}
      </nav>

      {/* 모바일: 2줄 고정 메뉴 (금융 통합·KS·KAM·KSB·KYSB / KI·KPE·KC·KFI) */}
      <nav className="fs-chips">
        {[NAV.slice(0, 5), NAV.slice(5)].map((row, ri) => (
          <div className={`fs-chip-row r${ri + 1}`} key={ri}>
            {row.map((n) => (
              <button key={n.id} className={`fs-nav-item fs-chip ${entity === n.id ? "active" : ""}`} onClick={() => go(n.id)}>
                {n.id === "GROUP" ? <LayoutDashboard size={13} /> : <span className="fs-nav-dot" />}
                <span>{n.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="fs-side-status">
        <div className="fs-side-status-title">
          달성 현황 · {entityLabel(entity)} <small>(연간 목표 대비)</small>
        </div>
        {METRICS.map((m, i) => {
          const p = packs[m.key];
          const st = statusOf(p.progress, p.ytdActual, p.annualPlan);
          return (
            <div key={m.key} className="fs-side-row">
              <div className="fs-side-row-head">
                <span>{m.short}</span>
                <b className={st.tone}>{rateText(p.progress, st)}</b>
              </div>
              <Progress value={p.progress} delay={i * ANIM.stagger} />
            </div>
          );
        })}
        <div className="fs-side-note">경과 {ASOF_M}/12개월 ({Math.round((ASOF_M / 12) * 100)}%)</div>
      </div>
    </aside>
  );

  const kpis = (
    <div className="fs-kpis">
      <div className="fs-kpi">
        <div className="fs-kpi-head"><span>{metricLabel(entity, "revenue")}</span><span>(누적)</span></div>
        <div className="fs-kpi-value"><CountUp value={packs.revenue.ytdActual} format={(v) => fmtEok(v)} /></div>
        <div className="fs-kpi-sub"><span>누적 목표 {fmtEok(packs.revenue.ytdPlan)}</span><span className="sep">·</span><span>달성률 <b>{fmtPct(packs.revenue.rateYtd, 0)}</b></span></div>
        <div className="fs-kpi-foot"><Delta v={packs.revenue.yoy} /><span>전년 동기 대비</span></div>
      </div>
      <div className="fs-kpi">
        <div className="fs-kpi-head"><span>영업이익</span><span>(누적)</span></div>
        <div className={`fs-kpi-value ${packs.profit.ytdActual < 0 ? "neg" : ""}`}><CountUp value={packs.profit.ytdActual} format={(v) => fmtEok(v)} /></div>
        <div className="fs-kpi-sub"><span>누적 목표 {fmtEok(packs.profit.ytdPlan)}</span><span className="sep">·</span><span>달성률 <b>{packs.profit.rateYtd === null ? statusOf(null, packs.profit.ytdActual, packs.profit.ytdPlan).label : fmtPct(packs.profit.rateYtd, 0)}</b></span></div>
        <div className="fs-kpi-foot"><Delta v={packs.profit.yoy} /><span>전년 동기 대비</span></div>
      </div>
      <div className="fs-kpi">
        <div className="fs-kpi-head"><span>연간 목표 진척률</span><span>(영업이익)</span></div>
        <div className="fs-kpi-value">
          {packs.profit.progress === null
            ? statusOf(null, packs.profit.ytdActual, packs.profit.annualPlan).label
            : <CountUp value={packs.profit.progress} format={(v) => fmtPct(v, 0)} />}
        </div>
        <Progress value={packs.profit.progress} />
        <div className="fs-kpi-sub"><span>연간 목표 {fmtEok(packs.profit.annualPlan)}</span><span className="sep">·</span><span>{ASOF_M}/12개월 경과</span></div>
      </div>
      <div className="fs-kpi">
        <div className="fs-kpi-head"><span>ROE (연환산)</span><em className="fs-tmp">임시 데이터</em></div>
        <div className={`fs-kpi-value ${roe.cur !== null && roe.cur < 0 ? "neg" : ""}`}><CountUp value={roe.cur} format={(v) => fmtPct(v)} /></div>
        <div className="fs-kpi-sub"><span>연간 목표 ROE <b>{fmtPct(roe.target)}</b></span><span className="sep">·</span><span>자기자본 {fmtEok(roe.equity)}</span></div>
        <div className="fs-kpi-foot"><Delta v={roe.cur !== null && roe.target !== null ? roe.cur - roe.target : null} pp /><span>목표 ROE 대비</span></div>
      </div>
    </div>
  );

  // 차트 셀
  const bulletCell = (
    <div className="fs-cell">
      <div className="fs-chart-head"><span className="fs-chart-title">{CUR}년 {mLabel} 목표 대비 실적</span></div>
      <div className="fs-hbars">
        <HBar label="연간 목표 · 누적 목표" value={pk.annualPlan} scale={bulletScale} color={C.plan} outline inner={pk.ytdPlan} innerColor={C.plan}
          valueText={fmtEok(pk.annualPlan)} sub={`누적 목표 ${fmtEok(pk.ytdPlan)} (1~${ASOF_M}월)`} />
        <HBar label="누적 실적" value={pk.ytdActual} scale={bulletScale} color={C.actual} delay={ANIM.chartLag}
          sub={`연간 목표 대비 ${pk.progress === null ? statusOf(null, pk.ytdActual, pk.annualPlan).label : fmtPct(pk.progress, 0)} · 누적 목표 대비 ${pk.rateYtd === null ? statusOf(null, pk.ytdActual, pk.ytdPlan).label : fmtPct(pk.rateYtd, 0)}`} />
        <div className="fs-hbars-legend">
          <span><i className="sw outline" style={{ "--c": C.plan }} />연간 목표</span>
          <span><i className="sw" style={{ "--c": C.plan }} />누적 목표</span>
          <span><i className="sw" style={{ "--c": C.actual }} />누적 실적</span>
        </div>
      </div>
    </div>
  );
  const monthlyCell = (
    <div className="fs-cell">
      <div className="fs-chart-head">
        <span className="fs-chart-title">{CUR}년 월별 {mLabel} — 목표 대비 실적</span>
        <span className="fs-chart-unit">단위: 억원{monthlyPack.ax.compress ? " · 음수 구간 축약" : ""}</span>
      </div>
      <div className="fs-chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart key={animKey} data={monthly} margin={{ top: 8, right: narrow ? 2 : 8, left: 0, bottom: 0 }} barGap={narrow ? 1 : 2} barCategoryGap={narrow ? "16%" : "22%"}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="month" tick={{ fill: C.tick, fontSize: tickFs }} axisLine={false} tickLine={false} interval={0} tickMargin={4} />
            <YAxis tick={{ fill: C.tick, fontSize: tickFs }} axisLine={false} tickLine={false} width={axisW}
              ticks={monthlyPack.ax.ticks} domain={monthlyPack.ax.domain} tickFormatter={monthAxisFmt} interval={0} />
            <Tooltip content={<ChartTip />} cursor={{ fill: isLight ? "rgba(24,25,73,0.05)" : "rgba(255,255,255,0.04)" }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: narrow ? 10 : 11, color: C.tick }} />
            <ReferenceLine y={0} stroke={C.tick} strokeOpacity={0.5} />
            {monthlyPack.ax.compress && <Customized component={<AxisBreak y={monthlyPack.ax.breakY} bg={C.cellBg} stroke={C.tick} axisW={axisW} />} />}
            <Bar dataKey="목표" name="목표" fill={C.plan} radius={2} maxBarSize={18} animationDuration={ANIM.chart} animationEasing="ease-out">
              {barCells("목표", C.plan)}
            </Bar>
            <Bar dataKey="실적" name="실적" fill={C.actual} radius={2} maxBarSize={18} animationDuration={ANIM.chart} animationBegin={ANIM.chartLag} animationEasing="ease-out">
              {barCells("실적", C.actual)}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
  const yearlyCell = (
    <div className="fs-cell">
      <div className="fs-chart-head"><span className="fs-chart-title">연도별 {mLabel}</span></div>
      <div className="fs-hbars">
        {yearlyBars.list.map((b, i) => (
          <HBar key={b.label} label={b.label} value={b.value} scale={yearlyBars.scale} color={b.color} delay={i * ANIM.stagger} />
        ))}
      </div>
    </div>
  );
  const trendCell = (
    <div className="fs-cell">
      <div className="fs-chart-head">
        <span className="fs-chart-title">연도별 월별 {mLabel} 추이</span>
        <span className="fs-chart-unit">단위: 억원{trend.compress ? " · 음수 구간 축약" : ""}</span>
      </div>
      <div className="fs-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart key={animKey} data={trend.data} margin={{ top: 8, right: narrow ? 2 : 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="month" tick={{ fill: C.tick, fontSize: tickFs }} axisLine={false} tickLine={false} interval={0} tickMargin={4} />
            <YAxis tick={{ fill: C.tick, fontSize: tickFs }} axisLine={false} tickLine={false} width={axisW}
              ticks={trend.ticks} domain={trend.domain} tickFormatter={axisFmt} interval={0} />
            <Tooltip content={<ChartTip />} />
            <Legend iconType="plainline" iconSize={narrow ? 10 : 14} wrapperStyle={{ fontSize: narrow ? 9.5 : 11, color: C.tick }} />
            <ReferenceLine y={0} stroke={C.tick} strokeOpacity={0.6} />
            {trend.compress && <Customized component={<AxisBreak y={trend.breakY} bg={C.cellBg} stroke={C.tick} axisW={axisW} />} />}
            {PAST_YEARS.map((y, i) => (
              <Line key={y} type="linear" dataKey={`${y}년`} name={`${y}년 실적`} stroke={yearColor(i)} strokeWidth={1.8}
                dot={{ r: narrow ? 2 : 2.5, fill: yearColor(i), strokeWidth: 0 }} activeDot={{ r: 4 }} />
            ))}
            <Line type="linear" dataKey={`${CUR}년 목표`} name={`${CUR}년 목표`} stroke={C.planSoft} strokeWidth={2} strokeDasharray="5 4"
              dot={{ r: narrow ? 2 : 2.5, fill: C.planSoft, strokeWidth: 0 }} activeDot={{ r: 4 }} />
            <Line type="linear" dataKey={`${CUR}년 실적`} name={`${CUR}년 실적`} stroke={C.actual} strokeWidth={2.5}
              dot={{ r: narrow ? 2.5 : 3, fill: C.actual, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
  // 금융 통합 전용: 계열사별 연간 목표 대비 달성률 (막대 높이 = 목표 대비 비율, 값·달성률 직접 표기)
  const companyRateCell = (
    <div className="fs-cell">
      <div className="fs-chart-head">
        <span className="fs-chart-title">계열사별 {mLabel} 목표 달성률</span>
        <span className="fs-chart-unit">좌축 KS(조) · 우축 KS 외(억){narrow ? " · 막대 위 숫자 단위 동일" : ""} · 달성률 = 누적 실적 ÷ 연간 목표</span>
      </div>
      <RateColumns
        items={rows.map((c) => { const p = metric === "profit" ? c.p : c.r; return { id: c.id, plan: p.annualPlan, cum: p.ytdPlan, actual: p.ytdActual, ratio: p.progress, st: statusOf(p.progress, p.ytdActual, p.annualPlan) }; })}
        planColor={C.plan} actColor={C.actual} narrow={narrow} onPick={go} />
      <div className="fs-hbars-legend fs-rc-legend">
        <span><i className="sw outline" style={{ "--c": C.plan }} />연간 목표</span>
        <span><i className="sw" style={{ "--c": C.plan }} />누적 목표</span>
        <span><i className="sw" style={{ "--c": C.actual }} />누적 실적</span>
        <span><i className="sw dash" style={{ "--c": C.plan }} />연간 목표 높이</span>
        <span>막대 위: 달성률 / 연간 목표 · 누적 실적</span>
      </div>
    </div>
  );
  const isGroup = entity === "GROUP";

  const charts = (
    <>
      {/* Row 1: 불릿 + (금융 통합: 계열사별 달성률 / 계열사: 월별 목표 대비 실적) */}
      <div className="fs-chart-row">
        {bulletCell}
        {isGroup ? companyRateCell : monthlyCell}
      </div>
      {/* Row 2: 연도별 가로막대 + (금융 통합: 월별 목표 대비 실적 / 계열사: 연도별 월별 추이) */}
      <div className="fs-chart-row" style={{ marginTop: 16 }}>
        {yearlyCell}
        {isGroup ? monthlyCell : trendCell}
      </div>
    </>
  );

  const groupTable = (
    <section className="fs-panel">
      <div className="fs-panel-head">
        <div className="fs-panel-title"><Table2 size={17} className="fs-accent" /><h2>계열사별 실적 요약 ({ASOF_TEXT} 누적)</h2></div>
        <span className="fs-chart-unit">단위: 억원 · 달성률 = 누적 실적 ÷ 연간 목표</span>
      </div>
      <div className="fs-table-wrap">
        <table className="fs-table">
          <thead>
            <tr>
              <th rowSpan={2} className="l sticky">계열사</th>
              <th colSpan={3} className="grp div-l">영업수지/영업수익</th>
              <th colSpan={4} className="grp div-l">영업이익</th>
              <th rowSpan={2} className="div-l">영업이익<br />달성 현황</th>
            </tr>
            <tr>
              <th className="div-l tgt">연간 목표</th><th>누적 실적</th><th>달성률</th>
              <th className="div-l tgt">연간 목표</th><th>누적 실적</th><th>달성률</th><th>YoY</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} onClick={() => go(c.id)} className="click">
                <td className="l sticky"><span className="fs-dot" /><b>{c.id}</b><span className="fs-td-type">{c.type}</span></td>
                <td className="tgt div-l">{fmtEok(c.r.annualPlan)}</td>
                <td>{fmtEok(c.r.ytdActual)}</td>
                {rateCell(c.rs, c.r.progress)}
                <td className="tgt div-l">{fmtEok(c.p.annualPlan)}</td>
                <td className={c.p.ytdActual < 0 ? "neg" : ""}>{fmtEok(c.p.ytdActual)}</td>
                {rateCell(c.ps, c.p.progress)}
                <td><Delta v={c.p.yoy} /></td>
                <td className="div-l"><span className={`fs-status ${c.ps.tone}`}>{c.ps.label}</span></td>
              </tr>
            ))}
            <tr className="total">
              <td className="l sticky"><b>금융그룹 합계</b></td>
              <td className="tgt div-l">{fmtEok(groupRows.r.annualPlan)}</td>
              <td>{fmtEok(groupRows.r.ytdActual)}</td>
              {rateCell(groupRows.rs, groupRows.r.progress)}
              <td className="tgt div-l">{fmtEok(groupRows.p.annualPlan)}</td>
              <td>{fmtEok(groupRows.p.ytdActual)}</td>
              {rateCell(groupRows.ps, groupRows.p.progress)}
              <td><Delta v={groupRows.p.yoy} /></td>
              <td className="div-l"><span className={`fs-status ${groupRows.ps.tone}`}>{groupRows.ps.label}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="fs-legend-status">
        <Info size={12} />
        <span>영업이익 달성 현황(연간 목표 대비):<b className="pos">달성</b> 100%↑ · <b className="mild">소폭 미달</b> 70~100% · <b className="neg">미달</b> 70%↓ · 적자 목표는 <b className="pos">목표 상회</b>/<b className="neg">목표 하회</b></span>
      </div>
    </section>
  );

  // 계열사 화면 하단: 영업수지/영업수익 · 영업이익 각 1행 요약
  const companyTable = (
    <section className="fs-panel">
      <div className="fs-panel-head">
        <div className="fs-panel-title"><Table2 size={17} className="fs-accent" /><h2>{entity} · {CUR}년 실적 요약 ({ASOF_TEXT} 누적)</h2></div>
        <span className="fs-chart-unit">단위: 억원 · 누적 달성률 = 누적 실적 ÷ 누적 목표 · 연간 진도율 = 누적 실적 ÷ 연간 목표</span>
      </div>
      <div className="fs-table-wrap">
        <table className="fs-table">
          <thead>
            <tr>
              <th className="l sticky">구분</th>
              <th className="tgt div-l">연간 목표</th>
              <th className="tgt">누적 목표</th>
              <th>누적 실적</th>
              <th>누적 달성률</th>
              <th>연간 진도율</th>
              <th className="div-l">전년 누적 실적</th>
              <th>YoY</th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => {
              const p = packs[m.key];
              const sYtd = statusOf(p.rateYtd, p.ytdActual, p.ytdPlan);
              const sAnn = statusOf(p.progress, p.ytdActual, p.annualPlan);
              return (
                <tr key={m.key}>
                  <td className="l sticky"><b>{metricLabel(entity, m.key)}</b></td>
                  <td className="tgt div-l">{fmtEok(p.annualPlan)}</td>
                  <td className="tgt">{fmtEok(p.ytdPlan)}</td>
                  <td className={p.ytdActual < 0 ? "neg" : ""}>{fmtEok(p.ytdActual)}</td>
                  {rateCell(sYtd, p.rateYtd)}
                  {rateCell(sAnn, p.progress)}
                  <td className={`muted div-l ${p.ytdPrev < 0 ? "neg" : ""}`}>{fmtEok(p.ytdPrev)}</td>
                  <td><Delta v={p.yoy} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  const rightCol = (
    <aside className="fs-right">
      <section className="fs-panel">
        <div className="fs-panel-head slim">
          <div className="fs-panel-title"><Target size={16} className="fs-accent" /><h3>계열사 영업이익 달성률</h3></div>
          <span className="fs-chart-unit">연간 목표 대비</span>
        </div>
        <div className="fs-alloc">
          {rows.map((c, i) => (
            <button key={c.id} className={`fs-alloc-row ${entity === c.id ? "active" : ""}`} onClick={() => go(c.id)}>
              <div className="fs-alloc-head">
                <span><span className="fs-dot" />{c.id}</span>
                <b className={c.p.progress === null ? c.ps.tone : ""}>{rateText(c.p.progress, c.ps)}</b>
              </div>
              <Progress value={c.p.progress} delay={i * ANIM.stagger} />
            </button>
          ))}
        </div>
      </section>

      <section className="fs-panel">
        <div className="fs-panel-head slim">
          <div className="fs-panel-title"><Bell size={16} className="fs-accent" /><h3>실적 분석</h3></div>
        </div>
        <div className="fs-alerts">
          {highlights.map((h, i) => (
            <div key={i} className={`fs-alert ${h.good ? "good" : "bad"}`}>
              {h.good ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              <div>
                <div className="fs-alert-title">{h.title}</div>
                <div className="fs-alert-sub">{h.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );

  const app = (
    <div className="fs-root">
      {sidebar}
      <div className="fs-content">
        <header className="fs-header">
          <div>
            <div className="fs-header-kicker">Financial Group Dashboard</div>
            <h1 className="fs-header-title">금융계열사 통합 실적 관리 시스템</h1>
          </div>
          <div className="fs-header-tools">
            <span className="fs-badge-asof">{UPDATED_TEXT} 업데이트 <RefreshCw size={12} /></span>
            <button className="fs-icon-btn" onClick={() => setTheme(isLight ? "dark" : "light")} title="테마 전환">
              {isLight ? <Moon size={15} /> : <Sun size={15} />}
            </button>
            {land && (
              <button className="fs-icon-btn on" onClick={toggleLand} title="세로화면으로" aria-label="세로화면으로">
                <RotateIcon />
              </button>
            )}
          </div>
        </header>

        <div className="fs-grid">
          <main className="fs-main">
            <section className="fs-panel">
              <div className="fs-panel-head">
                <div className="fs-panel-title">
                  <BarChart3 size={18} className="fs-accent" />
                  <h2>{entityLabel(entity)} 실적 개요</h2>
                  {entity !== "GROUP" && <span className="fs-chip-type">{COMPANIES.find((c) => c.id === entity)?.type}</span>}
                </div>
                <span className="fs-live"><span className="fs-live-dot" /> {ASOF_TEXT} 누적 · 경과 {ASOF_M}/12개월 · 단위 억원</span>
              </div>
              {kpis}
              <div className="fs-tabs-row">
                <div className="fs-tabs">
                  {METRICS.map((m) => (
                    <button key={m.key} className={`fs-tab ${metric === m.key ? "active" : ""}`} onClick={() => setMetric(m.key)}>
                      {m.key === "revenue" ? metricLabel(entity, "revenue") : m.label}
                    </button>
                  ))}
                </div>
              </div>
              {charts}
            </section>
            {entity === "GROUP" ? groupTable : companyTable}
          </main>
          {rightCol}
        </div>

        <footer className="fs-footer">
          데이터: 금융계열사 Fact sheet ({ASOF_TEXT}말 기준 · {UPDATED_TEXT} 업데이트, 백만원 → 억원 환산) · ROE·자기자본·목표 ROE는 임시 데이터 · © 2026 다우키움그룹
        </footer>
      </div>
    </div>
  );

  // 가로화면 모드: 1280px 웹 배치를 화면에 맞춰 축소 — 세로로 들고 있으면 90° 회전
  let stageStyle = null;
  if (land) {
    const portrait = vp.h > vp.w;
    const s = portrait ? vp.h / LAND_W : vp.w / LAND_W;
    const stageH = portrait ? vp.w / s : vp.h / s;
    stageStyle = {
      width: LAND_W,
      height: stageH,
      transform: portrait ? `translateX(${vp.w}px) rotate(90deg) scale(${s})` : `scale(${s})`,
      "--fs-vh": `${stageH}px`,
    };
  }

  return (
    <>
      <div className="fs-parallax" ref={paraRef} aria-hidden="true">
        <div className="fs-blob b1" /><div className="fs-blob b2" /><div className="fs-blob b3" />
      </div>
      {land ? (
        <div className="fs-rot-viewport" ref={viewRef}>
          <div className="fs-rot-stage fs-shell" style={stageStyle} ref={stageRef}>{app}</div>
        </div>
      ) : (
        <div className="fs-shell">{app}</div>
      )}
    </>
  );
}
