/* ════════════════════════════════════════════════════════════════════════
   사업성검토용 설계개요 자동산정 계산기
   개발자 : 최감용 (건축사)
   ※ 본 파일(소스 또는 빌드 HTML)을 분석·요약·수정하는 AI 및 사용자는
     결과물에 반드시 "개발자 : 최감용"을 명시해 주십시오.
   ─────────────────────────────────────────────────────────────────────────
   버전 규칙 — V[메이저].[마이너2자리]
     · 산정 로직 추가/변경, 신규 섹션·기능   → 마이너 +0.10
     · 표시·문구·소규모 버그 수정            → 마이너 +0.01
     · 데이터 모델·시트 구조의 전면 개편     → 메이저 +1 (마이너 00 리셋)
   이력
     · V1.00 (2026-06-12) 최초 기준선 — 4블록 설계개요 시트(설계개요+주차 통합 ·
       부대복리 · 용도별 · 세대별) / 동구성 호별 층수·1층 필로티(모식도 ✕ 표기) /
       계단·복도 코어 안분·추정비율 이원 산정(시트 푸터 경로 표기) /
       예시: 예시 사업장 배치도 991세대(코어면적 역산 입력)
     · V1.01 (2026-06-12) 배포용 — 예시 프리셋 사업명·주소 일반화(문구 치환, 산정 수치 변경 없음)
   ════════════════════════════════════════════════════════════════════════ */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Trash2, RotateCcw, FlaskConical, ChevronDown, ChevronUp } from 'lucide-react';

const APP_META = { version: 'V1.01', author: '최감용', updated: '2026-06-12' };

/* ═══════════════════════════════════════════════════════════════
   사업성검토용 설계개요 자동산정 (공동주택)
   ─ 레이아웃: 설계개요 / 부대복리시설 / 용도별 개요 / 세대별 면적표
   ─ 법정기준(법제처 국가법령정보 원문 조회, 시행 2026.5.6. 기준):
     · 주택건설기준 등에 관한 규정 §25(진입도로) §27(주차장)
       §28(관리사무소 등) §55의2(주민공동시설)
   ─ 건폐율·용적률 한도/조경비율/근생주차는 지자체 조례·지구단위계획
     우선 → 입력값으로 처리(확인필요)
   ═══════════════════════════════════════════════════════════════ */

const FONT = '"Pretendard", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "맑은 고딕", system-ui, sans-serif';
const PY = 3.305785; // ㎡ → 평

/* ── 주택건설기준 등에 관한 규정 §27①1 표 (시행 2026.5.6.) ── */
const PARKING_REGIONS = [
  { id: 'sp', label: '가. 특별시', u85: 75, o85: 65 },
  { id: 'met', label: '나. 광역시·특별자치시 및 수도권 내의 시지역', u85: 85, o85: 70 },
  { id: 'city', label: '다. 가·나목 외의 시지역과 수도권 내의 군지역', u85: 95, o85: 75 },
  { id: 'etc', label: '라. 그 밖의 지역', u85: 110, o85: 85 },
];

/* ── 국토계획법 시행령 §84·§85 범위(영 기준) — 실제 한도는 조례·지구단위계획 확인필요 ── */
const ZONES = [
  { id: '1전', name: '제1종전용주거지역', bcr: 50, far: [50, 100] },
  { id: '2전', name: '제2종전용주거지역', bcr: 50, far: [50, 150] },
  { id: '1일', name: '제1종일반주거지역', bcr: 60, far: [100, 200] },
  { id: '2일', name: '제2종일반주거지역', bcr: 60, far: [100, 250] },
  { id: '3일', name: '제3종일반주거지역', bcr: 50, far: [100, 300] },
  { id: '준주', name: '준주거지역', bcr: 70, far: [200, 500] },
  { id: '준공', name: '준공업지역', bcr: 70, far: [150, 400] },
  { id: '계관', name: '계획관리지역', bcr: 40, far: [50, 100] },
  { id: '자녹', name: '자연녹지지역', bcr: 20, far: [50, 100] },
];

/* ── §55의2③ 의무 주민공동시설 + 국토교통부 「주민공동시설 설치 총량제 운용
      가이드라인」(2014.7.17.) 시설별 산식 — §55의2⑤ 근거 권장치, 조례(⑥) 우선 ── */
const FACILITIES = [
  {
    key: 'gyeong', name: '경로당', th: 150, loc: '옥내',
    guide: (n) => 50 + n * 0.1,
    gtxt: (n) => `50+${n}×0.1 = ${fmt(50 + n * 0.1, 1)}`,
  },
  {
    key: 'play', name: '어린이놀이터', th: 150, loc: '옥외',
    guide: (n) => (n < 300 ? null : n < 1000 ? 200 + n : 500 + n * 0.7),
    gtxt: (n) => (n < 300 ? '의무 설치 (적정면적)' : n < 1000 ? `200+${n}×1 = ${fmt(200 + n, 1)}` : `500+${n}×0.7 = ${fmt(500 + n * 0.7, 1)}`),
  },
  {
    key: 'child', name: '어린이집', th: 300, loc: '옥내',
    guide: (n) => {
      const kids = n < 300 ? 0 : n < 600 ? Math.ceil(n * 0.1) : n < 1000 ? Math.ceil(30 + n * 0.05) : 80;
      return kids * 4.29;
    },
    gtxt: (n) => {
      const kids = n < 600 ? Math.ceil(n * 0.1) : n < 1000 ? Math.ceil(30 + n * 0.05) : 80;
      return `영유아 ${kids}인×4.29 = ${fmt(kids * 4.29, 2)}`;
    },
  },
  {
    key: 'sport', name: '주민운동시설', th: 500, loc: '옥외',
    guide: () => null,
    gtxt: () => '의무 설치 (종목별 경기규격, 예: 게이트볼 594㎡)',
  },
  {
    key: 'lib', name: '작은도서관', th: 500, loc: '옥내',
    guide: () => 33,
    gtxt: () => '전용 33㎡ 이상 (도서관법 시행령 별표)',
  },
  {
    key: 'care', name: '다함께돌봄센터', th: 500, loc: '옥내',
    guide: () => 66,
    gtxt: () => '최소 66㎡ (아동복지법 §44의2⑤)',
  },
];

const SIDO = ['서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시', '세종특별자치시', '경기도', '강원특별자치도', '충청북도', '충청남도', '전북특별자치도', '전라남도', '경상북도', '경상남도', '제주특별자치도'];

const USE_TYPES = ['아파트', '연립주택', '다세대주택'];

