/**
 * 금융계열사 fact sheet.xlsx (통합_graph 시트) → src/data/factsheet.json
 *
 * 실행: node scripts/compile_factsheet.cjs  (npm run build / dev 시 자동 실행)
 * 파일 탐색 순서:
 *   1) 환경변수 FACTSHEET_PATH
 *   2) ../factsheet/*.xlsx   (프로젝트 폴더 옆 factsheet 폴더)
 *   3) ./factsheet/*.xlsx    (프로젝트 안 factsheet 폴더)
 * 파일이 없으면(예: Vercel 빌드) 기존 factsheet.json을 그대로 사용하고 종료합니다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'data', 'factsheet.json');
const IDS = ['KS', 'KAM', 'KSB', 'KYSB', 'KI', 'KPE', 'KC', 'KFI'];

function findWorkbook() {
  const candidates = [];
  if (process.env.FACTSHEET_PATH) candidates.push(process.env.FACTSHEET_PATH);
  for (const dir of [path.join(ROOT, '..', 'factsheet'), path.join(ROOT, 'factsheet')]) {
    if (fs.existsSync(dir)) {
      fs.readdirSync(dir)
        .filter((f) => /\.xlsx$/i.test(f) && !f.startsWith('~$'))
        .sort()
        .forEach((f) => candidates.push(path.join(dir, f)));
    }
  }
  return candidates.find((p) => fs.existsSync(p));
}

function main() {
  const file = findWorkbook();
  if (!file) {
    console.log('ℹ️  fact sheet 엑셀을 찾지 못해 기존 src/data/factsheet.json을 그대로 사용합니다.');
    return;
  }
  let XLSX;
  try { XLSX = require('xlsx'); } catch (e) {
    console.log('ℹ️  xlsx 패키지가 없어 factsheet 변환을 건너뜁니다.');
    return;
  }
  console.log('📥 fact sheet 읽는 중:', file);
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets['통합_graph'];
  if (!ws) { console.log('⚠️  통합_graph 시트가 없습니다. 변환을 건너뜁니다.'); return; }
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  const data = {};
  let cur = null, metric = null;
  const num = (v) => (v === null || v === undefined || v === '' ? null : Math.round(Number(v) * 1000) / 1000);

  for (const r of rows) {
    const b = r[1], c = r[2], d = r[3];
    if (typeof b === 'string' && IDS.includes(b.trim())) { cur = b.trim(); data[cur] = {}; continue; }
    if (typeof b === 'string' && ['영업수지', '영업수익', '영업이익'].includes(b.trim()) && c === '구분') {
      metric = b.trim() === '영업이익' ? 'profit' : 'revenue';
      data[cur][metric] = { label: b.trim() };
      continue;
    }
    if (cur && metric && typeof d === 'string') {
      const m = d.trim().match(/^'(\d\d)년 (실적|목표)/);
      if (m) {
        const year = '20' + m[1];
        const kind = m[2] === '실적' ? 'actual' : 'plan';
        data[cur][metric][year] = data[cur][metric][year] || {};
        data[cur][metric][year][kind] = r.slice(4, 16).map(num);
      }
    }
  }

  const missing = IDS.filter((id) => !data[id] || !data[id].revenue || !data[id].profit);
  if (missing.length) { console.log('⚠️  데이터가 비어 있는 회사:', missing.join(', '), '→ 변환 중단'); return; }

  const ksActual = data.KS.revenue['2026'] && data.KS.revenue['2026'].actual || [];
  let asOfMonth = 0;
  ksActual.forEach((v, i) => { if (v !== null) asOfMonth = i + 1; });

  const years = Array.from(new Set(IDS.flatMap((id) => Object.keys(data[id].revenue).filter((k) => /^\d{4}$/.test(k))))).sort();
  // 엑셀 최종 저장일 (문서 속성 → 없으면 파일 수정일)
  const mod = (wb.Props && wb.Props.ModifiedDate) ? new Date(wb.Props.ModifiedDate) : fs.statSync(file).mtime;
  const kst = new Date(mod.getTime() + 9 * 3600 * 1000);
  const updatedAt = kst.toISOString().slice(0, 10);

  const out = {
    source: path.basename(file) + ' / 통합_graph',
    updatedAt,
    unit: '백만원',
    asOf: { year: Number(years[years.length - 1]), month: asOfMonth },
    years,
    companies: IDS,
    data,
  };
  fs.writeFileSync(OUT, JSON.stringify(out), 'utf-8');
  console.log(`✅ factsheet.json 생성 완료 (기준 ${out.asOf.year}.${String(asOfMonth).padStart(2, '0')}, 업데이트 ${updatedAt}, ${IDS.length}개사)`);
}

try { main(); } catch (e) { console.log('⚠️  factsheet 변환 실패 — 기존 JSON 유지:', e.message); }