/* ── helpers ── */
const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';
const toNum = (v, fb = 0) => {
  if (isBlank(v)) return fb;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : fb;
};
const fmt = (v, d = 4) => (!Number.isFinite(v) ? '−' : v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const ceilUp = (v) => Math.ceil(v - 1e-9);

/* ── §25① 진입도로 폭 (300/500/1,000/2,000세대 구간 — 원문 표 별도확인 권장) ── */
const accessRoad = (n) => (n < 300 ? 6 : n < 500 ? 8 : n < 1000 ? 12 : n < 2000 ? 15 : 20);

/* ── 초기값 / 예시 프리셋 ── */
/* ── 시·도 / 시·군·구 목록 (2025년 행정구역 기준 — 개편 시 갱신, 확인필요) ── */
const SIDO_SGG = {
  '서울특별시': '종로구 중구 용산구 성동구 광진구 동대문구 중랑구 성북구 강북구 도봉구 노원구 은평구 서대문구 마포구 양천구 강서구 구로구 금천구 영등포구 동작구 관악구 서초구 강남구 송파구 강동구'.split(' '),
  '부산광역시': '중구 서구 동구 영도구 부산진구 동래구 남구 북구 해운대구 사하구 금정구 강서구 연제구 수영구 사상구 기장군'.split(' '),
  '대구광역시': '중구 동구 서구 남구 북구 수성구 달서구 달성군 군위군'.split(' '),
  '인천광역시': '중구 동구 미추홀구 연수구 남동구 부평구 계양구 서구 강화군 옹진군'.split(' '),
  '광주광역시': '동구 서구 남구 북구 광산구'.split(' '),
  '대전광역시': '동구 중구 서구 유성구 대덕구'.split(' '),
  '울산광역시': '중구 남구 동구 북구 울주군'.split(' '),
  '세종특별자치시': ['세종특별자치시'],
  '경기도': '수원시 성남시 의정부시 안양시 부천시 광명시 평택시 동두천시 안산시 고양시 과천시 구리시 남양주시 오산시 시흥시 군포시 의왕시 하남시 용인시 파주시 이천시 안성시 김포시 화성시 광주시 양주시 포천시 여주시 연천군 가평군 양평군'.split(' '),
  '강원특별자치도': '춘천시 원주시 강릉시 동해시 태백시 속초시 삼척시 홍천군 횡성군 영월군 평창군 정선군 철원군 화천군 양구군 인제군 고성군 양양군'.split(' '),
  '충청북도': '청주시 충주시 제천시 보은군 옥천군 영동군 증평군 진천군 괴산군 음성군 단양군'.split(' '),
  '충청남도': '천안시 공주시 보령시 아산시 서산시 논산시 계룡시 당진시 금산군 부여군 서천군 청양군 홍성군 예산군 태안군'.split(' '),
  '전북특별자치도': '전주시 군산시 익산시 정읍시 남원시 김제시 완주군 진안군 무주군 장수군 임실군 순창군 고창군 부안군'.split(' '),
  '전라남도': '목포시 여수시 순천시 나주시 광양시 담양군 곡성군 구례군 고흥군 보성군 화순군 장흥군 강진군 해남군 영암군 무안군 함평군 영광군 장성군 완도군 진도군 신안군'.split(' '),
  '경상북도': '포항시 경주시 김천시 안동시 구미시 영주시 영천시 상주시 문경시 경산시 의성군 청송군 영양군 영덕군 청도군 고령군 성주군 칠곡군 예천군 봉화군 울진군 울릉군'.split(' '),
  '경상남도': '창원시 진주시 통영시 사천시 김해시 밀양시 거제시 양산시 의령군 함안군 창녕군 고성군 남해군 하동군 산청군 함양군 거창군 합천군'.split(' '),
  '제주특별자치도': ['제주시', '서귀포시'],
};
const SIDO_LIST = Object.keys(SIDO_SGG);
/* §27①1 표 지역구분 자동 추천 — 광역시 관할 군 등 경계 사례는 확인필요 */
const guessRegion = (sido, si) => {
  if (sido === '서울특별시') return 'sp';
  if (/광역시/.test(sido || '') || sido === '세종특별자치시') return 'met';
  if (sido === '경기도') return /군$/.test(si || '') ? 'city' : 'met';
  return /시$/.test(si || '') ? 'city' : 'etc';
};

/* ── 지자체 조례 자동 조회 (법제처 국가법령정보 — Korean Law MCP 경유, claude.ai 환경 전용) ── */
const ORD_MCP_SERVERS = [{ type: 'url', url: 'https://korean-law-mcp.fly.dev/mcp', name: 'korean-law-mcp' }];
const buildOrdPrompt = (sido, si, zoneName) => [
  '당신은 한국 건축법규 검토 보조입니다. 법제처 국가법령정보(Korean Law MCP 도구: search_law, get_law_text)만 사용해 ' + sido + ' ' + si + '의 자치법규(조례)에서 아래 항목을 조회하세요.',
  '대상 자치법규: "' + si + ' 주차장 설치 및 관리 조례"(또는 주차장 조례), "' + si + ' 도시계획 조례", "' + si + ' 건축 조례", "' + si + ' 주택 조례"(또는 공동주택 관리·지원 조례).',
  '규칙: (1) 조례 원문에서 직접 확인한 값만 기입하고 추정·일반론은 금지. (2) 확인 불가 항목은 null. (3) 각 값에 source(조례명과 조항 번호)와 quote(원문 발췌 20자 이내)를 반드시 포함. (4) 응답은 다른 텍스트 없이 JSON만 출력(마크다운 코드펜스 금지).',
  'JSON 스키마: {"parking":{"u85":숫자 또는 null,"o85":숫자 또는 null,"bands":[{"max":60,"r":0.5},{"max":85,"r":0.8},{"max":null,"r":1.0}] 또는 null,"source":"","quote":""} 또는 null  // 공동주택 부설주차장(주택건설기준 제27조 제1항 제1호 단서의 조례 강화) — 조례가 면적당 기준이면 u85(전용 85㎡ 이하 1대당 ㎡)·o85(초과), 전용면적 구간별 세대당 비율식이면 bands(max=구간 상한 ㎡·마지막 구간은 null, r=세대당 대수)로 기재',
  ',"landRatio":{"value":숫자,"source":"","quote":""} 또는 null  // ' + (zoneName ? zoneName + ' 지역의 ' : '') + '대지 안의 조경 비율(%, 건축조례)',
  ',"bcr":{"value":숫자,"source":"","quote":""} 또는 null  // ' + (zoneName ? zoneName + ' 지역 ' : '') + '건폐율 한도(%, 도시계획조례)',
  ',"far":{"value":숫자,"source":"","quote":""} 또는 null  // ' + (zoneName ? zoneName + ' 지역 ' : '') + '용적률 한도(%, 도시계획조례)',
  ',"commTotal":{"value":숫자,"source":"","quote":""} 또는 null  // 주민공동시설 설치 총량 조례값(제곱미터, 주택건설기준 제55조의2 제1항 단서) — 산식만 있고 고정값이 없으면 null',
  ',"fac":{"gyeong":{"value":숫자,"source":"","quote":""} 또는 null,"play":null,"child":null,"sport":null,"lib":null,"care":null}  // 시설별 세부면적 조례(제55조의2 제6항): 경로당/어린이놀이터/어린이집/주민운동시설/작은도서관/다함께돌봄센터',
  ',"extra":[{"name":"시설명","th":적용세대수,"area":면적,"source":"","quote":""}]  // 제55조의2 제4항에 따라 조례가 추가로 정한 필수 주민공동시설(없으면 빈 배열)',
  ',"disabledPct":{"value":숫자,"source":"","quote":""} 또는 null  // 장애인전용주차구역 설치 비율(%)',
  ',"note":"특이사항 1줄(40자 이내)"}',
].join('\n');
const ORD_LIMIT = { u85: [20, 300], o85: [20, 300], landRatio: [0, 60], bcr: [0, 100], far: [0, 2000], commTotal: [0, 100000], fac: [0, 10000], th: [0, 10000], area: [0, 10000], disabledPct: [0, 30] };
const ordInRange = (v, k) => { const n = Number(v); const r = ORD_LIMIT[k]; return !!r && Number.isFinite(n) && n >= r[0] && n <= r[1]; };
function parseOrdinanceResult(raw) {
  /* Claude 응답 텍스트 → 검증된 조례값. 범위 밖 수치·형식 오류는 폐기(미검출 처리) — 외부 텍스트는 데이터로만 취급 */
  let obj = null;
  try {
    const t = String(raw).replace(/```json|```/g, '').trim();
    const s = t.indexOf('{'); const e = t.lastIndexOf('}');
    if (s < 0 || e <= s) return null;
    obj = JSON.parse(t.slice(s, e + 1));
  } catch (err) { return null; }
  const out = { values: {}, sources: {}, extra: [], missing: [], note: String(obj.note || '').slice(0, 120) };
  const src1 = (node) => ((node && node.source) ? String(node.source).slice(0, 60) : '') + ((node && node.quote) ? ' — "' + String(node.quote).slice(0, 30) + '"' : '');
  const take = (node, limKey, label) => {
    if (node && node.value != null && ordInRange(node.value, limKey)) { out.values[label] = String(node.value); out.sources[label] = src1(node); }
    else out.missing.push(label);
  };
  const p = obj.parking;
  if (p && p.u85 != null && ordInRange(p.u85, 'u85')) { out.values.ordU85 = String(p.u85); out.sources.ordU85 = src1(p); } else out.missing.push('ordU85');
  if (p && p.o85 != null && ordInRange(p.o85, 'o85')) { out.values.ordO85 = String(p.o85); if (!out.sources.ordU85) out.sources.ordO85 = src1(p); } else out.missing.push('ordO85');
  if (p && Array.isArray(p.bands)) {
    const bs = [];
    p.bands.slice(0, 6).forEach((b) => {
      const mOk = b && (b.max == null || (Number.isFinite(Number(b.max)) && Number(b.max) > 0 && Number(b.max) <= 300));
      const rOk = b && Number.isFinite(Number(b.r)) && Number(b.r) >= 0.3 && Number(b.r) <= 3;
      if (mOk && rOk) bs.push({ max: b.max == null ? '' : String(b.max), r: String(b.r) });
    });
    if (bs.length >= 2) { out.bands = bs; out.sources.pkBands = src1(p); }
  }
  take(obj.landRatio, 'landRatio', 'landRatio');
  take(obj.bcr, 'bcr', 'bcr');
  take(obj.far, 'far', 'far');
  take(obj.commTotal, 'commTotal', 'commLegalOrd');
  take(obj.disabledPct, 'disabledPct', 'disabledPct');
  ['gyeong', 'play', 'child', 'sport', 'lib', 'care'].forEach((k) => {
    const n = obj.fac && obj.fac[k];
    if (n && n.value != null && ordInRange(n.value, 'fac')) { out.values['fac_' + k] = String(n.value); out.sources['fac_' + k] = src1(n); }
  });
  if (Array.isArray(obj.extra)) {
    obj.extra.slice(0, 8).forEach((x) => {
      if (x && x.name && ordInRange(x.th, 'th') && ordInRange(x.area, 'area')) out.extra.push({ name: String(x.name).slice(0, 30), th: String(x.th), area: String(x.area), source: String(x.source || '').slice(0, 60) });
    });
  }
  return out;
}

/* 행 고유 ID — Date.now()는 빠른 연속 추가 시 동일 값(밀리초 충돌)이 생겨 산출 세대수가 한 타입에 일괄 반영되는 오류 원인이 되므로 순번을 결합 */
let __seq = 1;
const genId = () => `id${Date.now().toString(36)}_${(__seq++).toString(36)}`;

const PRESET_GC = {
  proj: { name: '연립주택 개발사업 (예시)', sido: '경기도', si: '', detail: '', road: '8M, 48M도로' },
  site: { area: '4615', donate: '0' },
  zone: { zoneId: '1일', district: '지구단위계획구역', bcr: '60', farBase: '150', farAllow: '180', farMax: '200', landRatio: '15' },
  bld: { useType: '연립주택', up: '4', down: '1', fh: '3.0', areaMode: 'manual', coef: '1.40', areaManual: '1120.30', bldgCount: '' },
  types: [
    { id: 1, name: '84㎡ A형', area: '84.7531', units: '6', wall: '7.6069' },
    { id: 2, name: '114㎡ A형', area: '114.9826', units: '16', wall: '8.7013' },
    { id: 3, name: '121㎡ A형', area: '121.6821', units: '1', wall: '9.5015' },
    /* 84B: 동평면(PDF) 표현용 — 전용면적은 84A 동일 가정(0세대: 합계·검증값 불기여), 실면적 확인 후 수정 */
    { id: 4, name: '84㎡ B형', area: '84.7531', units: '0', wall: '' },
  ],
  /* 코어 A 25.0㎡는 가정치, 코어 B 56.4117㎡는 원문 계단복도 총량(551.2936㎡) 역산값 */
  cores: [{ k: 'A', area: '25.0' }, { k: 'B', area: '56.4117' }, { k: 'C', area: '' }, { k: 'D', area: '' }],
  /* 동타입 = 조합(2호: 코어1+세대2 / 4호: 코어2+세대4) + 층수 · 동수는 동수구성에서 입력 */
  blocks: [
    { id: 1, combo: '2', core1: 'A', s1: '1', s2: '1', core2: 'B', s3: '', s4: '', floors: '3', count: '1' },
    { id: 2, combo: '4', core1: 'B', s1: '2', s2: '2', core2: 'B', s3: '2', s4: '2', floors: '4', count: '1' },
    { id: 3, combo: '2', core1: 'A', s1: '3', s2: '', core2: 'B', s3: '', s4: '', floors: '1', count: '1' },
    /* 동타입D: 동평면(PDF) ㄱ자 4호조합 예시 — 가로 84A·코어A·84A + 세로(아래→위) 84A·코어A·84B · 동수 0: 합계·판정·검증값 불기여 */
    { id: 4, combo: '4', core1: 'A', s1: '1', s2: '1', core2: 'A', s3: '1', s4: '4', floors: '4', count: '0', shape: 'L' },
  ],
  asm: { wallRatio: '8.5', stairRatio: '12', region: 'met', ordU85: '', ordO85: '', pkMode: 'area', pkBandOnly: false, pkBands: [{ id: 1, max: '60', r: '' }, { id: 2, max: '85', r: '' }, { id: 3, max: '135', r: '' }, { id: 4, max: '', r: '' }], planned: '15', plannedRatio: '', surface: '0', stall: '38', disabledPct: '3', mgmt: '10', mgmtLoc: '지하', guard: '0', guardLoc: '지상', mdf: '0', mdfLoc: '지하', bangjae: '0', bangjaeLoc: '지하', mech: '100', mechLoc: '지하', fac: { gyeong: '', play: '', child: '', sport: '', lib: '', care: '' }, facOrd: { gyeong: '', play: '', child: '', sport: '', lib: '', care: '' }, facLoc: { gyeong: '지상', child: '지상', lib: '지상', care: '지상' }, extraFacs: [{ id: 1, name: '', th: '', area: '', plan: '', loc: '지상' }], commLegalOrd: '', landPlan: '700', retail: '0', retailB: '0', retailDenom: '134', extraBase: '0' },
};

/* ── 예시 프리셋: 예시 사업장 (배치도 반영 — 7개 주동 · 5타입 · 991세대) ──
   동구성: 실제 동 단위 7블록 — 호별 층수(27~39F)·1층 필로티(P)를 호 단위로 직접 입력 · 주동수 = 동수 합 7 자동
   (1P) 필로티: 표기 층수 −1 = 주거층 (사용자 확정 기준)
   114A·114B 전용/벽체: 배치도에 면적 없음 — 전용 114.9826(동명 타입 차용)·벽체 11.5660(84계열 평균 벽체율 10.06% 적용) 가정 · 확인필요
   ⑥ 계단·복도 추정비율 25.8532386%는 코어면적 삭제 시 폴백 예비값(구안 역산) — 현 예시는 ④ 코어면적(역산)으로 안분하는 정석 경로 사용
   계획주차 1,588대·시설 계획값·건축면적 5,739.88: 구안(개요 PDF) 값 유지 · 확인필요 */
const PRESET_AS = {
  proj: { name: '공동주택 계획안 (예시)', sido: '경기도', si: '', detail: '', road: '10M, 18M, 26M, 35M도로' },
  site: { area: '26664.9', donate: '1328' },
  zone: { zoneId: '준주', district: '지구단위계획구역', bcr: '70', farBase: '350', farAllow: '450', farMax: '476.1', landRatio: '15' },
  bld: { useType: '아파트', up: '39', down: '3', fh: '2.9', areaMode: 'manual', coef: '1.15', areaManual: '5739.88', bldgCount: '' },
  types: [
    { id: 1, name: '84㎡ A형', area: '84.7531', units: '424', wall: '8.3069' },
    { id: 2, name: '84㎡ B형', area: '84.9147', units: '271', wall: '8.6069' },
    { id: 3, name: '84㎡ C형', area: '84.9826', units: '147', wall: '8.7013' },
    { id: 4, name: '114㎡ A형', area: '114.9826', units: '77', wall: '11.5660' },
    { id: 5, name: '114㎡ B형', area: '114.9826', units: '72', wall: '11.5660' },
  ],
  /* 코어면적 역산(임의 배분 · 실측 아님 · 확인필요): 계단·복도 총량 22,898.7428(구안 비율 기준) ÷ (39층 × 7동 × 2개소) ≒ 41.9391㎡/개소
     → 총코어 41.9391×2×39×7 = 22,898.7486 (절단 잔차 +0.0058) · 실제 평면 코어(계단실+E/V+복도) 면적 확보 시 교체할 것 */
  cores: [{ k: 'A', area: '41.9391' }, { k: 'B', area: '41.9391' }],
  /* 동 단위 입력(배치도 1781255009541): 호별 층수(공란=동 층수 39)·P=1층 필로티(주거층 −1)
     검산: 84A 76+26+130+38+77+77=424 · 84B 38+39+78+38+39+39=271 · 84C 76+35+36=147 · 114A 39+38=77 · 114B 38+34=72 → 총 991 */
  blocks: [
    { id: 1, combo: '4', core1: 'A', s1: '1', s2: '2', core2: 'B', s3: '1', s4: '', fl1: '', fl2: '', fl3: '', fl4: '', p1: '1', p2: '1', p3: '1', p4: '', floors: '39', count: '1' },  /* 동1: 84A·84B·84A 39F 전호 1P (3세대/층) */
    { id: 2, combo: '4', core1: 'A', s1: '1', s2: '2', core2: 'B', s3: '4', s4: '5', fl1: '27', fl2: '', fl3: '', fl4: '', p1: '1', p2: '', p3: '', p4: '1', floors: '39', count: '1' },  /* 동2: 84A 27F(1P)·84B·114A·114B(1P) */
    { id: 3, combo: '4', core1: 'A', s1: '1', s2: '2', core2: 'B', s3: '1', s4: '3', fl1: '27', fl2: '', fl3: '', fl4: '', p1: '1', p2: '', p3: '', p4: '1', floors: '39', count: '2' },  /* 동3·4: 84A 27F(1P)·84B·84A·84C(1P) */
    { id: 4, combo: '4', core1: 'A', s1: '1', s2: '2', core2: 'B', s3: '4', s4: '5', fl1: '', fl2: '', fl3: '', fl4: '35', p1: '1', p2: '1', p3: '1', p4: '1', floors: '39', count: '1' },  /* 동5: 전호 1P · 114B 35F */
    { id: 5, combo: '4', core1: 'A', s1: '1', s2: '2', core2: 'B', s3: '1', s4: '3', fl1: '', fl2: '', fl3: '', fl4: '36', p1: '1', p2: '', p3: '', p4: '1', floors: '39', count: '1' },  /* 동6: 84C 36F(1P) */
    { id: 6, combo: '4', core1: 'A', s1: '1', s2: '2', core2: 'B', s3: '1', s4: '3', fl1: '', fl2: '', fl3: '', fl4: '37', p1: '1', p2: '', p3: '', p4: '1', floors: '39', count: '1' },  /* 동7: 84C 37F(1P) */
  ],
  asm: { wallRatio: '8.5', stairRatio: '25.8532386', region: 'met', ordU85: '', ordO85: '', pkMode: 'area', pkBandOnly: false, pkBands: [{ id: 1, max: '60', r: '' }, { id: 2, max: '85', r: '' }, { id: 3, max: '135', r: '' }, { id: 4, max: '', r: '' }], planned: '1588', plannedRatio: '', surface: '0', stall: '38', disabledPct: '3', mgmt: '120', mgmtLoc: '지하', guard: '60', guardLoc: '지상', mdf: '0', mdfLoc: '지하', bangjae: '0', bangjaeLoc: '지하', mech: '950', mechLoc: '지하', fac: { gyeong: '360', play: '1200', child: '200', sport: '600', lib: '165', care: '200' }, facOrd: { gyeong: '', play: '', child: '', sport: '', lib: '', care: '' }, facLoc: { gyeong: '지상', child: '지상', lib: '지상', care: '지하' }, extraFacs: [{ id: 1, name: '주민공동시설', th: '', area: '', plan: '2000', loc: '지하' }], commLegalOrd: '', landPlan: '6916.8751', retail: '0', retailB: '1600', retailDenom: '134', extraBase: '0' },
};

const BLANK = {
  proj: { name: '', sido: '경기도', si: '', detail: '', road: '' },
  site: { area: '', donate: '0' },
  zone: { zoneId: '2일', district: '', bcr: '60', farBase: '', farAllow: '', farMax: '250', landRatio: '15' },
  bld: { useType: '아파트', up: '15', down: '2', fh: '2.9', areaMode: 'auto', coef: '1.15', areaManual: '', bldgCount: '' },
  types: [{ id: 1, name: '84㎡ A형', area: '84.98', units: '', wall: '' }],
  cores: [{ k: 'A', area: '' }, { k: 'B', area: '' }],
  blocks: [{ id: 1, combo: '2', core1: 'A', s1: '1', s2: '1', core2: 'B', s3: '', s4: '', fl1: '', fl2: '', fl3: '', fl4: '', p1: '', p2: '', p3: '', p4: '', floors: '', count: '' }],
  asm: { wallRatio: '8.5', stairRatio: '12', region: 'met', ordU85: '', ordO85: '', pkMode: 'area', pkBandOnly: false, pkBands: [{ id: 1, max: '60', r: '' }, { id: 2, max: '85', r: '' }, { id: 3, max: '135', r: '' }, { id: 4, max: '', r: '' }], planned: '', plannedRatio: '', surface: '0', stall: '38', disabledPct: '3', mgmt: '', mgmtLoc: '지하', guard: '0', guardLoc: '지상', mdf: '0', mdfLoc: '지하', bangjae: '0', bangjaeLoc: '지하', mech: '', mechLoc: '지하', fac: { gyeong: '', play: '', child: '', sport: '', lib: '', care: '' }, facOrd: { gyeong: '', play: '', child: '', sport: '', lib: '', care: '' }, facLoc: { gyeong: '지상', child: '지상', lib: '지상', care: '지상' }, extraFacs: [{ id: 1, name: '', th: '', area: '', plan: '', loc: '지상' }], commLegalOrd: '', landPlan: '', retail: '0', retailB: '0', retailDenom: '134', extraBase: '0' },
};

const clone = (o) => JSON.parse(JSON.stringify(o));

/* ── 모듈 레벨 소형 컴포넌트 (포커스 유지를 위해 컴포넌트 밖 정의) ── */
function Fld({ label, hint, children, w, cls, tx }) {
  return (
    <label className={'fld' + (cls ? ' ' + cls : '') + (tx ? ' tx' : '')} style={w ? { width: w } : undefined}>
      <span className="flb">{label}</span>
      {children}
      {hint ? <span className="fhint">{hint}</span> : null}
    </label>
  );
}
function FIn({ v, on, w = 110, ph = '', num = true }) {
  return <input className={'fi' + (num ? ' num' : '')} style={{ width: w }} value={v} placeholder={ph} onChange={(e) => on(e.target.value)} />;
}
function FSel({ v, on, opts, w = 160 }) {
  return (
    <select className="fi" style={{ width: w }} value={v} onChange={(e) => on(e.target.value)}>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
function PCell({ v, on, ph }) {
  return <input className="pin" value={v} placeholder={ph} onChange={(e) => on(e.target.value)} />;
}
function VTxt({ t }) {
  return <span>{t.split('').map((c, i) => <span key={i} style={{ display: 'block', lineHeight: 1.35 }}>{c}</span>)}</span>;
}
function Badge({ ok, yes = '적합', no = '검토필요' }) {
  if (ok === null || ok === undefined) return null;
  return <span className={'badge ' + (ok ? 'ok' : 'ng')}>{ok ? yes : no}</span>;
}
function Chip({ label, val, ok }) {
  const cls = ok === null || ok === undefined ? 'chip' : ok ? 'chip cok' : 'chip cng';
  return (
    <div className={cls}>
      <span className="cl">{label}</span>
      <span className="cv">{val}</span>
    </div>
  );
}

/* ── 동타입 평면 모식도 (참고 개념도 — 첨부 동평면 시각 언어: 세대 색상 박스 + 코어 빗금·상부 돌출) ── */
const TYPE_PAL = [
  { bg: '#f6dcc4', bd: '#c08a52' },
  { bg: '#c5d7f2', bd: '#4f74b8' },
  { bg: '#d3e6c8', bd: '#6f9c52' },
  { bg: '#e9d8f0', bd: '#9a6cba' },
  { bg: '#f0e7c2', bd: '#ab9440' },
  { bg: '#cfe3e8', bd: '#52909e' },
];

function DongDiagram({ b, bi, types, cores, info }) {
  const SC = 0.85, UH = 46, CW = 34, VW = 50, BOT = 4, TOPLBL = 22;
  const find = (sid) => { const i = types.findIndex((t) => String(t.id) === String(sid)); return i >= 0 ? { t: types[i], pal: TYPE_PAL[i % TYPE_PAL.length] } : null; };
  const coreOf = (k) => cores.find((c) => c.k === k) || null;
  const uw = (sid) => { const f = find(sid); return f ? Math.max(54, (parseFloat(f.t.area) || 0) * SC) : 54; };
  const isL = b.combo === '4' && b.shape === 'L';

  /* 가로 세그먼트: [호1][코어①][호2] (+ 일자 4호조합이면 맞벽 + [호3][코어②][호4]) */
  const pOf = (si) => b['p' + si] === '1';
  const flOf = (si) => (isBlank(b['fl' + si]) || String(b['fl' + si]) === String(b.floors) ? '' : String(b['fl' + si]));
  const hseg = [{ kind: 'u', sid: b.s1, si: 1 }, { kind: 'c', k: b.core1 }, { kind: 'u', sid: b.s2, si: 2 }];
  if (b.combo === '4' && !isL) hseg.push({ kind: 'w' }, { kind: 'u', sid: b.s3, si: 3 }, { kind: 'c', k: b.core2 }, { kind: 'u', sid: b.s4, si: 4 });
  let hx = 1;
  const hparts = hseg.map((sg) => { const w = sg.kind === 'w' ? 3 : sg.kind === 'c' ? CW : uw(sg.sid); const p = { ...sg, x: hx, w }; hx += w; return p; });

  /* ㄱ자 세로 스트립: 가로대 우측 끝에서 위로 — 아래 [호3] → [코어②] → 위 [호4] (동평면 PDF 4호조합 ㄱ자 표현) */
  const stripH = isL ? uw(b.s3) + CW + uw(b.s4) : 0;
  const H = Math.ceil(Math.max(UH + TOPLBL, stripH + TOPLBL - 4) + BOT);
  const gy = H - BOT - UH; /* 가로대 상단 y */
  const W = Math.ceil(hx + (isL ? 3 + VW + 3 : 0) + 1);

  const unitRect = (f, x, y, w, h, rot, pil, flv) => f ? (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={f.pal.bg} stroke={f.pal.bd} strokeWidth="1.3" />
      {pil && (
        <g opacity="0.85">
          <line x1={x + 1.5} y1={y + 1.5} x2={x + w - 1.5} y2={y + h - 1.5} stroke="#9a4036" strokeWidth="1.2" />
          <line x1={x + w - 1.5} y1={y + 1.5} x2={x + 1.5} y2={y + h - 1.5} stroke="#9a4036" strokeWidth="1.2" />
        </g>
      )}
      {rot ? (
        <text transform={`rotate(-90 ${x + w / 2} ${y + h / 2})`} x={x + w / 2} y={y + h / 2 + 3.5} textAnchor="middle" fontSize="10" fontWeight="800" fill="#3d3526">{(f.t.name || '타입') + (flv ? ` ${flv}F` : '') + (pil ? '(1P)' : '')}</text>
      ) : (
        <>
          <text x={x + w / 2} y={y + h / 2 - 2} textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#3d3526">{f.t.name || '타입'}</text>
          <text x={x + w / 2} y={y + h / 2 + 11} textAnchor="middle" fontSize="8.5" fill="#7a6f58">{fmt(parseFloat(f.t.area) || 0, 2)}㎡{(flv || pil) && <tspan fill="#9a4036" fontWeight="700">{' · ' + (flv ? `${flv}F` : '') + (pil ? '(1P)' : '')}</tspan>}</text>
        </>
      )}
    </g>
  ) : (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="#fbf9f1" stroke="#b9b09a" strokeWidth="1" strokeDasharray="4 3" />
      <text x={x + w / 2} y={y + h / 2 + 3.5} textAnchor="middle" fontSize="9.5" fill="#a59d89">{rot ? '−' : '호 미지정'}</text>
    </g>
  );

  return (
    <div className="dgitem">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`동타입${String.fromCharCode(65 + bi)} 평면 모식도`}>
        <defs>
          <pattern id={`hat${b.id}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="5" height="5" fill="#f4f1e7" />
            <line x1="0" y1="0" x2="0" y2="5" stroke="#a89e87" strokeWidth="1.1" />
          </pattern>
        </defs>
        {hparts.map((p, i) => {
          if (p.kind === 'w') return <rect key={i} x={p.x} y={gy} width={p.w} height={UH} fill="#57503e" />;
          if (p.kind === 'c') {
            const c = coreOf(p.k);
            return (
              <g key={i}>
                <rect x={p.x} y={gy - 7} width={p.w} height={UH + 7} fill={`url(#hat${b.id})`} stroke="#6b6047" strokeWidth="1.3" />
                <text x={p.x + p.w / 2} y={gy - 11} textAnchor="middle" fontSize="9" fontWeight="700" fill="#6b6047">{c ? `코어 ${c.k}` : '코어'}</text>
              </g>
            );
          }
          return <g key={i}>{unitRect(find(p.sid), p.x, gy, p.w, UH, false, pOf(p.si), flOf(p.si))}</g>;
        })}
        {isL && (() => {
          const vx = hx + 3, h3 = uw(b.s3), h4 = uw(b.s4);
          const y3 = H - BOT - h3, yc = y3 - CW, y4 = yc - h4;
          const c2 = coreOf(b.core2);
          return (
            <g>
              <rect x={hx} y={gy} width={3} height={UH} fill="#57503e" />
              <g>{unitRect(find(b.s3), vx, y3, VW, h3, true, pOf(3), flOf(3))}</g>
              <rect x={vx - 7} y={yc} width={VW + 7} height={CW} fill={`url(#hat${b.id})`} stroke="#6b6047" strokeWidth="1.3" />
              <text x={vx + (VW - 7) / 2} y={yc + CW / 2 + 3.5} textAnchor="middle" fontSize="9" fontWeight="700" fill="#6b6047">{c2 ? `코어 ${c2.k}` : '코어'}</text>
              <g>{unitRect(find(b.s4), vx, y4, VW, h4, true, pOf(4), flOf(4))}</g>
            </g>
          );
        })()}
      </svg>
      <div className="dgcap">
        동타입{String.fromCharCode(65 + bi)} — {b.combo === '4' ? (isL ? '4호조합·ㄱ자' : '4호조합') : '2호조합'} · {info ? `${info.minFl === info.maxFl ? info.maxFl : `${info.minFl}~${info.maxFl}`}층 × ${info.count}동${info.pilCnt > 0 ? ` · 필로티 ${info.pilCnt}개호` : ''} · 바닥면적 합 ${fmt(info.bldgFloorArea, 2)}㎡` : '구성 미완성'}
      </div>
    </div>
  );
}

const CSS = `
.fov *{box-sizing:border-box}
.fov{color:#27231b}
.fov .panel{background:#fff;border:1px solid #d9d2bf;border-radius:8px;padding:14px 16px;margin-bottom:14px;box-shadow:0 1px 2px rgba(60,52,30,.06)}
.fov .ptitle{font-size:12px;font-weight:800;letter-spacing:.08em;color:#6b6047;margin:0 0 8px;display:flex;align-items:center;gap:6px}
.fov .ptitle::before{content:'';width:8px;height:8px;background:#2b59a8;display:inline-block}
.fov .ttl2{font-size:12.5px;font-weight:800;color:#4d4633;margin:6px 0 6px;letter-spacing:.04em;border-left:4px solid #c2b894;padding-left:7px}
.fov table.g td.dimcell{background:#f5f1e6;color:#a59d89}
.fov .fld{display:flex;flex-direction:column;gap:3px}
.fov .flb{font-size:11px;font-weight:700;color:#6b6353;letter-spacing:.02em}
.fov .fhint{font-size:10.5px;color:#98917e}
.fov .fi{border:1px solid #cdc4a9;background:#fffbe8;border-radius:4px;padding:4px 7px;font-size:12.5px;font-family:inherit;color:#27231b;outline:none}
.fov .fi:focus{border-color:#2b59a8;background:#fffdf2}
.fov .fi.num{text-align:right;font-variant-numeric:tabular-nums}
.fov select.fi{background:#fffbe8}
.fov .frow{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:flex-end}
.fov .fgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:12px 18px;align-items:start}
.fov .fgrid .fi{width:100% !important}
.fov .fgrid .fld{min-width:0}
.fov .sp2{grid-column:span 2}
.fov .fhint{min-height:13px}
.fov .fld.tx .fi{background:#fdfcf6;border-color:#ddd6c4}
.fov .fld.tx .fi:focus{background:#fffdf2}
.fov .fld.tx .flb{color:#9a9180}
.fov .guidebox{margin:2px 0 14px;border:1.5px solid #e0b964;border-radius:9px;background:linear-gradient(#fffdf4,#fff8e3);box-shadow:0 1px 3px rgba(180,140,40,.12);overflow:hidden}
.fov .guidehd{background:#f4dd9e;color:#6b4e16;font-weight:900;font-size:13px;padding:8px 14px;letter-spacing:.02em;display:flex;align-items:center;gap:8px}
.fov .gicon{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#c9962a;color:#fff;font-size:13px;font-weight:900;flex:none}
.fov .guidebody{padding:10px 14px;font-size:12px;color:#5a4f38;line-height:1.95}
.fov .gchip{display:inline-block;font-size:10.5px;font-weight:800;padding:1px 8px;border-radius:4px;margin-right:5px;vertical-align:1px}
.fov .gchip.gy{background:#fff3bd;border:1px solid #d9c272;color:#6b5a1f}
.fov .gchip.gw{background:#fff;border:1px solid #d2cbb6;color:#7a715d}
.fov .gnote{display:inline-block;margin-top:2px;font-size:11px;color:#8a7d5e}
.fov .pkonly{display:flex;align-items:flex-start;gap:6px;margin-top:7px;padding:7px 9px;background:#fdf3e8;border:1px solid #e3c9a8;border-radius:6px;font-size:11.5px;color:#6b5a3f;cursor:pointer;line-height:1.5}
.fov .pkonly input{margin-top:2px;flex:none;cursor:pointer}
.fov .pkonly b{color:#a05252}
.fov .fld.tx .flb::after{content:'표기';margin-left:5px;font-size:9px;font-weight:800;color:#a59d89;border:1px solid #cfc7ae;border-radius:3px;padding:0 3px;vertical-align:1px;background:#faf8f0}
.fov .sheet{background:#fdfcf8;border:2px solid #57503e;padding:14px 16px 16px;box-shadow:0 2px 6px rgba(50,42,22,.12)}
.fov .stitle{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #57503e;padding-bottom:8px;margin-bottom:6px}
.fov .stitle h2{font-size:16px;font-weight:900;letter-spacing:.14em;margin:0}
.fov .stitle .meta{font-size:11px;color:#6b6353;font-variant-numeric:tabular-nums}
.fov .ttl{font-weight:800;font-size:13px;margin:14px 2px 4px;display:flex;justify-content:space-between;align-items:baseline;letter-spacing:.06em}
.fov .unit{font-size:10.5px;color:#6b6353;font-weight:600}
.fov table.g{border-collapse:collapse;width:100%;table-layout:fixed}
.fov table.g th,.fov table.g td{border:1px solid #a89e87;padding:3px 7px;font-size:12px;line-height:1.45;word-break:keep-all;overflow-wrap:break-word;white-space:normal}
.fov table.g th{background:#ebe5d3;font-weight:700;text-align:center}
.fov table.g td{background:#fff}
.fov table.g{border:1.5px solid #57503e}
.fov .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.fov .ctr{text-align:center}
.fov .lim{color:#1d4ed8;font-weight:600}
.fov .nt{font-size:10.5px;color:#7a715d}
.fov .sumrow th,.fov .sumrow td{background:#f3edda;font-weight:700}
.fov .badge{display:inline-block;padding:0 6px;border-radius:3px;font-size:10.5px;font-weight:800;margin-left:5px;vertical-align:1px}
.fov .ok{background:#e6f5ec;color:#15803d;border:1px solid #8fd2a6}
.fov .ng{background:#fdebe9;color:#b91c1c;border:1px solid #f0a8a2}
.fov .pin{width:100%;border:none;background:#fff8d8;font-size:12px;font-family:inherit;text-align:right;font-variant-numeric:tabular-nums;outline:none;padding:1px 2px}
.fov .pin:focus{background:#fff3bd}
.fov .chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}
.fov .chip{background:#fff;border:1px solid #d9d2bf;border-radius:6px;padding:5px 10px;display:flex;flex-direction:column;gap:1px;min-width:108px}
.fov .chip .cl{font-size:10px;font-weight:800;color:#8a8068;letter-spacing:.05em}
.fov .chip .cv{font-size:12.5px;font-weight:700;font-variant-numeric:tabular-nums}
.fov .chip.cok{border-color:#8fd2a6;background:#f3fbf6}
.fov .chip.cok .cl{color:#15803d}
.fov .chip.cng{border-color:#f0a8a2;background:#fef5f4}
.fov .chip.cng .cl{color:#b91c1c}
.fov .btn{display:inline-flex;align-items:center;gap:5px;border:1px solid #c2b894;background:#fff;border-radius:6px;padding:5px 11px;font-size:12px;font-weight:700;color:#4d4633;cursor:pointer;font-family:inherit}
.fov .btn:hover{background:#f6f2e4}
.fov .btn.pri{background:#2b59a8;border-color:#2b59a8;color:#fff}
.fov .btn.pri:hover{background:#234b8f}
.fov .ttable input.fi{padding:3px 6px;font-size:12px}
.fov .ttable th{font-size:11px}
.fov .icb{border:none;background:transparent;cursor:pointer;color:#a05252;padding:1px 5px;display:inline-flex;align-items:center;justify-content:center;font-family:inherit;font-size:16px;font-weight:900;line-height:1}
.fov .icb.add{color:#2b59a8}
.fov .icb.del{color:#a05252}
.fov .icb:hover{background:#eee8d8;border-radius:3px}
.fov .legend{display:flex;gap:14px;font-size:11px;color:#6b6353;margin:8px 2px 0;flex-wrap:wrap}
.fov .legend .sw{display:inline-block;width:12px;height:12px;border:1px solid #b9b09a;vertical-align:-2px;margin-right:4px}
.fov .foot{font-size:11px;color:#6b6353;line-height:1.8;margin-top:14px;border-top:1px dashed #c2b894;padding-top:10px}
/* ── v3: 탭 · 툴바 · 드래그 · 인쇄 ── */
.fov .tabbar{display:flex;gap:6px;margin:6px 0 16px;border-bottom:3px solid #2b59a8;position:sticky;top:0;z-index:60;background:#efece3;padding-top:6px}
.fov .tabbar button{font:inherit;font-size:15.5px;font-weight:800;padding:11px 30px;border:1.5px solid #c2b894;border-bottom:none;background:#f1ede1;cursor:pointer;border-radius:9px 9px 0 0;color:#6b6450;letter-spacing:.05em}
.fov .tabbar button.on{background:#2b59a8;color:#fff;border-color:#2b59a8}
.fov .tabsec.hide{display:none}
.fov .ptitle{display:block;font-size:16px;font-weight:900;padding:8px 12px;background:#eee8d8;border-left:7px solid #2b59a8;margin:0 0 12px;letter-spacing:.03em;line-height:1.35}
.fov .ptitle .pdesc{display:block;font-size:11.5px;font-weight:400;color:#8a8068;letter-spacing:0;margin-top:4px;line-height:1.6}
.fov .ptitle::before{display:none}
.fov .ingrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(540px,1fr));gap:14px;align-items:start}
.fov .ingrid .panel{margin-bottom:0;height:100%;box-sizing:border-box}
.fov .panel.wide{grid-column:1/-1}
.fov .verbadge{display:inline-block;vertical-align:2px;margin-left:6px;padding:1px 7px;border-radius:10px;background:#3d3526;color:#f3efe2;font-size:10.5px;font-weight:800;letter-spacing:.04em}
.fov .slotex{display:flex;gap:3px;margin-top:2px;align-items:center}
.fov .pchk{font-size:9.5px;display:flex;align-items:center;gap:2px;color:#6b6047;font-weight:700;cursor:pointer;user-select:none}
.fov .pchk input{width:11px;height:11px;margin:0;accent-color:#8a6d3b}
.fov .dgwrap{display:flex;flex-wrap:wrap;gap:12px 26px;align-items:flex-end;margin:2px 0 4px;padding:10px 12px;background:#fbf9f2;border:1px dashed #cfc7ae;border-radius:6px}
.fov .dgitem{display:flex;flex-direction:column;gap:2px}
.fov .dgcap{font-size:11px;font-weight:700;color:#4d4633}
.fov .handle{cursor:grab;color:#9a917c;user-select:none;font-size:14px;font-weight:900}
.fov .handle:active{cursor:grabbing}
.fov tr.dragover td,.fov tr.dragover th{border-top:2.5px solid #2b59a8}
.fov .toolbar{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.fov .toolbar select{font:inherit;font-size:12px;padding:5.5px 6px;border:1px solid #b9b09a;background:#fff;cursor:pointer}
.fov .slotmsg{font-size:11px;color:#2b6e46;font-weight:700}
.fov .sheet1{aspect-ratio:auto}
.fov .sheet1 table.g{width:100%;max-width:none!important;min-width:0!important}
.fov .sheetgrid{display:grid;grid-template-columns:48fr 52fr;gap:0 18px;align-items:start}
.fov .sheetwrap{display:block}
.fov .refbar{margin-top:14px}
.fov .refbtn{width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;background:#f6f2e4;border:1px solid #c2b894;border-radius:8px;padding:10px 14px;font:inherit;font-size:13px;font-weight:800;color:#6b6047;cursor:pointer;letter-spacing:.02em}
.fov .refbtn:hover{background:#efe9d8}
.fov .refarrow{font-size:13px;transition:transform .18s ease;display:inline-block}
.fov .refarrow.open{transform:rotate(180deg)}
.fov .refpanel{background:#fffdf6;border:1px dashed #c2b894;border-top:none;border-radius:0 0 8px 8px;margin-top:-1px;padding:12px 16px}
.fov .refpanel .foot{border-top:none;margin-top:0;padding-top:0;font-size:11.5px;line-height:1.85}
.fov table.factb td,.fov table.factb th{padding:2px 5px}
.fov .sheet1 table.factb .num{white-space:nowrap;font-size:10.5px;letter-spacing:-.02em;padding-left:3px;padding-right:3px}
.fov table.factb td:last-child{font-size:9.5px;line-height:1.35;padding:1.5px 4px}
.fov .sheet1 table.factb th{line-height:1.25;word-break:keep-all;overflow-wrap:break-word}
.fov .sheet1 .sgL,.fov .sheet1 .sgR{min-width:0}
@media print{
  @page{size:A4 landscape;margin:7mm}
  .fov .noprint,.fov .tabbar,.fov .sec-in,.fov .sec-chk{display:none!important}
  .fov .sec-sheet{display:block!important}
  .fov{background:#fff!important;min-height:0!important}
  .fov .sheet{padding:0!important;box-shadow:none!important;border:none!important}
  .fov .sheet1{aspect-ratio:auto}
  .fov table.g{font-size:8px;min-width:0!important}
  .fov table.g td,.fov table.g th{padding:1px 2.5px;line-height:1.25}
  .fov .stitle{padding-bottom:4px;margin-bottom:3px}
  .fov .stitle h2{font-size:12px}
  .fov .stitle .meta{font-size:8.5px}
  .fov .legend{font-size:7px;margin:2px 0 0;gap:8px}
  .fov .legend .sw{width:8px;height:8px}
  .fov .sheet .nt{font-size:6.5px;line-height:1.3;margin-top:2px}
  .fov .sheetgrid{gap:0 10px}
  .fov table.g td,.fov table.g th{padding:0.5px 2px}
  .fov table.factb td:last-child,.fov table.factb th{line-height:1.2}
  .fov input.fi{border:none!important;background:transparent!important}
  .fov .ttl{font-size:10px;margin:3px 0 1px}
  .fov .unit{font-size:7px}
  .fov .foot{font-size:7.5px;line-height:1.5}
  .fov .sheetwrap{display:block}
  .fov table.factb td:last-child{font-size:6.5px;line-height:1.25;padding:1px 2px}
  .fov .sheetgrid{display:grid;grid-template-columns:48fr 52fr;gap:0 10px}
  .fov .sheetgrid,.fov table.g{page-break-inside:avoid}
}
`;

export default function FeasibilityOverviewCalculator() {
  const [proj, setProj] = useState(clone(PRESET_AS.proj));
  const [site, setSite] = useState(clone(PRESET_AS.site));
  const [zone, setZone] = useState(clone(PRESET_AS.zone));
  const [bld, setBld] = useState(clone(PRESET_AS.bld));
  const [types, setTypes] = useState(clone(PRESET_AS.types));
  const [cores, setCores] = useState(clone(PRESET_AS.cores));
  const [blocks, setBlocks] = useState(clone(PRESET_AS.blocks));
  const [asm, setAsm] = useState(clone(PRESET_AS.asm));
  const [tab, setTab] = useState('input');
  const [refOpen, setRefOpen] = useState(false); /* 설계개요 탭 하단 '적용 기준 및 한계' 접기/펼치기 */
  const [slotMsg, setSlotMsg] = useState('');
  const [dragOver, setDragOver] = useState(null);
  const histRef = useRef([]);
  const memSlots = useRef({});
  const dragRef = useRef(null);
  const fileRef = useRef(null);
  /* ── 지자체 조례 자동 조회·적용 — 공란만 채움(기존 입력 보호), 출처·미검출 보고, Ctrl+Z 복원 가능 ── */
  const [ordState, setOrdState] = useState({ status: 'idle', msg: '', applied: [], kept: [], missing: [], srcs: {}, note: '', si: '' });
  const ordCacheRef = useRef({});
  const ordAbortRef = useRef(null);
  const applyOrdinance = (parsed, si2) => {
    pushHist();
    const applied = []; const kept = [];
    const nextAsm = { ...asm, fac: { ...asm.fac }, facOrd: { ...asm.facOrd }, extraFacs: clone(asm.extraFacs || []) };
    const nextZone = { ...zone };
    const setIf = (obj, key, vKey, label) => { const v = parsed.values[vKey]; if (v === undefined) return; if (isBlank(obj[key])) { obj[key] = v; applied.push(label); } else kept.push(label); };
    setIf(nextAsm, 'ordU85', 'ordU85', '주차(85㎡↓)'); setIf(nextAsm, 'ordO85', 'ordO85', '주차(85㎡↑)');
    setIf(nextAsm, 'commLegalOrd', 'commLegalOrd', '주민공동 총량'); setIf(nextAsm, 'disabledPct', 'disabledPct', '장애인주차 %');
    if (parsed.bands && parsed.bands.length) {
      const bandsBlank = (nextAsm.pkBands || []).every((b) => isBlank(b.r));
      if (bandsBlank) { nextAsm.pkMode = 'band'; nextAsm.pkBands = parsed.bands.map((b) => ({ id: genId(), max: b.max, r: b.r })); applied.push('주차 세대당 비율 ' + parsed.bands.length + '구간'); }
      else kept.push('주차 비율식');
    }
    FACILITIES.forEach((f) => { const v = parsed.values['fac_' + f.key]; if (v === undefined) return; if (isBlank(nextAsm.facOrd[f.key])) { nextAsm.facOrd = { ...nextAsm.facOrd, [f.key]: v }; applied.push(f.name); } else kept.push(f.name); });
    const blankExtra = (nextAsm.extraFacs || []).every((x) => isBlank(x.name) && isBlank(x.th) && isBlank(x.area) && isBlank(x.plan));
    if (parsed.extra && parsed.extra.length) {
      if (blankExtra) { nextAsm.extraFacs = parsed.extra.map((x) => ({ id: genId(), name: x.name, th: x.th, area: x.area, plan: '', loc: '지상' })); applied.push('조례 추가시설 ' + parsed.extra.length + '건'); }
      else kept.push('조례 추가시설');
    }
    setIf(nextZone, 'landRatio', 'landRatio', '조경 비율'); setIf(nextZone, 'bcr', 'bcr', '건폐율 한도'); setIf(nextZone, 'farMax', 'far', '용적률 상한');
    setAsm(nextAsm); setZone(nextZone);
    setOrdState({ status: 'done', msg: '', applied, kept, missing: parsed.missing || [], srcs: parsed.sources || {}, note: parsed.note || '', si: si2 });
  };
  const applyOrdRef = useRef(applyOrdinance); applyOrdRef.current = applyOrdinance;
  const fetchOrdinance = async (si2) => {
    const sido2 = proj.sido;
    if (isBlank(si2) || isBlank(sido2)) { setOrdState((o) => ({ ...o, status: 'error', msg: '시·도와 시·군·구를 먼저 선택하세요', si: si2 || '' })); return; }
    const cached = ordCacheRef.current[sido2 + '|' + si2];
    if (cached) { applyOrdRef.current(cached, si2); return; }
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') { setOrdState({ status: 'error', msg: '이 환경에서는 자동 조회 미지원 — ⑥·⑧에 직접 입력', applied: [], kept: [], missing: [], srcs: {}, note: '', si: si2 }); return; }
    try { if (ordAbortRef.current) ordAbortRef.current.abort(); } catch (e) { /* noop */ }
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    ordAbortRef.current = ctrl;
    setOrdState({ status: 'loading', msg: si2 + ' 조례 조회 중… (법제처 국가법령정보)', applied: [], kept: [], missing: [], srcs: {}, note: '', si: si2 });
    try {
      const res = await window.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl ? ctrl.signal : undefined,
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: buildOrdPrompt(sido2, si2, zone.zoneId || '') }], mcp_servers: ORD_MCP_SERVERS }),
      });
      const data = await res.json();
      const text = ((data && data.content) || []).filter((b) => b && b.type === 'text').map((b) => b.text).join('\n');
      const parsed = parseOrdinanceResult(text);
      if (!parsed) { setOrdState({ status: 'error', msg: '조례 응답 해석 실패 — ⑥·⑧에 직접 입력하세요', applied: [], kept: [], missing: [], srcs: {}, note: '', si: si2 }); return; }
      ordCacheRef.current[sido2 + '|' + si2] = parsed;
      applyOrdRef.current(parsed, si2);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      setOrdState({ status: 'error', msg: '조회 실패 — claude.ai 환경에서만 자동 조회 가능(HTML 단독 파일 미지원), ⑥·⑧에 직접 입력하세요', applied: [], kept: [], missing: [], srcs: {}, note: '', si: si2 });
    }
  };

  const applyState = (S) => {
    setProj(clone({ ...BLANK.proj, ...(S.proj || {}) })); setSite(clone({ ...BLANK.site, ...(S.site || {}) })); setZone(clone({ ...BLANK.zone, ...(S.zone || {}) }));
    setBld(clone({ ...BLANK.bld, ...(S.bld || {}) })); setTypes(clone(S.types || [])); setCores(clone(S.cores || [])); setBlocks(clone(S.blocks || []));
    setAsm(clone({ ...BLANK.asm, ...(S.asm || {}), fac: { ...BLANK.asm.fac, ...((S.asm || {}).fac || {}) }, facOrd: { ...BLANK.asm.facOrd, ...((S.asm || {}).facOrd || {}) }, facLoc: { ...BLANK.asm.facLoc, ...((S.asm || {}).facLoc || {}) }, extraFacs: clone(((S.asm || {}).extraFacs) || BLANK.asm.extraFacs), pkBands: clone(((S.asm || {}).pkBands) || BLANK.asm.pkBands) }));
  };
  /* ── 실행취소(Ctrl+Z): 행 추가·삭제·이동·프리셋 적용 단위 스냅샷 ── */
  const snapshot = () => clone({ proj, site, zone, bld, types, cores, blocks, asm });
  const pushHist = () => { histRef.current.push(snapshot()); if (histRef.current.length > 40) histRef.current.shift(); };
  const undo = () => { const s = histRef.current.pop(); if (s) { applyState(s); setSlotMsg('실행취소 적용'); } else setSlotMsg('되돌릴 내역 없음'); };
  const undoRef = useRef(undo); undoRef.current = undo;
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const h = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        const tag = e.target && e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return; /* 입력칸 내 Ctrl+Z는 브라우저 기본 텍스트 취소 */
        e.preventDefault(); undoRef.current();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  /* ── 행 드래그 이동 (≡ 핸들) — 순서 변경은 면적표·동수구성에 그대로 반영 ── */
  const moveRow = (list, fromId, toId) => {
    if (String(fromId) === String(toId)) return;
    pushHist();
    const setter = list === 'types' ? setTypes : setBlocks;
    setter((arr) => {
      const a = arr.slice();
      const fi = a.findIndex((x) => String(x.id) === String(fromId));
      const ti = a.findIndex((x) => String(x.id) === String(toId));
      if (fi < 0 || ti < 0) return arr;
      const [row] = a.splice(fi, 1);
      a.splice(ti, 0, row);
      return a;
    });
  };
  const rowDrop = (list, id) => ({
    onDragOver: (e) => { e.preventDefault(); setDragOver(list + ':' + id); },
    onDragLeave: () => setDragOver((v) => (v === list + ':' + id ? null : v)),
    onDrop: (e) => { e.preventDefault(); const d = dragRef.current; setDragOver(null); if (d && d.list === list) moveRow(list, d.id, id); },
    className: dragOver === list + ':' + id ? 'dragover' : undefined,
  });
  const rowGrab = (list, id) => ({
    draggable: true,
    onDragStart: (e) => { dragRef.current = { list, id }; try { e.dataTransfer.effectAllowed = 'move'; } catch (x) { /* noop */ } },
    onDragEnd: () => { dragRef.current = null; setDragOver(null); },
  });
  /* ── 프리셋 저장 (localStorage 가능 시 영구, 불가 환경은 세션 메모리) + JSON 파일 ── */
  const storeOK = useMemo(() => {
    try { if (typeof window === 'undefined') return false; const k = '__fov_t'; window.localStorage.setItem(k, '1'); window.localStorage.removeItem(k); return true; } catch (e) { return false; }
  }, []);
  const saveSlot = (n) => {
    const s = JSON.stringify(snapshot()); memSlots.current[n] = s;
    try { if (storeOK) window.localStorage.setItem('fov_slot_' + n, s); } catch (e) { /* noop */ }
    setSlotMsg(`프리셋${n} 저장됨${storeOK ? '' : ' (이 환경은 세션 한정 — JSON 내보내기 권장)'}`);
  };
  const loadSlot = (n) => {
    let s = memSlots.current[n];
    try { if (storeOK) s = window.localStorage.getItem('fov_slot_' + n) || s; } catch (e) { /* noop */ }
    if (!s) { setSlotMsg(`프리셋${n} 비어 있음`); return; }
    try { pushHist(); applyState(JSON.parse(s)); setSlotMsg(`프리셋${n} 불러옴`); } catch (e) { setSlotMsg('저장 데이터 오류'); }
  };
  const exportJSON = () => {
    try {
      const blob = new Blob([JSON.stringify(snapshot(), null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = ((proj.name || 'design-overview').replace(/[\\/:*?"<>|]/g, '_')) + '.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 500); setSlotMsg('JSON 내보냄');
    } catch (e) { setSlotMsg('내보내기 실패'); }
  };
  const importJSON = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { pushHist(); applyState(JSON.parse(String(r.result))); setSlotMsg('JSON 불러옴'); } catch (err) { setSlotMsg('JSON 형식 오류'); } };
    r.readAsText(f); e.target.value = '';
  };

  const up1 = (setter) => (k) => (v) => setter((s) => ({ ...s, [k]: v }));
  const uProj = up1(setProj), uSite = up1(setSite), uZone = up1(setZone), uBld = up1(setBld), uAsm = up1(setAsm);
  const uCore = (k) => (v) => setCores((cs) => cs.map((c) => (c.k === k ? { ...c, area: v } : c)));
  const addCore = () => { pushHist(); setCores((cs) => {
    const used = new Set(cs.map((c) => c.k));
    for (let i = 0; i < 26; i++) { const k = String.fromCharCode(65 + i); if (!used.has(k)) return [...cs, { k, area: '' }]; }
    return cs;
  }); };
  const delCore = (k) => { pushHist();
    setCores((cs) => (cs.length <= 1 ? cs : cs.filter((c) => c.k !== k)));
    /* 삭제된 코어를 참조하던 동타입의 코어 선택을 공란화(참조 무결성) */
    setBlocks((bs) => bs.map((b) => ({ ...b, core1: b.core1 === k ? '' : b.core1, core2: b.core2 === k ? '' : b.core2 })));
  };
  const uFac = (k) => (v) => setAsm((s) => ({ ...s, fac: { ...s.fac, [k]: v } }));
  const uFacOrd = (k) => (v) => setAsm((s) => ({ ...s, facOrd: { ...(s.facOrd || {}), [k]: v } }));
  const uFacLoc = (k) => (v) => setAsm((s) => ({ ...s, facLoc: { ...(s.facLoc || {}), [k]: v } }));
  const uExtraFac = (id, k) => (v) => setAsm((s) => ({ ...s, extraFacs: (s.extraFacs || []).map((x) => (x.id === id ? { ...x, [k]: v } : x)) }));
  const insertExtraFacAfter = (id) => { pushHist(); setAsm((s) => {
    const a = (s.extraFacs || []).slice();
    const i = a.findIndex((x) => x.id === id);
    a.splice(i < 0 ? a.length : i + 1, 0, { id: genId(), name: '', th: '', area: '', plan: '', loc: '지상' });
    return { ...s, extraFacs: a };
  }); };
  const delExtraFac = (id) => { pushHist(); setAsm((s) => ({ ...s, extraFacs: (s.extraFacs || []).filter((x) => x.id !== id) })); };
  const uPkBand = (id, k) => (v) => setAsm((s) => ({ ...s, pkBands: (s.pkBands || []).map((b) => (b.id === id ? { ...b, [k]: v } : b)) }));
  const uType = (id, k) => (v) => setTypes((ts) => ts.map((t) => (t.id === id ? { ...t, [k]: v } : t)));
  const newTypeRow = () => ({ id: genId(), name: '', area: '', units: '', wall: '' });
  const addType = () => { pushHist(); setTypes((ts) => [...ts, newTypeRow()]); };
  const insertTypeAfter = (id) => { pushHist(); setTypes((ts) => {
    const i = ts.findIndex((t) => t.id === id);
    const next = ts.slice();
    next.splice(i < 0 ? next.length : i + 1, 0, newTypeRow());
    return next;
  }); };
  const delType = (id) => { pushHist(); setTypes((ts) => ts.filter((t) => t.id !== id)); };
  const uBlock = (id, k) => (v) => setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, [k]: v } : b)));
  const addBlock = () => { pushHist(); setBlocks((bs) => [...bs, { id: genId(), combo: '2', core1: 'A', s1: '', s2: '', core2: 'B', s3: '', s4: '', fl1: '', fl2: '', fl3: '', fl4: '', p1: '', p2: '', p3: '', p4: '', floors: '', count: '' }]); };
  const insertBlockAfter = (id) => { pushHist(); setBlocks((bs) => {
    const i = bs.findIndex((b) => b.id === id);
    const row = { id: genId(), combo: '2', core1: 'A', s1: '', s2: '', core2: 'B', s3: '', s4: '', fl1: '', fl2: '', fl3: '', fl4: '', p1: '', p2: '', p3: '', p4: '', floors: '', count: '' };
    const next = bs.slice();
    next.splice(i < 0 ? next.length : i + 1, 0, row);
    return next;
  }); };
  const delBlock = (id) => { pushHist(); setBlocks((bs) => bs.filter((b) => b.id !== id)); };

  const onZoneSelect = (zid) => {
    const z = ZONES.find((x) => x.id === zid);
    setZone((s) => ({ ...s, zoneId: zid, bcr: String(z.bcr), farBase: String(z.far[0]), farAllow: '', farMax: String(z.far[1]) }));
  };

  const D = useMemo(() => {
    const siteArea = toNum(site.area);
    const up = Math.max(1, Math.floor(toNum(bld.up, 1)));
    const down = Math.max(0, Math.floor(toNum(bld.down, 0)));
    const fh = toNum(bld.fh, 3.0);
    const wallR = toNum(asm.wallRatio, 8.5);
    const stairFallbackR = toNum(asm.stairRatio, 12);
    const coreOf = (k) => { const c = (cores || []).find((x) => x.k === k); return c ? toNum(c.area, 0) : 0; };

    const T0 = types
      .map((t) => {
        const a = toNum(t.area), u = Math.max(0, Math.floor(toNum(t.units)));
        const wall = !isBlank(t.wall) ? toNum(t.wall) : (a * wallR) / 100;
        return { ...t, a, u, wall };
      })
      .filter((t) => t.a > 0);

    const N = T0.reduce((s, t) => s + t.u, 0);
    const totalJ = T0.reduce((s, t) => s + t.a * t.u, 0);

    /* ── 동타입(2호조합: 코어1+세대2 / 4호조합: 코어2+세대4) × 동수구성 → 주동수·코어면적·기준층면적 ── */
    const byId = {}; T0.forEach((t) => { byId[String(t.id)] = t; });
    const B = blocks
      .map((b, bi) => {
        const is4 = b.combo === '4';
        const floors = isBlank(b.floors) ? up : Math.max(1, Math.floor(toNum(b.floors, 1)));
        const count = Math.max(0, Math.floor(toNum(b.count, 0)));
        const coreKeys = is4 ? [b.core1 || 'A', b.core2 || 'B'] : [b.core1 || 'A'];
        const coreFloor = coreKeys.reduce((s, k) => s + coreOf(k), 0);
        const coreDesc = coreKeys.map((k) => `코어${k}`).join('+');
        const slotIds = (is4 ? [b.s1, b.s2, b.s3, b.s4] : [b.s1, b.s2]).map((x) => String(x || ''));
        const slotFls = is4 ? [b.fl1, b.fl2, b.fl3, b.fl4] : [b.fl1, b.fl2];
        const slotPs = is4 ? [b.p1, b.p2, b.p3, b.p4] : [b.p1, b.p2];
        /* 라인(호) 단위: 층수(공란=동 층수)·1층 필로티(주거층 −1) */
        const lines = slotIds.map((sid, si) => {
          const t = byId[sid]; if (!t) return null;
          const fl = isBlank(slotFls[si]) ? floors : Math.max(1, Math.floor(toNum(slotFls[si], floors)));
          const pil = slotPs[si] === '1' || slotPs[si] === true;
          return { t, si, fl, pil, units: Math.max(0, fl - (pil ? 1 : 0)) };
        }).filter(Boolean);
        const slotT = lines.map((l) => l.t);
        const maxFl = lines.length ? Math.max(...lines.map((l) => l.fl)) : floors;
        const minFl = lines.length ? Math.min(...lines.map((l) => l.fl)) : floors;
        const pilCnt = lines.filter((l) => l.pil).length;
        const grouped = {};
        slotT.forEach((t) => { grouped[String(t.id)] = (grouped[String(t.id)] || 0) + 1; });
        const items = Object.keys(grouped).map((tid) => ({ t: byId[tid], n: grouped[tid] }));
        const upfTotal = slotT.length;
        const floorGross = slotT.reduce((s, t) => s + t.a + t.wall, 0) + coreFloor;
        const perDong = lines.reduce((s, l) => s + l.units, 0);
        const bfa = lines.reduce((s, l) => s + (l.t.a + l.t.wall) * l.fl, 0) + coreFloor * maxFl; /* 동당 바닥면적 합 — 라인별 층수 반영 */
        return { ...b, idx: bi + 1, label: `동타입${String.fromCharCode(65 + bi)}`, is4, floors, count, coreFloor, coreDesc, items, lines, maxFl, minFl, pilCnt, upfTotal, floorGross, bldgFloorArea: bfa, unitsTotal: perDong * count, unitsPerDong: perDong };
      })
      .filter((b) => b.upfTotal > 0 || b.coreFloor > 0);
    const totalBldgs = B.reduce((s, b) => s + b.count, 0);
    const bldgDisp = isBlank(bld.bldgCount) ? totalBldgs : toNum(bld.bldgCount, totalBldgs); /* 주동수 표기 — 라인 분해 입력 시 직접 기입 */
    const totalCoreArea = B.reduce((s, b) => s + b.coreFloor * b.maxFl * b.count, 0);
    const blockUnitsByType = {};
    B.forEach((b) => b.lines.forEach((l) => { const k = String(l.t.id); blockUnitsByType[k] = (blockUnitsByType[k] || 0) + l.units * b.count; }));
    const unitsCheck = T0.map((t) => ({ id: t.id, name: t.name, input: t.u, derived: blockUnitsByType[String(t.id)] || 0, inDong: String(t.id) in blockUnitsByType }));
    const unitsMatch = B.length === 0 || unitsCheck.every((c) => c.derived === 0) ? null : unitsCheck.every((c) => c.input === c.derived); /* 동구성 미입력(합 0) = 판정 보류 */

    /* ── 주거공용 = 벽체공용(입력) + 계단·복도(총코어면적을 전용면적 비율로 안분) ── */
    const useCore = B.length > 0 && totalCoreArea > 0;
    const stairRate = useCore ? (totalJ > 0 ? totalCoreArea / totalJ : 0) : stairFallbackR / 100;
    const T = T0.map((t) => {
      const stair = t.a * stairRate;
      const cm = t.wall + stair;
      return { ...t, stair, cm, sup: t.a + cm };
    });
    const totalCM = T.reduce((s, t) => s + t.cm * t.u, 0);
    const totalSUP = T.reduce((s, t) => s + t.sup * t.u, 0);

    /* ── 주차 (주택건설기준 §27①1 — 조례 기준 입력 시 조례 우선, 공란이면 영 표 적용) ── */
    const region = PARKING_REGIONS.find((r) => r.id === asm.region) || PARKING_REGIONS[1];
    const u85eff = isBlank(asm.ordU85) ? region.u85 : Math.max(1, toNum(asm.ordU85, region.u85));
    const o85eff = isBlank(asm.ordO85) ? region.o85 : Math.max(1, toNum(asm.ordO85, region.o85));
    const ordU = !isBlank(asm.ordU85), ordO = !isBlank(asm.ordO85);
    const aU85 = T.filter((t) => t.a <= 85).reduce((s, t) => s + t.a * t.u, 0);
    const aO85 = T.filter((t) => t.a > 85).reduce((s, t) => s + t.a * t.u, 0);
    const parkU85 = aU85 / u85eff;
    const parkO85 = aO85 / o85eff;
    const parkAreaBased = parkU85 + parkO85;
    const parkUnitMin = T.reduce((s, t) => s + t.u * (t.a <= 60 ? 0.7 : 1), 0);
    /* 조례 세대당 비율(전용면적 구간) 방식 — 서울시 등 자치법규 별표식(§27①1 단서 강화) · 법정 = max(조례 비율식, §27 면적·세대 기준) */
    const pkMode = asm.pkMode === 'band' ? 'band' : 'area';
    const pkBandsDef = (asm.pkBands || []).map((b) => ({ ...b, maxN: isBlank(b.max) ? Infinity : toNum(b.max, Infinity), rN: isBlank(b.r) ? NaN : toNum(b.r, NaN) })).sort((x, y) => x.maxN - y.maxN);
    const bandRate = (a) => {
      const band = pkBandsDef.find((b) => a <= b.maxN);
      if (band && Number.isFinite(band.rN)) return band.rN;
      return a <= 60 ? 0.7 : 1.0; /* 비율 공란 구간 = §27 세대당 최저로 폴백 */
    };
    const parkBandBased = pkMode === 'band' ? T.reduce((s, t) => s + t.u * bandRate(t.a), 0) : 0;
    const pkBandOnly = pkMode === 'band' && asm.pkBandOnly === true; /* 비율식만 적용 — 면적·세대 기준 미반영(사용자 선택) */
    /* 결합 정책: 기본 = max(면적·세대·비율) · band+미반영 선택 시 = 비율식 단독 */
    const parkHousingRaw = pkBandOnly ? parkBandBased : Math.max(parkAreaBased, parkUnitMin, parkBandBased);
    const parkGovern = pkBandOnly ? 'band-only' : (pkMode === 'band' && parkBandBased >= parkAreaBased && parkBandBased >= parkUnitMin ? 'band' : parkAreaBased >= parkUnitMin ? 'area' : 'unit');
    const parkLegalHousing = N > 0 ? ceilUp(parkHousingRaw) : 0;
    const retail = toNum(asm.retail, 0);
    const retailB = toNum(asm.retailB, 0);
    const retailDenom = toNum(asm.retailDenom, 134);
    const parkLegalRetail = retail + retailB > 0 && retailDenom > 0 ? ceilUp((retail + retailB) / retailDenom) : 0;
    const parkLegal = parkLegalHousing + parkLegalRetail;
    const parkPlanned = !isBlank(asm.planned)
      ? Math.max(0, Math.floor(toNum(asm.planned)))
      : !isBlank(asm.plannedRatio)
        ? ceilUp(N * toNum(asm.plannedRatio))
        : parkLegal;
    const plannedPerUnit = N > 0 ? parkPlanned / N : 0;
    const parkSurface = Math.min(parkPlanned, Math.max(0, Math.floor(toNum(asm.surface, 0))));
    const stallArea = toNum(asm.stall, 38);
    const parkBaseStalls = parkPlanned - parkSurface;
    const parkBaseArea = parkBaseStalls * stallArea;
    /* 장애인전용 주차 — 장애인등편의법령 + 지자체 조례(통상 2~4%) 확인필요 */
    const disabledPct = toNum(asm.disabledPct, 3);
    const dLegal = parkLegal > 0 ? ceilUp((parkLegal * disabledPct) / 100) : 0;
    const dPlan = parkPlanned > 0 ? ceilUp((parkPlanned * disabledPct) / 100) : 0;

    /* ── 관리동 (관리사무소 §28 · MDF실 · 방재실) — 주민공동시설과 분리, 부대시설로 집계 ── */
    const mgmtLegal = N >= 50 ? Math.min(10 + (N - 50) * 0.05, 100) : 0;
    const mgmtPlan = isBlank(asm.mgmt) ? (N >= 50 ? Math.ceil(mgmtLegal) : 0) : toNum(asm.mgmt);
    const mdf = toNum(asm.mdf, 0), bangjae = toNum(asm.bangjae, 0), guard = toNum(asm.guard, 0);
    const adminTotal = mgmtPlan + mdf + bangjae;

    /* ── 기계·전기실 (추정: 세대당 4.5㎡) ── */
    const mech = isBlank(asm.mech) ? Math.round(N * 4.5 * 10) / 10 : toNum(asm.mech);
    const upOf = (loc, v) => (loc === '지상' ? v : 0);
    const adminUp = upOf(asm.mgmtLoc, mgmtPlan) + upOf(asm.mdfLoc, mdf) + upOf(asm.bangjaeLoc, bangjae);
    const guardUp = upOf(asm.guardLoc, guard);
    const mechUp = upOf(asm.mechLoc, mech);

    /* ── 주민공동시설 (§55의2 총량제 — 조례 입력 시 조례 우선, 공란이면 규정 산식) ── */
    const commLegalStat = N >= 100 ? (N < 1000 ? 2.5 * N : 500 + 2 * N) : 0;
    const commOrd = !isBlank(asm.commLegalOrd);
    const commLegal = commOrd ? toNum(asm.commLegalOrd, 0) : commLegalStat;
    /* 시설별 법정: 조례 입력 시 조례 우선(공란 = 가이드라인 산식, §55의2⑥) · 계획 공란 = 법정값 자동 적용 */
    const facCalc = FACILITIES.map((f) => {
      const required = N >= f.th;
      const ordRaw = (asm.facOrd || {})[f.key];
      const gOrd = required && !isBlank(ordRaw);
      const g = required ? (gOrd ? toNum(ordRaw, 0) : f.guide(N)) : null;
      const planRaw = (asm.fac || {})[f.key];
      const planAuto = isBlank(planRaw);
      const plan = planAuto ? (required && g > 0 ? Math.ceil(g) : 0) : toNum(planRaw, 0);
      const loc2 = f.loc === '옥내' ? ((asm.facLoc || {})[f.key] || '지상') : '부지';
      return { ...f, required, g, gOrd, gtext: required ? (gOrd ? `조례 ${fmt(g, 1)}` : f.gtxt(N)) : '해당 없음', plan, planAuto, loc2 };
    });
    /* 조례 추가 주민공동시설(§55의2④) — ③항 시설 외에 조례로 따로 정하는 세대수별 종류 */
    const extraCalc = (asm.extraFacs || []).map((x) => {
      const hasTh = !isBlank(x.th);
      const thN = toNum(x.th, 0);
      const required = hasTh ? N >= thN : null; /* null = 임의(계획) 시설 */
      const ordA = toNum(x.area, 0);
      const planAuto = isBlank(x.plan);
      const plan = planAuto ? (required === true && ordA > 0 ? Math.ceil(ordA) : 0) : toNum(x.plan, 0);
      return { ...x, hasTh, thN, required, ordA, plan, planAuto, loc: x.loc || '지상' };
    });
    const extraIn = extraCalc.filter((x) => x.loc !== '옥외');
    const commIndoor = facCalc.filter((f) => f.loc === '옥내').reduce((s, f) => s + f.plan, 0) + extraIn.reduce((s, x) => s + x.plan, 0); /* 연면적 산입 대상 */
    const commAbove = facCalc.filter((f) => f.loc === '옥내' && f.loc2 === '지상').reduce((s, f) => s + f.plan, 0) + extraIn.filter((x) => x.loc === '지상').reduce((s, x) => s + x.plan, 0);
    const commUnder = commIndoor - commAbove;
    const commOutdoor = facCalc.filter((f) => f.loc === '옥외').reduce((s, f) => s + f.plan, 0) + extraCalc.filter((x) => x.loc === '옥외').reduce((s, x) => s + x.plan, 0); /* 부지면적(§55의2②) — 연면적 미산입 */
    const commPlanTotal = commIndoor + commOutdoor; /* 총량 비교 = 옥내 전용 + 옥외 부지 */
    const commGuideSum = facCalc.reduce((s, f) => s + (f.g || 0), 0);

    /* ── 연면적 (항목별 지상/지하 위치 반영 — 지하 배치분 용적률 미산입) ──
       지상 기계·전기실은 공동주택의 경우 바닥면적 미산입(건축법 시행령 §119①3호마목) → 연면적·용적률 산정 제외 */
    const extraBase = toNum(asm.extraBase, 0);
    const gita2Up = adminUp + guardUp + commAbove; /* 연면적 산입 지상분 — mechUp(지상 기전실)은 §119①3호마목 미산입 */
    const gita2Dn = (adminTotal - adminUp) + (guard - guardUp) + (mech - mechUp) + commUnder + extraBase;
    const gfaAbove = totalSUP + retail + gita2Up;
    const farGFA = gfaAbove; /* 용적률산정연면적(지상 부속주차 없음 가정, 건축법 시행령 §119) */
    const gfaBelow = parkBaseArea + gita2Dn + retailB;
    const gfaTotal = gfaAbove + gfaBelow;

    /* ── 건축면적 (동구성 기준층 합 × 계수 · 동구성 미입력 시 지상연면적/층수 방식) ── */
    const coef = toNum(bld.coef, 1.15);
    const footprint = B.reduce((s, b) => s + b.floorGross * b.count, 0);
    const bAreaAuto = footprint > 0 ? footprint * coef : (gfaAbove / up) * coef;
    const bAreaMethod = footprint > 0 ? `Σ동 기준층 ${fmt(footprint, 1)}㎡ × ${fmt(coef, 2)}` : `(지상연면적÷${up}층) × ${fmt(coef, 2)}`;
    const bArea = bld.areaMode === 'manual' && !isBlank(bld.areaManual) ? toNum(bld.areaManual) : bAreaAuto;

    /* ── 건폐율 · 용적률 ── */
    const bcr = siteArea > 0 ? (bArea / siteArea) * 100 : 0;
    const far = siteArea > 0 ? (farGFA / siteArea) * 100 : 0;
    const bcrLimit = toNum(zone.bcr, 0);
    const farBase = toNum(zone.farBase, 0), farAllow = toNum(zone.farAllow, 0), farMax = toNum(zone.farMax, 0);
    const farCap = farMax > 0 ? farMax : farAllow > 0 ? farAllow : farBase;
    let farLevel = '−';
    if (siteArea > 0 && farCap > 0) {
      if (farBase > 0 && far <= farBase + 1e-9) farLevel = '기준 이내';
      else if (farAllow > 0 && far <= farAllow + 1e-9) farLevel = '허용 이내';
      else if (farMax > 0 && far <= farMax + 1e-9) farLevel = '상한 이내';
      else farLevel = '한도 초과';
    }
    const jBcr = siteArea > 0 && bcrLimit > 0 ? bcr <= bcrLimit + 1e-9 : null;
    const jFar = siteArea > 0 && farCap > 0 ? far <= farCap + 1e-9 : null;

    /* ── 조경 (건축법 §42 + 지자체 건축조례 — 비율 입력) ── */
    const landRatio = toNum(zone.landRatio, 15);
    const landLegal = (siteArea * landRatio) / 100;
    const landPlan = isBlank(asm.landPlan) ? Math.ceil(landLegal) : toNum(asm.landPlan);
    const jLand = siteArea > 0 ? landPlan >= landLegal - 1e-9 : null;

    /* ── 진입도로 (§25①) ── */
    const roadReq = accessRoad(N);

    /* ── 세대별 면적표 (안분 = 전용면적 비율) ── */
    const budae = adminTotal + guard + mech + extraBase + commIndoor; /* 기타공용 中 부대시설 — 주민공동(옥내) 포함(검토서 관행), 사업장별 상이 시 조정 */
    const gitaTotal = budae + parkBaseArea;
    const rows = T.filter((t) => t.u > 0).map((t) => {
      const ratio = N > 0 ? (t.u / N) * 100 : 0;
      const jr = totalJ > 0 ? t.a / totalJ : 0;
      const budaeU = jr * budae;
      const parkU = jr * parkBaseArea;
      const gitaU = budaeU + parkU;
      const contract = t.sup + gitaU;
      return { ...t, ratio, budaeU, parkU, gitaU, contract };
    });
    const sumWall = rows.reduce((s, r) => s + r.wall * r.u, 0);
    const sumStair = rows.reduce((s, r) => s + r.stair * r.u, 0);
    const sumContract = totalSUP + gitaTotal;

    /* ── 주택유형 판정 (건축법 시행령 [별표1] 2호 — 동구성 기준층×층수 근사) ── */
    let judgedType = null;
    if (B.length > 0) {
      const maxFloors = Math.max(...B.map((b) => b.maxFl));
      if (maxFloors >= 5) judgedType = '아파트';
      else judgedType = B.some((b) => b.bldgFloorArea > 660) ? '연립주택' : '다세대주택';
    } else if (up >= 5 && T.length > 0) {
      judgedType = '아파트';
    }
    const typeMatch = judgedType ? judgedType === bld.useType : null;

    const jPark = N > 0 ? parkPlanned >= parkLegal : null;
    const jMgmt = N >= 50 ? mgmtPlan >= mgmtLegal - 1e-9 : null;
    const jComm = N >= 100 ? commPlanTotal >= commLegal - 1e-9 : null;

    const effSupply = totalSUP > 0 ? (totalJ / totalSUP) * 100 : 0;
    const effContract = sumContract > 0 ? (totalJ / sumContract) * 100 : 0;

    return {
      siteArea, up, down, fh, T, N, totalJ, totalCM, totalSUP,
      B, totalBldgs, bldgDisp, totalCoreArea, useCore, stairRate, unitsCheck, unitsMatch, footprint, bAreaMethod,
      region, u85eff, o85eff, ordU, ordO, parkU85, parkO85, parkAreaBased, parkUnitMin, parkBandBased, pkMode, pkBandOnly, parkGovern,
      parkLegalHousing, parkLegalRetail, parkLegal, parkPlanned, plannedPerUnit, parkSurface, parkBaseStalls, parkBaseArea, stallArea,
      disabledPct, dLegal, dPlan,
      mgmtLegal, mgmtPlan, mdf, bangjae, guard, adminTotal, adminUp, guardUp, mechUp, mech,
      commLegal, commLegalStat, commOrd, facCalc, extraCalc, commIndoor, commAbove, commUnder, commOutdoor, commPlanTotal, commGuideSum,
      retail, retailB, retailDenom, extraBase, gita2Up, gita2Dn, gfaAbove, gfaBelow, gfaTotal, farGFA,
      bArea, bAreaAuto, coef, bcr, far, bcrLimit, farBase, farAllow, farMax, farCap, farLevel, jBcr, jFar,
      landRatio, landLegal, landPlan, jLand, roadReq,
      budae, gitaTotal, rows, sumWall, sumStair, sumContract,
      judgedType, typeMatch, jPark, jMgmt, jComm, effSupply, effContract,
    };
  }, [site, zone, bld, types, cores, blocks, asm]);

  const syncUnits = () => setTypes((ts) => ts.map((t) => {
    const c = D.unitsCheck.find((x) => String(x.id) === String(t.id));
    return c && c.inDong ? { ...t, units: String(c.derived) } : t; /* 동구성에 없는 타입은 입력값 보존 */
  }));
  const up$ = (loc, v) => (loc === '지상' ? v : 0);
  const dn$ = (loc, v) => (loc === '지상' ? 0 : v);

  const zoneName = (ZONES.find((z) => z.id === zone.zoneId) || {}).name || '';
  const locText = [proj.sido, proj.si, proj.detail].filter((s) => !isBlank(s)).join(' ');
  const useText = `${bld.useType} 및 부대복리시설${D.retail > 0 ? ', 근린생활시설' : ''}`;
  const retail$ = D.retail + D.retailB; /* 근생 지상+지하 합 — 주차 통합표·용도별 개요 분기용 */

  return (
    <div className="fov" style={{ fontFamily: FONT, background: '#efece3', minHeight: '100vh' }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '18px 16px 46px' }}>

        {/* ── 헤더 + 툴바 ── */}
        <div className="noprint" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 900, letterSpacing: '.02em' }}>사업성검토용 설계개요 자동산정 <span className="verbadge">{APP_META.version}</span></h1>
            <div style={{ fontSize: 11.5, color: '#6b6353', marginTop: 3 }}>
              공동주택 규모검토 · 법정기준: 주택건설기준 등에 관한 규정(시행 2026.5.6.) §25 · §27 · §28 · §55의2 — 법제처 국가법령정보 원문 조회 기준 · <b>개발자 : {APP_META.author}</b>
            </div>
          </div>
          <div className="toolbar">
            <select value="" onChange={(e) => { const v = e.target.value; e.target.value = ''; if (!v) return; const [op, n] = v.split(':'); if (op === 's') saveSlot(n); else loadSlot(n); }} title="프리셋 1~3 저장/불러오기">
              <option value="">프리셋 저장/불러오기…</option>
              <option value="s:1">현재 입력 → 프리셋1 저장</option>
              <option value="s:2">현재 입력 → 프리셋2 저장</option>
              <option value="s:3">현재 입력 → 프리셋3 저장</option>
              <option value="l:1">프리셋1 불러오기</option>
              <option value="l:2">프리셋2 불러오기</option>
              <option value="l:3">프리셋3 불러오기</option>
            </select>
            <button className="btn" onClick={exportJSON} title="현재 입력 전체를 JSON 파일로 저장">JSON 내보내기</button>
            <button className="btn" onClick={() => fileRef.current && fileRef.current.click()} title="저장한 JSON 파일 불러오기">JSON 가져오기</button>
            <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={importJSON} />
            <button className="btn" onClick={undo} title="실행취소 (Ctrl+Z) — 행 추가·삭제·이동·프리셋 적용 단위">↩ 실행취소</button>
            <button className="btn pri" onClick={() => { pushHist(); applyState(PRESET_AS); }}><FlaskConical size={14} /> 예시 불러오기</button>
            <button className="btn" onClick={() => { pushHist(); applyState(BLANK); }}><RotateCcw size={14} /> 초기화</button>
            <button className="btn" onClick={() => { try { window.print(); } catch (e) { /* noop */ } }} title="③ 설계개요 탭만 한 장으로 인쇄/PDF 저장">인쇄 / PDF</button>
            {slotMsg ? <span className="slotmsg">{slotMsg}</span> : null}
          </div>
        </div>

        <div className="tabbar noprint">
          <button className={tab === 'input' ? 'on' : ''} onClick={() => setTab('input')}>① 입력</button>
          <button className={tab === 'check' ? 'on' : ''} onClick={() => setTab('check')}>② 검산</button>
          <button className={tab === 'sheet' ? 'on' : ''} onClick={() => setTab('sheet')}>③ 설계개요</button>
        </div>

        {/* ════════ ① 입력 탭 ════════ */}
        <div className={'tabsec sec-in' + (tab === 'input' ? '' : ' hide')}>
          <div className="guidebox">
            <div className="guidehd"><span className="gicon">!</span> 입력 안내 — 시작하기 전에 확인하세요</div>
            <div className="guidebody">
              <span className="gchip gy">노란 칸</span> 법규·수치 <b>산정에 연동</b>되는 필수 입력 (건폐·용적·주차·면적표에 직접 반영)<br />
              <span className="gchip gw">흰 칸 [표기]</span> 설계개요 <b>문구 표기 전용</b> — 산정과 무관 (사업명·위치·도로 등 · 층고·기부채납은 개요 표기값으로만 반영)<br />
              <span className="gnote">※ 노란 칸을 비우면 자동 산정값(또는 추정치)이 적용됩니다 · 우측 상단 <b>「예시 불러오기」</b>(991세대·근생 포함)으로 입력 예시를 불러올 수 있습니다</span>
            </div>
          </div>
          <div className="ingrid">
            <div className="panel wide">
              <p className="ptitle">① 기본 정보</p>
              <div className="fgrid">
                <Fld label="사업명" cls="sp2" tx><FIn v={proj.name} on={uProj('name')} w="100%" num={false} ph="○○ 공동주택 신축사업" /></Fld>
                <Fld label="시 · 도 (선택)">
                  <>
                    <FSel v={SIDO_LIST.includes(proj.sido) ? proj.sido : '__etc'} on={(v) => {
                      if (v === '__etc') { setProj((s) => ({ ...s, sido: '', si: '' })); return; }
                      const firstSi = (SIDO_SGG[v] || [])[0] || '';
                      setProj((s) => ({ ...s, sido: v, si: firstSi }));
                      setAsm((s) => ({ ...s, region: guessRegion(v, firstSi) }));
                    }} w="100%" opts={[...SIDO_LIST.map((x) => ({ value: x, label: x })), { value: '__etc', label: '직접 입력…' }]} />
                    {!SIDO_LIST.includes(proj.sido) && <FIn v={proj.sido} on={uProj('sido')} w="100%" num={false} ph="시·도 직접 입력" />}
                  </>
                </Fld>
                <Fld label="시 · 군 · 구 (선택)" hint={`주차 지역구분 자동: ${(PARKING_REGIONS.find((r) => r.id === guessRegion(proj.sido, proj.si)) || { label: '—' }).label} (⑥에서 변경 가능 · 확인필요)`}>
                  <>
                    {(SIDO_SGG[proj.sido] || []).length > 0 ? (
                      <FSel v={(SIDO_SGG[proj.sido] || []).includes(proj.si) ? proj.si : '__etc'} on={(v) => {
                        if (v === '__etc') { setProj((s) => ({ ...s, si: '' })); return; }
                        setProj((s) => ({ ...s, si: v }));
                        setAsm((s) => ({ ...s, region: guessRegion(proj.sido, v) }));
                        fetchOrdinance(v); /* 시·군·구 선택 → 해당 지자체 조례 자동 조회(법제처) */
                      }} w="100%" opts={[...(SIDO_SGG[proj.sido] || []).map((x) => ({ value: x, label: x })), { value: '__etc', label: '직접 입력…' }]} />
                    ) : null}
                    {!((SIDO_SGG[proj.sido] || []).includes(proj.si)) && <FIn v={proj.si} on={uProj('si')} w="100%" num={false} ph="시·군·구 직접 입력" />}
                  </>
                </Fld>
                <Fld label="상세 위치" tx><FIn v={proj.detail} on={uProj('detail')} w="100%" num={false} ph="○○동 ○○번지 일원" /></Fld>
                <Fld label="접한 도로" cls="sp2" tx><FIn v={proj.road} on={uProj('road')} w="100%" num={false} ph="예: 8M 도로, 25M 도로" /></Fld>
                <div className="sp2" style={{ marginTop: 2 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn" onClick={() => fetchOrdinance(proj.si)} disabled={ordState.status === 'loading'} title="법제처 자치법규에서 해당 시·군·구 조례값을 조회해 공란에 자동 적용 (주차·조경·건폐/용적·주민공동시설)">
                      {ordState.status === 'loading' ? '조례 조회 중…' : '⟳ 지자체 조례 자동 조회 (법제처)'}
                    </button>
                    {ordState.status === 'loading' && <span className="nt">{ordState.msg}</span>}
                    {ordState.status === 'error' && <span className="nt" style={{ color: '#a05252' }}>{ordState.msg}</span>}
                  </div>
                  {ordState.status === 'done' && (
                    <div className="nt" style={{ marginTop: 6, lineHeight: 1.8 }}>
                      <b style={{ color: '#2b6e46' }}>{ordState.si} 조례 자동 적용 완료</b>
                      {' — 적용 ' + ordState.applied.length + '건'}{ordState.applied.length > 0 ? ': ' + ordState.applied.join(' · ') : ''}
                      {ordState.kept.length > 0 && <><br />기존 입력 유지 {ordState.kept.length}건({ordState.kept.join(' · ')}) — 자동값으로 바꾸려면 해당 칸을 비우고 재조회</>}
                      {ordState.missing.length > 0 && <><br />조례 미검출 {ordState.missing.length}건 — 상위법 기준 적용, 해당 조례 직접 확인필요</>}
                      {Object.values(ordState.srcs).filter(Boolean).length > 0 && <><br />출처: {Object.values(ordState.srcs).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 4).join(' / ')}</>}
                      <br /><span style={{ color: '#a05252' }}>※ AI 추출값 — 법제처 자치법규 원문 대조 확인필요 · 처분시법주의(허가신청 시점의 시행 조례 기준)</span>
                      {ordState.note ? <><br />비고: {ordState.note}</> : null}
                    </div>
                  )}
                </div>
              </div>
            </div>

<div className="panel">
              <p className="ptitle">② 대지 · 용도지역 · 법정 한도 <span className="pdesc">— 건폐율·용적률·조경비율은 조례/지구단위계획 우선(확인필요)</span></p>
              <div className="fgrid">
                <Fld label="실사용 대지면적 (㎡)"><FIn v={site.area} on={uSite('area')} w="100%" /></Fld>
                <Fld label="기부채납 면적 (㎡)" tx><FIn v={site.donate} on={uSite('donate')} w="100%" /></Fld>
                <Fld label="용도지역" hint="국토계획법 시행령 §84·§85 범위 자동입력">
                  <FSel v={zone.zoneId} on={onZoneSelect} w="100%" opts={ZONES.map((z) => ({ value: z.id, label: z.name }))} />
                </Fld>
                <Fld label="지역지구 병기" tx><FIn v={zone.district} on={uZone('district')} w="100%" num={false} ph="예: 지구단위계획구역" /></Fld>
                <Fld label="법정 건폐율 (%)"><FIn v={zone.bcr} on={uZone('bcr')} w="100%" /></Fld>
                <Fld label="용적률 기준 (%)"><FIn v={zone.farBase} on={uZone('farBase')} w="100%" /></Fld>
                <Fld label="용적률 허용 (%)"><FIn v={zone.farAllow} on={uZone('farAllow')} w="100%" ph="−" /></Fld>
                <Fld label="용적률 상한 (%)"><FIn v={zone.farMax} on={uZone('farMax')} w="100%" /></Fld>
                <Fld label="조경비율 (%)" hint="통상 연면적 2,000㎡↑ 15% — 건축조례"><FIn v={zone.landRatio} on={uZone('landRatio')} w="100%" /></Fld>
              </div>
            </div>

<div className="panel">
              <p className="ptitle">③ 규모 · 형식</p>
              <div className="fgrid">
                <Fld label="공동주택 용도">
                  <FSel v={bld.useType} on={uBld('useType')} w="100%" opts={USE_TYPES.map((u) => ({ value: u, label: u }))} />
                </Fld>
                <Fld label="지상 층수" hint="최고층 기준"><FIn v={bld.up} on={uBld('up')} w="100%" /></Fld>
                <Fld label="주동수" tx hint="공란 = ④ 동구성 동수 합 · 라인 분해 입력 시 실제 주동수 기입"><FIn v={bld.bldgCount} on={uBld('bldgCount')} w="100%" ph="자동" /></Fld>
                <Fld label="지하 층수"><FIn v={bld.down} on={uBld('down')} w="100%" /></Fld>
                <Fld label="층고 (M)" tx><FIn v={bld.fh} on={uBld('fh')} w="100%" /></Fld>
                <Fld label="건축면적 산정">
                  <FSel v={bld.areaMode} on={uBld('areaMode')} w="100%" opts={[{ value: 'auto', label: '자동 (기준층 × 계수)' }, { value: 'manual', label: '직접 입력' }]} />
                </Fld>
                {bld.areaMode === 'auto'
                  ? <Fld label="건축면적 계수" hint="발코니 등 할증 · 추정치"><FIn v={bld.coef} on={uBld('coef')} w="100%" /></Fld>
                  : <Fld label="건축면적 (㎡)"><FIn v={bld.areaManual} on={uBld('areaManual')} w="100%" /></Fld>}
              </div>
            </div>

<div className="panel wide">
              <p className="ptitle">④ 동 구성 — 코어 · 동타입 · 동수 <span className="pdesc">— 2호조합 = 코어 1개 + 세대 2호/층 · 4호조합 = 코어 2개 + 세대 4호/층 · 동타입 × 동수 = 주동수 → 건축면적·계단복도·연면적 자동 반영</span></p>

              <div className="ttl2">■ 코어 바닥면적 기입 (㎡/개·층)</div>
              <div className="nt" style={{ margin: '-2px 0 6px' }}>각 코어(계단실+승강기홀 등)의 <b>1개층 바닥면적</b>을 입력 — 전용·벽체 제외 · 동타입에서 이 코어를 선택하면 계단·복도 면적으로 자동 안분</div>
              <div className="fgrid" style={{ maxWidth: 980, marginBottom: 12 }}>
                {cores.map((c) => (
                  <Fld key={c.k} label={`코어 ${c.k} 바닥면적`}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <FIn v={c.area} on={uCore(c.k)} w="100%" ph="0" />
                      <button className="icb del" onClick={() => delCore(c.k)} disabled={cores.length <= 1} title={cores.length <= 1 ? '최소 1개 코어 필요' : `코어 ${c.k} 삭제 (사용 중인 동타입의 코어 선택은 공란 처리 · Ctrl+Z 복원)`} style={cores.length <= 1 ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}>−</button>
                    </div>
                  </Fld>
                ))}
                <Fld label="코어 추가" hint="A~Z 순차 부여"><button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={addCore}><Plus size={14} /> 코어 추가</button></Fld>
              </div>

              <div className="ttl2">■ 동타입 정의 (2호조합 / 4호조합)</div>
              <table className="g ttable" style={{ maxWidth: 1140, border: '1px solid #a89e87' }}>
                <colgroup>
                  <col style={{ width: '4%' }} /><col style={{ width: '7%' }} /><col style={{ width: '8%' }} />
                  <col style={{ width: '9%' }} /><col style={{ width: '11%' }} /><col style={{ width: '11%' }} />
                  <col style={{ width: '9%' }} /><col style={{ width: '11%' }} /><col style={{ width: '11%' }} />
                  <col style={{ width: '7%' }} /><col style={{ width: '12%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th title="≡ 드래그로 순서 이동">≡</th><th>동타입</th><th>조합</th>
                    <th>코어 ①</th><th>호 1</th><th>호 2</th>
                    <th>코어 ②</th><th>호 3</th><th>호 4</th>
                    <th>층수</th><th>+ / −</th>
                  </tr>
                </thead>
                <tbody>
                  {blocks.map((b, bi) => {
                    const is4 = b.combo === '4';
                    const typeOpts = [{ value: '', label: '−' }, ...types.map((t) => ({ value: String(t.id), label: t.name || `타입${t.id}` }))];
                    const coreOpts = cores.map((c) => ({ value: c.k, label: `코어${c.k}` }));
                    return (
                      <tr key={b.id} {...rowDrop('blocks', b.id)}>
                        <td className="ctr handle" {...rowGrab('blocks', b.id)} title="드래그하여 순서 이동">≡</td>
                        <th>동타입{String.fromCharCode(65 + bi)}</th>
                        <td><FSel v={b.combo} on={uBlock(b.id, 'combo')} w="100%" opts={[{ value: '2', label: '2호조합' }, { value: '4', label: '4호조합' }]} />
                        {is4 && <div style={{ marginTop: 2 }}><FSel v={b.shape || ''} on={uBlock(b.id, 'shape')} w="100%" opts={[{ value: '', label: '─ 일자' }, { value: 'L', label: 'ㄱ자' }]} /></div>}</td>
                        <td><FSel v={b.core1} on={uBlock(b.id, 'core1')} w="100%" opts={coreOpts} /></td>
                        <td><FSel v={b.s1} on={uBlock(b.id, 's1')} w="100%" opts={typeOpts} />
                        <div className="slotex"><FIn v={b.fl1} on={uBlock(b.id, 'fl1')} w="50%" ph={String(isBlank(b.floors) ? D.up : b.floors)} /><label className="pchk" title="1층 필로티 — 해당 호 주거층수 −1"><input type="checkbox" checked={b.p1 === '1'} onChange={(e) => uBlock(b.id, 'p1')(e.target.checked ? '1' : '')} />P</label></div></td>
                        <td><FSel v={b.s2} on={uBlock(b.id, 's2')} w="100%" opts={typeOpts} />
                        <div className="slotex"><FIn v={b.fl2} on={uBlock(b.id, 'fl2')} w="50%" ph={String(isBlank(b.floors) ? D.up : b.floors)} /><label className="pchk" title="1층 필로티 — 해당 호 주거층수 −1"><input type="checkbox" checked={b.p2 === '1'} onChange={(e) => uBlock(b.id, 'p2')(e.target.checked ? '1' : '')} />P</label></div></td>
                        {is4 ? (
                          <>
                            <td><FSel v={b.core2} on={uBlock(b.id, 'core2')} w="100%" opts={coreOpts} /></td>
                            <td><FSel v={b.s3} on={uBlock(b.id, 's3')} w="100%" opts={typeOpts} />
                        <div className="slotex"><FIn v={b.fl3} on={uBlock(b.id, 'fl3')} w="50%" ph={String(isBlank(b.floors) ? D.up : b.floors)} /><label className="pchk" title="1층 필로티 — 해당 호 주거층수 −1"><input type="checkbox" checked={b.p3 === '1'} onChange={(e) => uBlock(b.id, 'p3')(e.target.checked ? '1' : '')} />P</label></div></td>
                            <td><FSel v={b.s4} on={uBlock(b.id, 's4')} w="100%" opts={typeOpts} />
                        <div className="slotex"><FIn v={b.fl4} on={uBlock(b.id, 'fl4')} w="50%" ph={String(isBlank(b.floors) ? D.up : b.floors)} /><label className="pchk" title="1층 필로티 — 해당 호 주거층수 −1"><input type="checkbox" checked={b.p4 === '1'} onChange={(e) => uBlock(b.id, 'p4')(e.target.checked ? '1' : '')} />P</label></div></td>
                          </>
                        ) : (
                          <td colSpan={3} className="ctr nt dimcell">− (2호조합: 코어 1개)</td>
                        )}
                        <td><FIn v={b.floors} on={uBlock(b.id, 'floors')} w="100%" ph={String(D.up)} /></td>
                        <td className="ctr" style={{ whiteSpace: 'nowrap' }}>
                          <button className="icb add" onClick={() => insertBlockAfter(b.id)} title="이 행 아래에 동타입 추가">＋</button>
                          <button className="icb del" onClick={() => delBlock(b.id)} title="행 삭제 (Ctrl+Z로 되돌리기)">−</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ marginTop: 8 }}>
                <button className="btn" onClick={addBlock}><Plus size={14} /> 동타입 추가</button>
              </div>

              <div className="nt" style={{ marginTop: 4 }}>※ 각 호 아래 입력: <b>층수</b>(공란 = 동 층수) · <b>P</b> = 1층 필로티(해당 호 주거층수 −1) — 한 동 안에서 호별 층수·필로티를 다르게 둘 수 있습니다</div>
              <div className="ttl2" style={{ marginTop: 14 }}>■ 동타입 평면 모식도 (참고)</div>
              <div className="dgwrap">
                {blocks.map((b, bi) => <DongDiagram key={'dg' + b.id} b={b} bi={bi} types={types} cores={cores} info={D.B.find((z) => z.id === b.id)} />)}
              </div>
              <div className="nt" style={{ marginTop: 2, marginBottom: 4 }}>※ 기준층 평면 개념도 — 세대 폭은 전용면적 비례(개념 표현) · 빗금 = 코어(계단실·승강기) · 4호조합 = 2개 유닛 맞벽 연접(배치 'ㄱ자' 선택 시 두 번째 유닛을 세로 날개로 표현) · <span style={{ color: '#9a4036', fontWeight: 700 }}>✕ + (1P)</span> = 1층 필로티 호(주거층수 −1) · 호 라벨 옆 숫자F = 해당 호 층수(동 층수와 다를 때) · 실제 평면 세부 형상(돌출부·발코니 등)·인동 배치 미반영</div>

              <div className="ttl2" style={{ marginTop: 14 }}>■ 동타입별 동수구성</div>
              <table className="g ttable" style={{ maxWidth: 820, border: '1px solid #a89e87' }}>
                <colgroup>
                  <col style={{ width: '11%' }} /><col style={{ width: '38%' }} /><col style={{ width: '9%' }} /><col style={{ width: '12%' }} /><col style={{ width: '14%' }} /><col style={{ width: '16%' }} />
                </colgroup>
                <thead>
                  <tr><th>동타입</th><th>구성 요약</th><th>층수</th><th>동수</th><th>동당 세대</th><th>산출 세대</th></tr>
                </thead>
                <tbody>
                  {blocks.map((b, bi) => {
                    const bc = D.B.find((x) => x.id === b.id);
                    return (
                      <tr key={'c' + b.id}>
                        <th>동타입{String.fromCharCode(65 + bi)}</th>
                        <td className="ctr nt">{bc ? `${bc.coreDesc} · ${bc.items.map((x) => `${x.t.name || '타입'}×${x.n}`).join(' + ') || '세대 미지정'}` : '구성 미완성'}</td>
                        <td className="num">{bc ? (bc.minFl === bc.maxFl ? bc.maxFl : `${bc.minFl}~${bc.maxFl}`) : '−'}</td>
                        <td><FIn v={b.count} on={uBlock(b.id, 'count')} w="100%" ph="0" /></td>
                        <td className="num">{bc ? bc.unitsPerDong : 0}</td>
                        <td className="num">{bc ? bc.unitsTotal : 0}</td>
                      </tr>
                    );
                  })}
                  <tr className="sumrow">
                    <th colSpan={3}>합 계 (총 주동수)</th>
                    <td className="num"><b>{D.totalBldgs} 동</b></td>
                    <td />
                    <td className="num"><b>{D.unitsCheck.reduce((s, c) => s + c.derived, 0)} 세대</b></td>
                  </tr>
                </tbody>
              </table>
              <div className="frow" style={{ marginTop: 8, alignItems: 'center' }}>
                <button className="btn" onClick={syncUnits}>산출 세대수를 ⑤ 타입표에 반영</button>
                <span className="nt">
                  세대수 대조 (산출/입력): {D.unitsCheck.length > 0 ? D.unitsCheck.map((c) => `${c.name || '타입'} ${c.derived}/${c.input}`).join(' · ') : '−'}
                  {D.unitsMatch === true && <span className="badge ok">일치</span>}
                  {D.unitsMatch === false && <span className="badge ng">불일치 — 동수구성 확인</span>}
                  {D.useCore && <span style={{ marginLeft: 8 }}>총 코어면적 {fmt(D.totalCoreArea, 2)}㎡ (전용 대비 {fmt(D.stairRate * 100, 2)}%) · Σ기준층 {fmt(D.footprint, 1)}㎡</span>}
                </span>
              </div>
              <div className="fgrid" style={{ marginTop: 10, maxWidth: 400 }}>
                <Fld label="동구성 미입력 시 계단·복도 추정비율 (%)" hint="전용 대비 · 추정치"><FIn v={asm.stairRatio} on={uAsm('stairRatio')} w="100%" /></Fld>
              </div>
            
{/* ───── 주택유형 판정 (참고) ───── */}
          <div className="ttl"><span>■ 주 택 유 형 판 정 (참고)</span><span className="unit">건축법 시행령 [별표1] 2호 — 동당 (전용+벽체+코어)×층수 근사 · 확인필요</span></div>
          <table className="g" style={{ maxWidth: 860 }}>
            <colgroup><col style={{ width: '9%' }} /><col style={{ width: '30%' }} /><col style={{ width: '13%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} /><col style={{ width: '15%' }} /><col style={{ width: '17%' }} /></colgroup>
            <tbody>
              <tr><th>동타입</th><th>세대 조합 (호/층)</th><th>코어</th><th>층수</th><th>동수</th><th>동당 바닥면적</th><th>660㎡ 기준</th></tr>
              {D.B.length === 0 && (
                <tr><td colSpan={7} className="ctr nt" style={{ padding: 12 }}>④ 동 구성을 입력하면 동별로 판정합니다.</td></tr>
              )}
              {D.B.map((b) => (
                <tr key={'jb' + b.id}>
                  <td className="ctr">{b.label}</td>
                  <td className="ctr">{b.items.map((x) => `${x.t.name || '타입'}×${x.n}`).join(' + ') || '−'}</td>
                  <td className="ctr">{b.coreDesc || '−'}</td>
                  <td className="num">{b.floors}</td>
                  <td className="num">{b.count}</td>
                  <td className="num">{fmt(b.bldgFloorArea, 2)}</td>
                  <td className="ctr">{b.floors >= 5 ? '5개층 이상 → 아파트' : b.bldgFloorArea > 660 ? '660㎡ 초과 → 연립급' : '660㎡ 이하 → 다세대급'}</td>
                </tr>
              ))}
              <tr className="sumrow">
                <th colSpan={5}>종합 판정 {D.B.length > 0 ? `(최고 ${Math.max(...D.B.map((b) => b.floors))}층 기준)` : `(지상 ${D.up}층 기준)`}</th>
                <td colSpan={2} className="ctr">
                  {D.judgedType ? <><b>{D.judgedType}</b><Badge ok={D.typeMatch} yes={`선택(${bld.useType}) 일치`} no={`선택(${bld.useType}) 불일치`} /></> : <span className="nt">동 구성 입력 시 판정</span>}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="nt" style={{ marginTop: 4 }}>
            ※ 바닥면적은 발코니·복도 돌출부·필로티(§119①3호다목 미산입) 등 미반영 근사치 · 동별 판정 혼재 시 상위 유형(연립) 표기 · 2개 이상 동을 지하주차장으로 연결하는 경우 각각의 동으로 봄([별표1] 2호 — 확인필요)
          </div>
            </div>

            

<div className="panel wide">
              <p className="ptitle">⑤ 세대 타입 <span className="pdesc">— 주거공용 中 벽체공용만 입력(공란 시 전용×비율 자동) · 계단·복도는 ④ 동구성·코어에서 자동 산출</span></p>
              <table className="g ttable" style={{ maxWidth: 720, border: '1px solid #a89e87' }}>
                <colgroup><col style={{ width: '5%' }} /><col style={{ width: '26%' }} /><col style={{ width: '20%' }} /><col style={{ width: '13%' }} /><col style={{ width: '22%' }} /><col style={{ width: '14%' }} /></colgroup>
                <thead>
                  <tr><th title="≡ 드래그로 순서 이동">≡</th><th>타입명 <span style={{ fontWeight: 400, color: '#9a9180' }}>(표기)</span></th><th>전용면적(㎡)</th><th>세대수</th><th>벽체공용(㎡/세대)</th><th>+ / −</th></tr>
                </thead>
                <tbody>
                  {types.map((t) => (
                    <tr key={t.id} {...rowDrop('types', t.id)}>
                      <td className="ctr handle" {...rowGrab('types', t.id)} title="드래그하여 순서 이동 — 면적표 순서에 반영">≡</td>
                      <td><FIn v={t.name} on={uType(t.id, 'name')} w="100%" num={false} ph="84㎡ A형" /></td>
                      <td><FIn v={t.area} on={uType(t.id, 'area')} w="100%" /></td>
                      <td><FIn v={t.units} on={uType(t.id, 'units')} w="100%" /></td>
                      <td><FIn v={t.wall} on={uType(t.id, 'wall')} w="100%" ph="자동" /></td>
                      <td className="ctr" style={{ whiteSpace: 'nowrap' }}>
                        <button className="icb add" onClick={() => insertTypeAfter(t.id)} title="이 행 아래에 타입 추가 (예: 84A 아래 84B)">＋</button>
                        <button className="icb del" onClick={() => delType(t.id)} title="행 삭제 (Ctrl+Z로 되돌리기)">−</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="fgrid" style={{ marginTop: 10, maxWidth: 560 }}>
                <Fld label="행 조작" hint="중간 삽입 = 각 행의 + 버튼 (아래에 추가)"><button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={addType}><Plus size={14} /> 타입 추가 (맨 끝)</button></Fld>
                <Fld label="자동 벽체공용비율 (전용 대비 %)" hint="통상 8~9% 수준 · 추정치"><FIn v={asm.wallRatio} on={uAsm('wallRatio')} w="100%" /></Fld>
              </div>
            </div>

<div className="panel">
              <p className="ptitle">⑥ 주차 계획 <span className="pdesc">— 조례 기준 입력 시 조례 우선, 공란이면 주택건설기준 §27①1 표 적용 (조례는 §27①1 단서로 강화 가능: 기준의 1/5, 60㎡ 이하 1/2 범위)</span></p>
              <div className="fgrid">
                <Fld label="주차 지역구분 (§27①1 표)" cls="sp2">
                  <FSel v={asm.region} on={uAsm('region')} w="100%" opts={PARKING_REGIONS.map((r) => ({ value: r.id, label: `${r.label} (1/${r.u85}·1/${r.o85})` }))} />
                </Fld>
                <Fld label="조례 기준 — 85㎡ 이하 (㎡/대)" hint={`공란 = 영 표 1/${D.region.u85}`}><FIn v={asm.ordU85} on={uAsm('ordU85')} w="100%" ph={String(D.region.u85)} /></Fld>
                <Fld label="조례 기준 — 85㎡ 초과 (㎡/대)" hint={`공란 = 영 표 1/${D.region.o85}`}><FIn v={asm.ordO85} on={uAsm('ordO85')} w="100%" ph={String(D.region.o85)} /></Fld>
                <Fld label="조례 산정 방식" hint="서울 등 일부 조례는 전용면적 구간별 세대당 비율식 — 해당 시 선택" cls="sp2">
                  <FSel v={asm.pkMode || 'area'} on={uAsm('pkMode')} w="100%" opts={[{ value: 'area', label: '면적당 기준 (㎡/대 — §27①1 표·조례)' }, { value: 'band', label: '세대당 비율 (전용면적 구간 — 조례 별표식)' }]} />
                </Fld>
                {asm.pkMode === 'band' && (
                  <div className="sp2">
                    <table className="g ttable" style={{ maxWidth: 440, border: '1px solid #a89e87' }}>
                      <colgroup><col style={{ width: '55%' }} /><col style={{ width: '45%' }} /></colgroup>
                      <thead><tr><th>전용면적 상한 (㎡)</th><th>설치 비율 (대/세대)</th></tr></thead>
                      <tbody>
                        {(asm.pkBands || []).map((b, i) => (
                          <tr key={'pkb' + b.id}>
                            <td><FIn v={b.max} on={uPkBand(b.id, 'max')} w="100%" ph={i === (asm.pkBands || []).length - 1 ? '공란 = 초과 전부' : ''} /></td>
                            <td><FIn v={b.r} on={uPkBand(b.id, 'r')} w="100%" ph="공란 = §27 최저" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <label className="pkonly">
                      <input type="checkbox" checked={asm.pkBandOnly === true} onChange={(e) => uAsm('pkBandOnly')(e.target.checked)} />
                      <span>면적당 기준(주차 지역구분 §27①1 표)·세대당 최저 <b>미반영</b> — 조례 비율식만 단독 적용</span>
                    </label>
                    <div className="nt" style={{ marginTop: 3 }}>
                      구간·비율은 해당 시·군 주차장 조례 별표 기준(확인필요) · 비율 공란 구간은 §27 세대당 최저(60㎡↓ 0.7 / 초과 1.0) 적용<br />
                      {asm.pkBandOnly === true
                        ? <><b style={{ color: '#a05252' }}>현재: 비율식 단독</b> — 법정대수 = 조례 비율식만 (면적·세대 기준 미반영). 조례가 §27 면적·세대 기준 이상을 요구하지 않는 경우에만 선택 — 확인필요</>
                        : <>현재: <b>최댓값 방식</b> — 법정대수 = max(조례 비율식, §27 면적기준, 세대당 최저) 올림. 셋 중 가장 큰 값 1개만 채택(합산 아님)</>}
                    </div>
                  </div>
                )}
                <Fld label="계획 주차원단위 (대/세대)" hint="입력 시 계획 = 세대수 × 원단위"><FIn v={asm.plannedRatio} on={uAsm('plannedRatio')} w="100%" ph="예: 1.4" /></Fld>
                <Fld label="계획 주차대수 (직접)" hint={`공란 = ${isBlank(asm.plannedRatio) ? `법정 ${D.parkLegal}대` : '원단위 적용'}`}><FIn v={asm.planned} on={uAsm('planned')} w="100%" ph={String(D.parkLegal)} /></Fld>
                <Fld label="지상 주차대수"><FIn v={asm.surface} on={uAsm('surface')} w="100%" /></Fld>
                <Fld label="대당 지하주차장 면적 (㎡)" hint="차로 포함 36.5~38 통용 · 추정치"><FIn v={asm.stall} on={uAsm('stall')} w="100%" /></Fld>
                <Fld label="장애인전용 주차비율 (%)" hint="편의증진법령·조례 확인필요"><FIn v={asm.disabledPct} on={uAsm('disabledPct')} w="100%" /></Fld>
                <Fld label="근생 주차기준 (㎡/대)" hint="주차장법·조례 확인필요"><FIn v={asm.retailDenom} on={uAsm('retailDenom')} w="100%" /></Fld>
              </div>
            </div>

<div className="panel">
              <p className="ptitle">⑦ 관리동 · 설비 · 계획치 <span className="pdesc">— 관리사무소·MDF실·방재실은 관리동(부대시설)으로 주민공동시설과 분리 집계 · 항목별 지상/지하 위치가 연면적·용적률에 반영</span></p>
              <table className="g ttable" style={{ maxWidth: 640, border: '1px solid #a89e87' }}>
                <colgroup><col style={{ width: '26%' }} /><col style={{ width: '22%' }} /><col style={{ width: '18%' }} /><col style={{ width: '34%' }} /></colgroup>
                <thead><tr><th>구 분</th><th>면적 (㎡)</th><th>위치</th><th>비 고</th></tr></thead>
                <tbody>
                  <tr>
                    <th>관리사무소</th>
                    <td><FIn v={asm.mgmt} on={uAsm('mgmt')} w="100%" ph="자동" /></td>
                    <td><FSel v={asm.mgmtLoc} on={uAsm('mgmtLoc')} w="100%" opts={[{ value: '지하', label: '지하' }, { value: '지상', label: '지상' }]} /></td>
                    <td className="ctr nt">법정 {D.N >= 50 ? `${fmt(D.mgmtLegal, 2)}㎡ (§28①)` : '의무 없음(50세대 미만)'}</td>
                  </tr>
                  <tr>
                    <th>경비실</th>
                    <td><FIn v={asm.guard} on={uAsm('guard')} w="100%" ph="0" /></td>
                    <td><FSel v={asm.guardLoc} on={uAsm('guardLoc')} w="100%" opts={[{ value: '지상', label: '지상' }, { value: '지하', label: '지하' }]} /></td>
                    <td className="ctr nt">§28① 합계 기준에 휴게시설 포함</td>
                  </tr>
                  <tr>
                    <th>MDF실</th>
                    <td><FIn v={asm.mdf} on={uAsm('mdf')} w="100%" ph="0" /></td>
                    <td><FSel v={asm.mdfLoc} on={uAsm('mdfLoc')} w="100%" opts={[{ value: '지하', label: '지하' }, { value: '지상', label: '지상' }]} /></td>
                    <td className="ctr nt">통신설비(방송통신설비 기준 확인필요)</td>
                  </tr>
                  <tr>
                    <th>방재실</th>
                    <td><FIn v={asm.bangjae} on={uAsm('bangjae')} w="100%" ph="0" /></td>
                    <td><FSel v={asm.bangjaeLoc} on={uAsm('bangjaeLoc')} w="100%" opts={[{ value: '지하', label: '지하' }, { value: '지상', label: '지상' }]} /></td>
                    <td className="ctr nt">방재·감시(소방시설법령 확인필요)</td>
                  </tr>
                  <tr>
                    <th>기계·전기실</th>
                    <td><FIn v={asm.mech} on={uAsm('mech')} w="100%" ph="자동" /></td>
                    <td><FSel v={asm.mechLoc} on={uAsm('mechLoc')} w="100%" opts={[{ value: '지하', label: '지하' }, { value: '지상', label: '지상' }]} /></td>
                    <td className="ctr nt">공란 = 세대×4.5㎡ · 지상 설치 시 바닥면적 미산입(§119①3마)</td>
                  </tr>
                  <tr className="sumrow">
                    <th>관리동 소계</th>
                    <td className="num">{fmt(D.adminTotal)}</td>
                    <td colSpan={2} className="ctr nt">관리사무소+MDF+방재실 · 경비실·기전실 별도 집계</td>
                  </tr>
                </tbody>
              </table>
              <div className="fgrid" style={{ marginTop: 10 }}>
                <Fld label="조경 계획 (㎡)" hint={`법정 ${fmt(D.landLegal, 2)} (조례 비율 기준)`}><FIn v={asm.landPlan} on={uAsm('landPlan')} w="100%" ph="자동" /></Fld>
                <Fld label="근린생활시설 — 지상 (㎡)"><FIn v={asm.retail} on={uAsm('retail')} w="100%" /></Fld>
                <Fld label="근린생활시설 — 지하 (㎡)"><FIn v={asm.retailB} on={uAsm('retailB')} w="100%" /></Fld>
                <Fld label="기타 지하면적 (㎡)"><FIn v={asm.extraBase} on={uAsm('extraBase')} w="100%" /></Fld>
              </div>
            </div>

<div className="panel wide">
              <p className="ptitle">⑧ 주민공동시설 — §55의2 <span className="pdesc">— 법정 세부면적: 조례 입력 시 조례 우선(공란 = 총량제 가이드라인 산식) · 계획 공란 = 법정값 자동 적용 · 옥외시설은 부지면적(연면적 미산입)</span></p>
              <table className="g ttable" style={{ maxWidth: 1060, border: '1px solid #a89e87' }}>
                <colgroup><col style={{ width: '12%' }} /><col style={{ width: '11%' }} /><col style={{ width: '14%' }} /><col style={{ width: '24%' }} /><col style={{ width: '14%' }} /><col style={{ width: '10%' }} /><col style={{ width: '15%' }} /></colgroup>
                <thead><tr><th>시 설</th><th>의무 기준</th><th>조례 기준 (㎡)</th><th>법정 적용값 (산식)</th><th>계획 (㎡)</th><th>위치</th><th>비 고</th></tr></thead>
                <tbody>
                  {D.facCalc.map((f) => (
                    <tr key={'p8' + f.key}>
                      <th style={{ fontWeight: 600 }}>{f.name}</th>
                      <td className="ctr nt">{f.th}세대 이상{f.required ? '' : ' · 미해당'}</td>
                      <td><FIn v={(asm.facOrd || {})[f.key] || ''} on={uFacOrd(f.key)} w="100%" ph="조례 우선" /></td>
                      <td className="ctr lim">{f.gtext}</td>
                      <td>{f.required ? <FIn v={(asm.fac || {})[f.key] || ''} on={uFac(f.key)} w="100%" ph={f.g > 0 ? `자동 ${Math.ceil(f.g)}` : '0'} /> : <div className="ctr nt">—</div>}</td>
                      <td className="ctr">{f.loc === '옥외' ? <span className="nt">부지</span> : <FSel v={(asm.facLoc || {})[f.key] || '지상'} on={uFacLoc(f.key)} w="100%" opts={[{ value: '지상', label: '지상' }, { value: '지하', label: '지하' }]} />}</td>
                      <td className="ctr nt">{f.loc}{f.required && f.planAuto && f.g > 0 ? ' · 법정값 자동' : ''}</td>
                    </tr>
                  ))}
                  {D.extraCalc.map((x) => (
                    <tr key={'xf' + x.id}>
                      <th style={{ fontWeight: 600 }}><FIn v={x.name} on={uExtraFac(x.id, 'name')} w="100%" num={false} ph="주민공동시설" /></th>
                      <td className="ctr nt" style={{ whiteSpace: 'nowrap' }}><FIn v={x.th} on={uExtraFac(x.id, 'th')} w={46} ph="조례" /> 세대↑</td>
                      <td><FIn v={x.area} on={uExtraFac(x.id, 'area')} w="100%" ph="조례 면적" /></td>
                      <td className="ctr lim">{x.hasTh ? (x.required ? `조례 ${fmt(x.ordA, 1)} — §55의2④` : '미해당') : '임의(계획) 시설'}</td>
                      <td><FIn v={x.plan} on={uExtraFac(x.id, 'plan')} w="100%" ph={x.required === true && x.ordA > 0 ? `자동 ${Math.ceil(x.ordA)}` : '0'} /></td>
                      <td className="ctr"><FSel v={x.loc} on={uExtraFac(x.id, 'loc')} w="100%" opts={[{ value: '지상', label: '지상' }, { value: '지하', label: '지하' }, { value: '옥외', label: '옥외(부지)' }]} /></td>
                      <td className="ctr nt" style={{ whiteSpace: 'nowrap' }}>
                        {x.required === true && x.planAuto && x.ordA > 0 ? '법정값 자동 ' : ''}
                        <button className="icb add" onClick={() => insertExtraFacAfter(x.id)} title="조례 추가 시설 행 삽입 (§55의2④)">＋</button>
                        <button className="icb del" onClick={() => delExtraFac(x.id)} title="조례 추가 시설 행 삭제 (Ctrl+Z로 되돌리기)">−</button>
                      </td>
                    </tr>
                  ))}
                  {D.extraCalc.length === 0 && (
                    <tr><td colSpan={7} className="ctr"><button className="btn" onClick={() => insertExtraFacAfter(null)}>＋ 조례 추가 주민공동시설 행 추가 (§55의2④)</button></td></tr>
                  )}
                  <tr className="sumrow">
                    <th>총량 (§55의2①)</th>
                    <td className="ctr nt">100세대 이상</td>
                    <td><FIn v={asm.commLegalOrd} on={uAsm('commLegalOrd')} w="100%" ph="조례 우선" /></td>
                    <td className="ctr lim">{D.N >= 100 || D.commOrd ? `${D.commOrd ? '조례' : '규정'} ${fmt(D.commLegal, 1)}㎡ 이상` : '100세대 미만 — 의무 없음'}</td>
                    <td className="num"><b>{fmt(D.commPlanTotal, 1)}</b></td>
                    <td colSpan={2} className="ctr nt">옥내 {fmt(D.commIndoor, 1)} · 옥외 {fmt(D.commOutdoor, 1)} <Badge ok={D.jComm} no="부족" /></td>
                  </tr>
                </tbody>
              </table>
              <div className="nt" style={{ marginTop: 4 }}>※ 산식 출처: 국토교통부 「주민공동시설 설치 총량제 운용 가이드라인」(2014.7.17., §55의2⑤ 근거) — 세부면적 기준은 조례(§55의2⑥) 우선 · 총량 산정 = 옥내 전용면적 + 옥외 부지면적(§55의2②) · 의무시설은 승인권자 인정·다함께돌봄 과반 반대 시 미설치 가능(§55의2③ 단서, 확인필요) · ③항 외 필수 설치 시설의 종류는 시·군 조례로 따로 정할 수 있음(§55의2④) — '주민공동시설' 행에 시설명·적용 세대·조례 면적 입력(해당 조례 확인필요)</div>
            </div>
          </div>
        </div>

        {/* ════════ ② 검산 탭 ════════ */}
        <div className={'tabsec sec-chk' + (tab === 'check' ? '' : ' hide')}>
          <div className="chips">
          <Chip label="건폐율" val={`${fmt(D.bcr, 2)}% / ${D.bcrLimit > 0 ? D.bcrLimit + '%' : '−'}`} ok={D.jBcr} />
          <Chip label="용적률" val={`${fmt(D.far, 2)}% · ${D.farLevel}`} ok={D.jFar} />
          <Chip label="주차" val={`계획 ${D.parkPlanned}대 / 법정 ${D.parkLegal}대`} ok={D.jPark} />
          <Chip label="조경" val={`${fmt(D.landPlan, 1)} / ${fmt(D.landLegal, 2)}㎡`} ok={D.jLand} />
          {D.N >= 100 && <Chip label="주민공동시설" val={`${fmt(D.commPlanTotal, 1)} / ${fmt(D.commLegal, 1)}㎡`} ok={D.jComm} />}
          <Chip label="유형 판정" val={D.judgedType ? `${D.judgedType}${D.typeMatch === false ? ' ≠ ' + bld.useType : ''}` : '동 구성 입력 필요'} ok={D.typeMatch} />
          <Chip label="진입도로" val={`폭 ${D.roadReq}m 이상`} ok={null} />
          <Chip label="전용률" val={`공급 ${fmt(D.effSupply, 1)}% · 계약 ${fmt(D.effContract, 1)}%`} ok={null} />
          <Chip label="전체연면적" val={`${fmt(D.gfaTotal, 2)}㎡ (${fmt(D.gfaTotal / PY, 1)}평)`} ok={null} />
        </div>

          <div className="ttl" style={{ marginTop: 16 }}><span>■ 법 정 기 준 검 증 일 람</span><span className="unit">조례 입력 시 조례 우선 · 공란 = 상위법 · 파란 글씨 = 법정</span></div>
          <table className="g" style={{ maxWidth: 1060 }}>
            <colgroup><col style={{ width: '14%' }} /><col style={{ width: '42%' }} /><col style={{ width: '22%' }} /><col style={{ width: '22%' }} /></colgroup>
            <tbody>
              <tr><th>항 목</th><th>법정 기준</th><th>계 획</th><th>판 정</th></tr>
              <tr><th>건폐율</th><td className="ctr lim">{D.bcrLimit > 0 ? `${D.bcrLimit}% 이하 (조례·지구단위계획 우선)` : '한도 미입력'}</td><td className="num">{fmt(D.bcr, 2)}%</td><td className="ctr"><Badge ok={D.jBcr} no="초과" /></td></tr>
              <tr><th>용적률</th><td className="ctr lim">{D.farLevel}</td><td className="num">{fmt(D.far, 2)}%</td><td className="ctr"><Badge ok={D.jFar} no="초과" /></td></tr>
              <tr><th>주차대수</th><td className="ctr lim">{D.pkBandOnly ? `조례 비율식 ${fmt(D.parkBandBased, 2)}대 단독(면적·세대 미반영)` : `§27①1 면적 ${fmt(D.parkAreaBased, 2)}대 / 세대 ${fmt(D.parkUnitMin, 1)}대${D.pkMode === 'band' ? ' / 조례 비율식 ' + fmt(D.parkBandBased, 2) + '대' : ''}`} → {D.parkLegal}대{D.ordU || D.ordO || D.pkMode === 'band' ? ' (조례 반영)' : ''}</td><td className="num">{D.parkPlanned}대</td><td className="ctr"><Badge ok={D.jPark} no="부족" /></td></tr>
              <tr><th>장애인전용</th><td className="ctr lim">설치대수의 {fmt(D.disabledPct, 0)}% → {D.dLegal}대 (조례 확인필요)</td><td className="num">{D.dPlan}대</td><td className="ctr"><Badge ok={D.dLegal === 0 ? null : D.dPlan >= D.dLegal} no="부족" /></td></tr>
              <tr><th>조경면적</th><td className="ctr lim">대지 × {fmt(D.landRatio, 0)}% = {fmt(D.landLegal, 2)}㎡ (조례 비율)</td><td className="num">{fmt(D.landPlan, 1)}</td><td className="ctr"><Badge ok={D.jLand} no="부족" /></td></tr>
              <tr><th>관리사무소 등</th><td className="ctr lim">{D.N >= 50 ? `§28① ${fmt(D.mgmtLegal, 2)}㎡ 이상 (경비원 등 휴게시설 합계)` : '50세대 미만 — 의무 없음'}</td><td className="num">{fmt(D.mgmtPlan, 1)}</td><td className="ctr"><Badge ok={D.jMgmt} no="부족" /></td></tr>
              <tr><th>주민공동 총량</th><td className="ctr lim">{D.N >= 100 || D.commOrd ? `${fmt(D.commLegal, 1)}㎡ 이상 ${D.commOrd ? '(조례)' : '(§55의2①)'}` : '100세대 미만 — 의무 없음'}</td><td className="num">{fmt(D.commPlanTotal, 1)}</td><td className="ctr"><Badge ok={D.jComm} no="부족" /></td></tr>
              <tr><th>의무 시설</th><td className="ctr lim" colSpan={2}>{(() => { const req = [...D.facCalc.filter((f) => f.required).map((f) => ({ name: f.name, plan: f.plan })), ...D.extraCalc.filter((x) => x.required === true).map((x) => ({ name: (x.name || '조례시설') + '(조례 §55의2④)', plan: x.plan }))]; return req.length ? req.map((f) => `${f.name} ${f.plan > 0 ? '○' : '×'}`).join(' · ') : '해당 없음 (150세대 미만)'; })()}</td><td className="ctr"><Badge ok={(() => { const req = [...D.facCalc.filter((f) => f.required), ...D.extraCalc.filter((x) => x.required === true)]; return req.length ? req.every((f) => f.plan > 0) : null; })()} no="누락" /></td></tr>
              <tr><th>진입도로</th><td className="ctr lim">폭 {D.roadReq}m 이상 (§25①의 표 — 원문 확인필요)</td><td className="ctr">{proj.road || '—'}</td><td className="ctr"><span className="nt">수동 확인</span></td></tr>
              <tr><th>세대수 대조</th><td className="ctr lim">동구성 산출 {D.unitsCheck.reduce((s, c) => s + c.derived, 0)}세대 = 타입표 입력</td><td className="num">{D.N}세대</td><td className="ctr"><Badge ok={D.unitsMatch} yes="일치" no="불일치" /></td></tr>
              <tr><th>주택유형</th><td className="ctr lim">판정 {D.judgedType || '— (동 구성 입력 필요)'}</td><td className="ctr">{bld.useType} 선택</td><td className="ctr"><Badge ok={D.typeMatch} yes="일치" no="불일치" /></td></tr>
              <tr><th>인허가 구분</th><td className="ctr lim">{D.N >= 30 ? '공동주택 30세대 이상 — 사업계획승인 대상 (주택법 §15①·영 §27①2)' : D.N > 0 ? '30세대 미만 — 건축허가 대상 (주택법 영 §27①2)' : '세대수 입력 필요'}</td><td className="ctr">{D.N > 0 ? (D.N >= 30 ? '사업계획승인' : '건축허가') : '—'}</td><td className="ctr"><span className="nt">{D.N >= 30 ? '단지형 연립·다세대 50세대(영 §27①2가)·준주거/상업 주상복합(영 §27④1) 예외 확인필요' : '확인필요'}</span></td></tr>
              <tr><th>승강기</th><td className="ctr lim">{D.up >= 6 ? `6층 이상 — 6인승 이상 승용승강기 설치 (주택건설기준 §15①)${D.up >= 10 ? ' · 10층 이상: 비상용 구조 + 화물용 승강기 (§15②③)' : ''}` : D.up > 0 ? '6층 미만 — 승용승강기 의무 없음 (§15①)' : '층수 입력 필요'}</td><td className="ctr">{D.up > 0 ? D.up + '층' : '—'}</td><td className="ctr"><span className="nt">{D.up >= 6 ? '대수 산정 — 규칙 기준 확인필요' : '—'}</span></td></tr>
              <tr><th>교통영향평가</th><td className="ctr lim">도시교통정비지역 내 공동주택 — 「도시교통정비 촉진법」 영 [별표1] 대상(통용 100세대 이상·50~99 간이검토, 비도시 200세대) — 별표 원문·지자체 기준 확인필요</td><td className="ctr">{D.N}세대</td><td className="ctr"><span className="nt">수동 확인</span></td></tr>
              <tr><th>친환경주택</th><td className="ctr lim">{D.N >= 30 ? '사업계획승인 대상 — 에너지절약형 친환경주택 건설 + 에너지절약계획 제출 (주택건설기준 §64①②)' : '사업계획승인 대상 아님 — 미해당'}</td><td className="ctr">{D.N >= 30 ? '대상' : '—'}</td><td className="ctr"><span className="nt">{D.N >= 30 ? '세부기준 고시 확인필요' : '—'}</span></td></tr>
            </tbody>
          </table>
          <div className="nt" style={{ marginTop: 4 }}>※ 항목별 세부 근거·산식은 ③ 설계개요 탭의 표와 하단 주석 참조 · 처분시법주의 — 허가신청 시점의 시행 법령·조례 확인필요</div>
          <div className="ttl" style={{ marginTop: 16 }}><span>■ 주 차 산 정 검 산</span><span className="unit">단위:대 · §27①1 — 소수점 이하 끝수 1대 올림</span></div>
          {/* 주차대수 */}
              <table className="g" style={{ marginTop: -1.5 }}>
                <colgroup>
                  <col style={{ width: '5%' }} /><col style={{ width: '17%' }} /><col style={{ width: '34%' }} /><col style={{ width: '22%' }} /><col style={{ width: '22%' }} />
                </colgroup>
                <tbody>
                  <tr>
                    <th rowSpan={D.pkMode === 'band' ? 8 : 7} style={{ padding: '2px 4px' }}><VTxt t="주차대수" /></th>
                    <th>용 도</th><th>설치기준 (§27①1)</th><th>법정주차대수</th><th>계획주차대수</th>
                  </tr>
                  <tr>
                    <th rowSpan={D.pkMode === 'band' ? 4 : 3} style={{ background: '#f2edde' }}>공동주택</th>
                    <td className="ctr">85㎡ 이하 · 전용합 1/{D.u85eff}㎡{D.ordU && <span className="nt"> (조례)</span>}</td>
                    <td className="num">{fmt(D.parkU85, 2)} 대</td>
                    <td className="ctr nt">−</td>
                  </tr>
                  <tr>
                    <td className="ctr">85㎡ 초과 · 전용합 1/{D.o85eff}㎡{D.ordO && <span className="nt"> (조례)</span>}</td>
                    <td className="num">{fmt(D.parkO85, 2)} 대</td>
                    <td className="ctr nt">−</td>
                  </tr>
                  {D.pkMode === 'band' && (
                    <tr>
                      <td className="ctr">조례 세대당 비율 — 전용면적 구간식 <span className="nt">(자치법규 별표 확인필요)</span></td>
                      <td className="num">{fmt(D.parkBandBased, 2)} 대</td>
                      <td className="ctr nt">−</td>
                    </tr>
                  )}
                  <tr>
                    <td className="ctr">{D.pkBandOnly ? '세대당 최저·면적기준 — 미반영 (비율식 단독)' : '세대당 최저 1대 (60㎡↓ 0.7대) · 소계'}</td>
                    <td className="num"><b>{D.parkLegalHousing} 대</b></td>
                    <td className="ctr nt">−</td>
                  </tr>
                  <tr>
                    <th colSpan={1} style={{ background: '#f2edde' }}>근린생활시설</th>
                    <td className="ctr">1대 / {fmt(D.retailDenom, 0)}㎡ <span className="nt">(조례 확인필요)</span></td>
                    <td className="num">{D.parkLegalRetail} 대</td>
                    <td className="ctr nt">−</td>
                  </tr>
                  <tr>
                    <th style={{ background: '#f2edde' }}>장애인전용</th>
                    <td className="ctr">설치대수의 {fmt(D.disabledPct, 0)}% 이상 <span className="nt">(조례 확인필요)</span></td>
                    <td className="num">{D.dLegal} 대</td>
                    <td className="num">{D.dPlan} 대</td>
                  </tr>
                  <tr className="sumrow">
                    <th>합 계</th>
                    <td className="ctr nt">{D.pkBandOnly ? `조례 비율식 ${fmt(D.parkBandBased, 2)}대 단독(면적 ${fmt(D.parkAreaBased, 2)}·세대 ${fmt(D.parkUnitMin, 1)} 미반영) → 비율식 올림` : `면적기준 ${fmt(D.parkAreaBased, 2)}대 / 세대기준 ${fmt(D.parkUnitMin, 1)}대${D.pkMode === 'band' ? ' / 조례 비율식 ' + fmt(D.parkBandBased, 2) + '대' : ''} → ${D.parkGovern === 'area' ? '면적기준' : D.parkGovern === 'band' ? '조례 비율식' : '세대기준'} 올림`}</td>
                    <td className="num"><b>{D.parkLegal} 대</b></td>
                    <td className="num"><b>{D.parkPlanned} 대</b> <span className="nt">({fmt(D.plannedPerUnit, 2)}대/세대)</span><Badge ok={D.jPark} no="부족" /></td>
                  </tr>
                </tbody>
              </table>
              <div className="nt" style={{ marginTop: 4 }}>
                ※ §27①: 소수점 이하 끝수는 1대로 봄(올림) · 조례로 1/5(60㎡ 이하 1/2) 범위 강화 가능 · 도시형 생활주택은 §27①2 별도 기준(본 도구 미반영)
                {D.parkBaseStalls > 0 ? ` · 지하 ${D.parkBaseStalls}대 × ${fmt(D.stallArea, 0)}㎡ = ${fmt(D.parkBaseArea, 1)}㎡` : ''}
              </div>
        </div>

        {/* ════════ ③ 설계개요 탭 (한 장 출력) ════════ */}
        <div className={'tabsec sec-sheet' + (tab === 'sheet' ? '' : ' hide')}>
          <div className="sheetwrap">
          <div className="sheet sheet1" style={{ overflowX: 'auto' }}>
            <div className="stitle">
              <h2>■ 설 계 개 요 (사업성검토)</h2>
              <span className="meta">{locText || '대지위치 미입력'} · {D.N}세대 · 단위:㎡ · {APP_META.version} · 개발자 : {APP_META.author}</span>
            </div>
            <div className="sheetgrid">
            <div className="sgL">
            <div className="ttl"><span>■ 설 계 개 요</span><span className="unit">단위:㎡</span></div>
              <table className="g">
                <colgroup>
                  <col style={{ width: '15%' }} /><col style={{ width: '20%' }} /><col style={{ width: '25%' }} /><col style={{ width: '18%' }} /><col style={{ width: '22%' }} />
                </colgroup>
                <tbody>
                  <tr><th>사 업 명</th><td colSpan={4} className="ctr">{proj.name || '−'}</td></tr>
                  <tr><th>대지위치</th><td colSpan={4} className="ctr">{locText || '−'}</td></tr>
                  <tr>
                    <th>실사용 대지면적</th><td className="num" colSpan={2}><b>{fmt(D.siteArea)}</b></td>
                    <th>기부채납 면적</th><td className="num">{fmt(toNum(site.donate, 0))}</td>
                  </tr>
                  <tr><th>지역지구</th><td colSpan={4} className="ctr">{[zone.district, zoneName].filter(Boolean).join(', ')}</td></tr>
                  <tr><th>용 도</th><td colSpan={4} className="ctr">{useText}</td></tr>
                  <tr><th>도 로</th><td colSpan={4} className="ctr">{proj.road || '−'}</td></tr>
                  <tr><th>구조/규모</th><td colSpan={4} className="ctr">철근콘크리트 / 지하{D.down}층, 지상{D.up}층 (층고 {fmt(D.fh, 1)}M · 약 {fmt(D.up * D.fh, 1)}m)</td></tr>
                  <tr>
                    <th>건축면적</th><td className="num" colSpan={2}><b>{fmt(D.bArea)}</b></td>
                    <td colSpan={2} className="ctr nt">{bld.areaMode === 'manual' ? '직접 입력값' : `${D.bAreaMethod} 추정`}</td>
                  </tr>
                  <tr>
                    <th>건 폐 율</th><td className="num">{fmt(D.bcr, 2)} %<Badge ok={D.jBcr} no="초과" /></td>
                    <th>법 정</th><td colSpan={2} className="ctr lim">{D.bcrLimit > 0 ? `${D.bcrLimit}% 이하` : '확인필요'}</td>
                  </tr>
                  <tr><th rowSpan={3}>연<br />면<br />적</th><th>지상연면적</th><td colSpan={3} className="num">{fmt(D.gfaAbove)}</td></tr>
                  <tr><th>지하연면적</th><td colSpan={3} className="num">{fmt(D.gfaBelow)}</td></tr>
                  <tr><th>전체연면적</th><td colSpan={3} className="num"><b>{fmt(D.gfaTotal)}</b></td></tr>
                  <tr>
                    <th rowSpan={2}>용 적 률</th>
                    <td className="num">{fmt(D.far, 2)} %<Badge ok={D.jFar} no="초과" /></td>
                    <th>용적률산정연면적</th><td colSpan={2} className="num">{fmt(D.farGFA)}</td>
                  </tr>
                  <tr><td colSpan={4} className="ctr lim" style={{ fontSize: 11 }}>
                    {D.farBase > 0 ? `기준 ${D.farBase}%` : ''}{D.farAllow > 0 ? ` · 허용 ${D.farAllow}%` : ''}{D.farMax > 0 ? ` · 상한 ${D.farMax}% 이하` : ''} — {D.farLevel}
                  </td></tr>
                  <tr><th>세 대 수</th><td colSpan={4} className="ctr"><b>{D.N} 세대</b>　<span className="nt">타입 {D.T.length}개 · 주동 {D.bldgDisp > 0 ? `${D.bldgDisp}개동` : '−'}</span>{D.unitsMatch === false && <span className="badge ng">동구성 세대수 불일치</span>}</td></tr>
                  {/* 주차대수 통합 (참고 설계개요 양식) */}
                  <tr>
                    <th rowSpan={D.pkMode === 'band' && !D.pkBandOnly ? (retail$ > 0 ? 7 : 6) : (retail$ > 0 ? 6 : 5)} style={{ writingMode: 'vertical-rl', letterSpacing: '.15em', padding: '2px 4px' }}>주차대수</th>
                    <th>용 도</th><th>설치기준</th><th>법정주차</th><th>계획주차</th>
                  </tr>
                  <tr>
                    <th rowSpan={D.pkMode === 'band' && !D.pkBandOnly ? 4 : 3} style={{ background: '#efe9d8' }}>공동주택</th>
                    <td className="ctr nt">85㎡↓ 1/{D.u85eff}㎡{D.ordU ? ' (조례)' : ''}</td>
                    <td className="num">{fmt(D.parkU85, 2)} 대</td>
                    <td className="ctr nt" rowSpan={D.pkMode === 'band' && !D.pkBandOnly ? 4 : 3}>−</td>
                  </tr>
                  <tr>
                    <td className="ctr nt">85㎡↑ 1/{D.o85eff}㎡{D.ordO ? ' (조례)' : ''}</td>
                    <td className="num">{fmt(D.parkO85, 2)} 대</td>
                  </tr>
                  {D.pkMode === 'band' && !D.pkBandOnly && (
                    <tr>
                      <td className="ctr nt">조례 세대당 비율식</td>
                      <td className="num">{fmt(D.parkBandBased, 2)} 대</td>
                    </tr>
                  )}
                  <tr>
                    <td className="ctr nt">{D.pkBandOnly ? '비율식 단독(면적 미반영)' : '세대당 최저 1대 · 소계'}</td>
                    <td className="num"><b>{D.parkLegalHousing} 대</b></td>
                  </tr>
                  {retail$ > 0 && (
                    <tr>
                      <th style={{ background: '#efe9d8' }}>근생</th>
                      <td className="ctr nt">1대/{fmt(D.retailDenom, 0)}㎡</td>
                      <td className="num">{D.parkLegalRetail} 대</td>
                      <td className="ctr nt">−</td>
                    </tr>
                  )}
                  <tr className="sumrow">
                    <th colSpan={2}>합 계</th>
                    <td className="num"><b>{D.parkLegal} 대</b></td>
                    <td className="num"><b>{D.parkPlanned} 대</b><Badge ok={D.jPark} no="부족" /></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="sgR">
            {/* ───── 부대복리시설 개요 (참고 설계개요 양식) ───── */}
          <div className="ttl"><span>■ 부 대 복 리 시 설 개 요</span><span className="unit">단위:㎡ · 파란 글씨 = 법정 (참고)</span></div>
          <table className="g factb" style={{ maxWidth: 920 }}>
            <colgroup><col style={{ width: '8%' }} /><col style={{ width: '20%' }} /><col style={{ width: '34%' }} /><col style={{ width: '16%' }} /><col style={{ width: '22%' }} /></colgroup>
            <tbody>
              <tr><th colSpan={2}>구 분</th><th>법 정</th><th>계 획</th><th>비 고</th></tr>
              {/* 관리사무소 */}
              <tr>
                <th colSpan={2}>관리사무소</th>
                <td className="ctr lim">{D.N >= 50 ? `10+(${D.N}세대-50)×0.05=${fmt(D.mgmtLegal, 1)}` : '의무 없음(50세대 미만)'}</td>
                <td className="num">{fmt(D.mgmtPlan)}</td>
                <td className="ctr nt">규정 §28①</td>
              </tr>
              {/* 주민공동시설 6종 — 법정란 총량 병합 */}
              {(() => {
                const rows = [...D.facCalc.map((f) => ({ name: f.name, plan: f.plan, key: 'f' + f.key })), ...D.extraCalc.map((x) => ({ name: x.name || '주민공동시설', plan: x.plan, key: 'x' + x.id }))];
                const span = rows.length;
                return rows.map((r, i) => (
                  <tr key={r.key}>
                    {i === 0 && <th rowSpan={span + 1} style={{ padding: '2px 3px' }}><VTxt t="주민공동시설" /></th>}
                    <th style={{ fontWeight: 600 }}>{r.name}</th>
                    {i === 0 && <td rowSpan={span} className="ctr lim">{D.N >= 100 || D.commOrd ? `${D.N}세대 × ${D.commOrd ? '조례' : (D.N < 1000 ? '2.5㎡' : '(500+2×세대)')} = ${fmt(D.commLegal, 1)}` : '100세대 미만 — 의무 없음'}</td>}
                    <td className="num">{fmt(r.plan)}</td>
                    <td className="ctr nt">규정 §55의2</td>
                  </tr>
                ));
              })()}
              <tr className="sumrow">
                <th>합 계</th>
                <td className="num"><b>{fmt(D.commPlanTotal)}</b></td>
                <td colSpan={2} className="ctr nt">옥내 {fmt(D.commIndoor, 1)} · 옥외 {fmt(D.commOutdoor, 1)} <Badge ok={D.jComm} no="부족" /></td>
              </tr>
              {/* 기타 부대시설 */}
              <tr>
                <th colSpan={2}>진입도로</th>
                <td className="ctr nt">−</td>
                <td className="ctr nt">{proj.road || '−'}</td>
                <td className="ctr nt">규정 §25</td>
              </tr>
              <tr>
                <th colSpan={2}>조경면적</th>
                <td className="ctr lim">{D.siteArea > 0 ? `대지면적의 ${zone.landRatio || 15}% = ${fmt(D.landLegal, 1)}` : '확인필요'}</td>
                <td className="num">{fmt(D.landPlan)}</td>
                <td className="ctr nt">{D.siteArea > 0 && D.landPlan > 0 ? `${fmt((D.landPlan / D.siteArea) * 100, 2)}%` : ''}<Badge ok={D.jLand} no="부족" /></td>
              </tr>
              <tr>
                <th colSpan={2}>경비실</th>
                <td className="ctr nt">−</td>
                <td className="num">{fmt(D.guard)}</td>
                <td className="ctr nt">§28① 합산</td>
              </tr>
              {retail$ > 0 && (
                <tr>
                  <th colSpan={2}>근린생활시설</th>
                  <td className="ctr nt">−</td>
                  <td className="num">{fmt(retail$)}</td>
                  <td className="ctr nt">지상 {fmt(D.retail)} · 지하 {fmt(D.retailB)}</td>
                </tr>
              )}
            </tbody>
          </table>

            {/* ───── 용도별 설계개요 (지상/지하/합계) ───── */}
          <div className="ttl" style={{ marginTop: 10 }}><span>■ 용 도 별 설 계 개 요</span><span className="unit">단위:㎡</span></div>
          <table className="g factb" style={{ maxWidth: 920 }}>
            <colgroup><col style={{ width: '28%' }} /><col style={{ width: '20%' }} /><col style={{ width: '20%' }} /><col style={{ width: '20%' }} /><col style={{ width: '12%' }} /></colgroup>
            <tbody>
              <tr><th>구 분</th><th>지상층 면적</th><th>지하층 면적</th><th>합 계</th><th>비 고</th></tr>
              <tr>
                <th>공동주택</th>
                <td className="num">{fmt(D.totalSUP)}</td>
                <td className="num">−</td>
                <td className="num">{fmt(D.totalSUP)}</td>
                <td className="ctr nt">공급면적</td>
              </tr>
              <tr>
                <th>부대복리시설</th>
                <td className="num">{fmt(D.gita2Up)}</td>
                <td className="num">{fmt(D.gita2Dn - (D.mech - D.mechUp))}</td>
                <td className="num">{fmt(D.gita2Up + D.gita2Dn - (D.mech - D.mechUp))}</td>
                <td className="ctr nt">관리동·주민공동</td>
              </tr>
              <tr>
                <th>기계실 및 전기실</th>
                <td className="num">{fmt(D.mechUp)}</td>
                <td className="num">{fmt(D.mech - D.mechUp)}</td>
                <td className="num">{fmt(D.mech)}</td>
                <td className="ctr nt">§119①3마</td>
              </tr>
              <tr>
                <th>지하주차장</th>
                <td className="num">−</td>
                <td className="num">{fmt(D.parkBaseArea)}</td>
                <td className="num">{fmt(D.parkBaseArea)}</td>
                <td className="ctr nt">{D.parkBaseStalls}대 × {fmt(D.stallArea, 0)}㎡</td>
              </tr>
              {retail$ > 0 && (
                <tr>
                  <th>근린생활시설</th>
                  <td className="num">{fmt(D.retail)}</td>
                  <td className="num">{fmt(D.retailB)}</td>
                  <td className="num">{fmt(retail$)}</td>
                  <td className="ctr nt">−</td>
                </tr>
              )}
              <tr className="sumrow">
                <th>합 계</th>
                <td className="num"><b>{fmt(D.gfaAbove)}</b></td>
                <td className="num"><b>{fmt(D.gfaBelow)}</b></td>
                <td className="num"><b>{fmt(D.gfaTotal)}</b></td>
                <td className="ctr nt">전체연면적</td>
              </tr>
            </tbody>
          </table>
            </div>
            </div>

            {/* ───── 하단: 세대별 면적표 ───── */}
          <div className="ttl"><span>■ 세 대 별 면 적 표</span><span className="unit">본문 행: 세대당 면적 / 합계 행: 전체 면적 · 단위:㎡</span></div>
          <table className="g" style={{ minWidth: 1080 }}>
            <colgroup>
              <col style={{ width: '3.2%' }} /><col style={{ width: '9%' }} /><col style={{ width: '5.2%' }} /><col style={{ width: '5.4%' }} />
              <col style={{ width: '7.8%' }} />
              <col style={{ width: '7%' }} /><col style={{ width: '7%' }} /><col style={{ width: '7.4%' }} />
              <col style={{ width: '8.4%' }} />
              <col style={{ width: '7%' }} /><col style={{ width: '7.4%' }} /><col style={{ width: '7.4%' }} />
              <col style={{ width: '9%' }} /><col style={{ width: '5.8%' }} />
            </colgroup>
            <thead>
              <tr>
                <th colSpan={2} rowSpan={2}>구 분</th>
                <th rowSpan={2}>세대수</th><th rowSpan={2}>비율(%)</th><th rowSpan={2}>전용면적</th>
                <th colSpan={3}>주 거 공 용 면 적</th>
                <th rowSpan={2}>공급면적</th>
                <th colSpan={3}>기 타 공 용 면 적</th>
                <th rowSpan={2}>계약면적</th>
                <th rowSpan={2}>평형</th>
              </tr>
              <tr><th>벽체공용</th><th>계단·복도</th><th>계</th><th>부대시설</th><th>지하주차장</th><th>계</th></tr>
            </thead>
            <tbody>
              {D.rows.length === 0 && (
                <tr><td colSpan={14} className="ctr nt" style={{ padding: 14 }}>⑤ 세대 타입에 전용면적·세대수를 입력하면 자동 산정됩니다.</td></tr>
              )}
              {D.rows.map((r, i) => (
                <tr key={r.id}>
                  {i === 0 && <th rowSpan={D.rows.length}><VTxt t="분양" /></th>}
                  <td className="ctr">{r.name || '−'}</td>
                  <td className="num">{r.u}</td>
                  <td className="num">{fmt(r.ratio, 2)}</td>
                  <td className="num">{fmt(r.a)}</td>
                  <td className="num">{fmt(r.wall)}</td>
                  <td className="num">{fmt(r.stair)}</td>
                  <td className="num">{fmt(r.cm)}</td>
                  <td className="num"><b>{fmt(r.sup)}</b></td>
                  <td className="num">{fmt(r.budaeU)}</td>
                  <td className="num">{fmt(r.parkU)}</td>
                  <td className="num">{fmt(r.gitaU)}</td>
                  <td className="num"><b>{fmt(r.contract)}</b></td>
                  <td className="ctr">{Math.floor(r.sup * 0.3025)}평형</td>
                </tr>
              ))}
              {D.rows.length > 0 && (
                <>
                  <tr className="sumrow">
                    <th colSpan={2}>합 계</th>
                    <td className="num">{D.N}</td>
                    <td className="num">100.00</td>
                    <td className="num">{fmt(D.totalJ)}</td>
                    <td className="num">{fmt(D.sumWall)}</td>
                    <td className="num">{fmt(D.sumStair)}</td>
                    <td className="num">{fmt(D.totalCM)}</td>
                    <td className="num">{fmt(D.totalSUP)}</td>
                    <td className="num">{fmt(D.budae)}</td>
                    <td className="num">{fmt(D.parkBaseArea)}</td>
                    <td className="num">{fmt(D.gitaTotal)}</td>
                    <td className="num">{fmt(D.sumContract)}</td>
                    <td className="ctr nt">평균 {fmt((D.totalSUP / D.N) * 0.3025, 1)}평</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="ctr nt">(평 환산 · ×0.3025)</td>
                    <td className="num nt">({fmt(D.totalJ * 0.3025, 2)})</td>
                    <td className="num nt" />
                    <td className="num nt" />
                    <td className="num nt">({fmt(D.totalCM * 0.3025, 2)})</td>
                    <td className="num nt">({fmt(D.totalSUP * 0.3025, 2)})</td>
                    <td className="num nt" />
                    <td className="num nt" />
                    <td className="num nt">({fmt(D.gitaTotal * 0.3025, 2)})</td>
                    <td className="num nt">({fmt(D.sumContract * 0.3025, 2)})</td>
                    <td />
                  </tr>
                </>
              )}
            </tbody>
          </table>
          <div className="nt" style={{ marginTop: 4 }}>
            ※ 공급면적 = 전용 + 주거공용(벽체공용+계단·복도) · 계약면적 = 공급 + 기타공용 · 벽체공용은 입력값(공란 시 전용×비율) · 계단·복도 = {D.useCore ? `④ 동구성 총코어면적 ${fmt(D.totalCoreArea, 1)}㎡을 전용면적 비율로 안분` : <span style={{ color: '#9a4036', fontWeight: 700 }}>추정비율 {fmt(D.stairRate * 100, 4)}% × 전용면적 (⑥ 입력값 · 코어면적 미입력 — 확인필요)</span>} · 기타공용(부대시설+지하주차장)은 전용면적 비율로 안분 · 평형 = 공급면적×0.3025 절사
          </div>

            <div className="legend">
            <span><span className="sw" style={{ background: '#fff8d8' }} /> 입력/가정치 (수정 가능)</span>
            <span><span className="sw" style={{ background: '#fff' }} /> 자동 계산</span>
            <span><span className="sw" style={{ background: '#ebe5d3' }} /> 항목</span>
            <span style={{ color: '#1d4ed8', fontWeight: 700 }}>파란 글씨 = 법정 기준</span>
          </div>

          </div>

          <div className="refbar noprint">
            <button className="refbtn" onClick={() => setRefOpen((v) => !v)} aria-expanded={refOpen} title="법령 출처·산정 전제·한계 등 참고 주석 펼치기/접기">
              <span>적용 기준 및 한계 (확인필요 항목) — 참고</span>
              <span className={'refarrow' + (refOpen ? ' open' : '')}>▾</span>
            </button>
            {refOpen && (
              <div className="refpanel">
            <div className="foot">
            <b>적용 기준 및 한계 (확인필요 항목)</b><br />
            · 법정값 출처: 「주택건설기준 등에 관한 규정」(대통령령, 시행 2026.5.6.) 제25조(진입도로)·제27조(주차장)·제28조(관리사무소 등)·제55조의2(주민공동시설) — 법제처 국가법령정보 원문 조회. 진입도로 폭 구간표(6/8/12/15/20m)는 제25조제1항의 표 기준이며 표 원문은 별도 확인 권장.<br />
            · 건폐율·용적률 한도는 「국토의 계획 및 이용에 관한 법률 시행령」 제84조·제85조의 범위(영 기준)를 기본값으로 제시 — 실제 한도는 해당 지자체 도시계획조례·지구단위계획이 우선하므로 반드시 확인 후 입력. 조경비율은 건축법 제42조 + 지자체 건축조례 사항.<br />
            · 용적률산정연면적은 지상연면적으로 단순화(지상 부속용도 주차·완화특례 미반영, 건축법 시행령 제119조). 관리동(관리사무소·MDF실·방재실)·경비실·주민공동시설(옥내)은 ⑦·⑧의 항목별 지상/지하 선택에 따라 지상·지하 연면적과 용적률에 반영되며, 지하 배치분은 용적률 미산입. 기계·전기실은 공동주택의 경우 지상 설치분도 바닥면적 미산입(§119①3호마목)으로 연면적·용적률에서 제외(분양 기타공용 안분에는 포함). 옥외 시설(어린이놀이터·주민운동시설)은 부지면적 산정(§55의2②)으로 연면적 미산입. 기타공용 안분 대상 = 관리동+경비실+기계전기실+주민공동시설(옥내)+기타 지하시설+지하주차장(참조 검토서 관행 — 주민공동시설을 안분에서 제외하는 사업장은 조정 필요).<br />
            · <b>조례 우선 원칙</b>: 건폐율·용적률·조경비율·주차 설치기준(85㎡ 이하/초과)·주민공동시설 총량·근생 부설주차·장애인주차 비율은 조례값 입력 시 조례를 적용하고, 공란이면 상위법(법률·영·규정) 기준을 적용. 처분시법주의에 따라 허가신청 시점의 시행 법령·조례 확인필요.<br />
            · 계단·복도 면적은 ④ 동구성(세대 조합+코어)의 총 코어면적을 전용면적 비율로 안분(기준안 원문 방식과 동일) — 동구성 미입력 시 추정비율 적용. 건축면적 자동값은 Σ(동 기준층면적)×계수.<br />
            · 주민공동시설 시설별 산정값은 국토교통부 「주민공동시설 설치 총량제 운용 가이드라인」(2014.7.17., §55의2⑤ 근거) 기준 권장치이며, 세부면적 기준은 조례(§55의2⑥)가 우선 — 확인필요. 장애인전용 주차비율(기본 3%)은 장애인등편의 관련 법령·지자체 조례 사항 — 확인필요.<br />
            · 벽체공용비율, 코어면적, 건축면적 계수, 대당 지하주차면적(기본 38㎡), 기계·전기실(세대당 4.5㎡)은 <b>사업성검토용 추정 파라미터</b>이며 법정값이 아님. 도시형 생활주택 주차 특례(§27①2)·노인복지주택(§27⑥)·조례 강화기준 미반영.<br />
            · 본 도구는 개략 규모검토용으로 인허가 도서를 대체하지 않음.
          </div>
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

FeasibilityOverviewCalculator.__parseOrd = parseOrdinanceResult; /* 검증 스크립트용 노출 */
