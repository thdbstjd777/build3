#!/usr/bin/env node
// 평가 기준 파일 검사 + 판정 입력(JSON) → 결과표.csv
//   node 결과표_만들기.mjs 검사 <평가기준.md>
//   node 결과표_만들기.mjs 만들기 <평가기준.md> <판정.json> <결과표.csv>
// 충족 개수와 충족 여부는 여기서만 센다. 「서류 합격/불합격」 · 「면접 대상」 칸은 항상 비운다.
import fs from 'node:fs';

const 판정값 = ['충족', '부분 충족', '미충족', '근거 없음'];
const 링크값 = ['없음', '확인됨', '링크 확인 못 함'];
const 사람칸 = ['서류 합격/불합격', '면접 대상'];
const 연락칸 = ['이름', '이메일', '전화번호']; // 지원서에서 읽은 값. 표의 맨 끝에 둔다. 오늘은 가상 이름(예: 홍길동)만 쓴다

// 오늘은 가상 연락처만 쓴다: 예시 도메인(example.com · .test 등)과 0000 번호
const 가상메일 = (v) => /@([a-z0-9-]+\.)*(example\.(com|org|net)|[a-z0-9-]+\.(test|example|invalid))$/i.test(v);
const 메일모양 = (v) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(v);
const 가상전화 = (v) => /^0\d{1,2}-0000-\d{4}$/.test(v);

function 끝내기(코드, 말) {
  console.error(말);
  process.exit(코드);
}

// ---------- 평가 기준 파일 ----------
function 기준읽기(파일) {
  if (!fs.existsSync(파일)) 끝내기(1, `평가 기준 파일을 찾지 못함: ${파일}`);
  const 글 = fs.readFileSync(파일, 'utf8').replace(/^﻿/, '');
  const 상태원본 = (글.match(/^[\s\-*]*상태\s*[:：]\s*(.+?)\s*$/m) || [])[1] || '';
  const 상태 = 상태원본.replace(/[「」]/g, '').trim();
  if (상태 !== '확정') {
    끝내기(2, `평가를 시작하지 않습니다. 기준 파일의 상태가 「${상태 || '없음'}」입니다. 담당자가 「확정」한 파일만 쓸 수 있습니다.`);
  }
  const 기준개수 = Number((글.match(/충족 기준 개수\s*[:：]\s*(\d+)/) || [])[1]);
  const 항목 = [];
  for (const 줄 of 글.split(/\r?\n/)) {
    if (!줄.trim().startsWith('|')) continue;
    const 칸 = 줄.trim().replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
    if (칸.length < 3 || /^-+$/.test(칸[0].replace(/:/g, '')) || 칸[0] === '번호') continue;
    항목.push({ 번호: 칸[0], 이름: 칸[1], 기준: 칸[2], 비고: 칸[3] || '' });
  }
  if (항목.length === 0) 끝내기(2, '기준 파일에 평가 항목 표가 없습니다.');
  if (항목.some((x) => !x.이름 || /[\[\]]/.test(x.이름 + x.기준))) 끝내기(2, '기준 파일의 항목이 채워지지 않았습니다([ ] 가 남아 있음).');
  if (new Set(항목.map((x) => x.이름)).size !== 항목.length) 끝내기(2, '기준 파일에 이름이 같은 항목이 있습니다.');
  if (!Number.isInteger(기준개수) || 기준개수 < 1 || 기준개수 > 항목.length) {
    끝내기(2, `「충족 기준 개수」가 없거나 올바르지 않습니다(항목 ${항목.length}개 중 1~${항목.length}).`);
  }
  return { 항목, 기준개수 };
}

// ---------- CSV ----------
function 칸쓰기(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv읽기(s) {
  const 줄들 = [];
  let 줄 = [], 칸 = '', 따옴표 = false;
  s = s.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (따옴표) {
      if (c === '"' && s[i + 1] === '"') { 칸 += '"'; i++; }
      else if (c === '"') 따옴표 = false;
      else 칸 += c;
    } else if (c === '"') 따옴표 = true;
    else if (c === ',') { 줄.push(칸); 칸 = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      줄.push(칸); 칸 = '';
      if (줄.some((x) => x !== '')) 줄들.push(줄);
      줄 = [];
    } else 칸 += c;
  }
  줄.push(칸);
  if (줄.some((x) => x !== '')) 줄들.push(줄);
  return 줄들;
}

// ---------- 실행 ----------
const [, , 명령, 기준경로, 판정경로, 출력경로] = process.argv;

if (명령 === '검사') {
  if (!기준경로) 끝내기(1, '사용법: node 결과표_만들기.mjs 검사 <평가기준.md>');
  const { 항목, 기준개수 } = 기준읽기(기준경로);
  console.log(`기준 파일 확인: 상태 확정 · 항목 ${항목.length}개 · ${항목.length}개 중 ${기준개수}개 이상 충족이면 「기준 충족」`);
  for (const x of 항목) console.log(`  ${x.번호}. ${x.이름} — ${x.기준}${x.비고 ? ` (${x.비고})` : ''}`);
  process.exit(0);
}

if (명령 !== '만들기' || !기준경로 || !판정경로 || !출력경로) {
  끝내기(1, '사용법:\n  node 결과표_만들기.mjs 검사 <평가기준.md>\n  node 결과표_만들기.mjs 만들기 <평가기준.md> <판정.json> <결과표.csv>');
}

const { 항목, 기준개수 } = 기준읽기(기준경로);
const N = 항목.length;

let 판정;
try {
  판정 = JSON.parse(fs.readFileSync(판정경로, 'utf8').replace(/^﻿/, ''));
} catch (e) {
  끝내기(1, `판정 파일을 읽지 못함: ${e.message}`);
}
if (!Array.isArray(판정) || 판정.length === 0) 끝내기(1, '판정 파일은 지원자 배열이어야 합니다.');

const 아이디들 = new Set();
const 오류 = [];
const 경고 = [];
const 실데이터 = [];
for (const [i, p] of 판정.entries()) {
  const 이름 = p?.지원자ID || `${i + 1}번째`;
  if (!p?.지원자ID) 오류.push(`${이름}: 지원자ID 없음`);
  else if (아이디들.has(p.지원자ID)) 오류.push(`${이름}: 지원자ID 중복`);
  else 아이디들.add(p.지원자ID);
  if (!링크값.includes(p?.링크상태)) 오류.push(`${이름}: 링크상태는 ${링크값.join(' / ')} 중 하나`);
  for (const k of 연락칸) if (p?.[k] != null && typeof p[k] !== 'string') 오류.push(`${이름}: ${k}는 글자(문자열)여야 함`);
  const 메일 = String(p?.이메일 ?? '').trim(), 전화 = String(p?.전화번호 ?? '').trim();
  if (메일 && !메일모양(메일)) 경고.push(`${이름}: 이메일 형식이 맞지 않음(${메일}) — 그대로 적되 사람이 확인`);
  if (메일 && 메일모양(메일) && !가상메일(메일)) 실데이터.push(`${이름}: 이메일 ${메일}`);
  if (전화 && !가상전화(전화)) 실데이터.push(`${이름}: 전화번호 ${전화}`);
  if (p?.읽기실패) continue;
  if (!Array.isArray(p?.항목) || p.항목.length !== N) {
    오류.push(`${이름}: 항목 판정이 ${N}개여야 함`);
    continue;
  }
  for (const [j, x] of p.항목.entries()) {
    if (!판정값.includes(x?.판정)) 오류.push(`${이름} 항목 ${j + 1}: 판정은 ${판정값.join(' / ')} 중 하나`);
    if (!String(x?.근거 ?? '').trim()) 오류.push(`${이름} 항목 ${j + 1}: 근거 한 줄이 비어 있음`);
    if (x?.링크근거 && p.링크상태 !== '확인됨') 오류.push(`${이름} 항목 ${j + 1}: 링크근거인데 링크상태가 확인됨이 아님`);
  }
}
if (실데이터.length) {
  끝내기(4, `실제 연락처로 보이는 값이 있어 결과표를 만들지 않았습니다(오늘은 가상 연락처만: 예시 도메인 example.com · 010-0000-0000 꼴):\n- ${실데이터.join('\n- ')}\n연락처를 빼고 다시 실행하거나 담당자에게 알리세요.`);
}
if (오류.length) 끝내기(1, `판정 파일에 문제가 있어 결과표를 만들지 않았습니다:\n- ${오류.join('\n- ')}`);

// 사람이 이미 채운 칸을 덮어쓰지 않는다
if (fs.existsSync(출력경로)) {
  const 기존 = csv읽기(fs.readFileSync(출력경로, 'utf8'));
  const 머리 = 기존[0] || [];
  const 위치 = 사람칸.map((n) => 머리.indexOf(n)).filter((k) => k >= 0);
  if (기존.slice(1).some((r) => 위치.some((k) => (r[k] || '').trim() !== ''))) {
    끝내기(3, `${출력경로} 에 사람이 채운 합격/불합격 · 면접 대상 값이 있어 덮어쓰지 않았습니다. 다른 파일 이름으로 저장하세요.`);
  }
}

const 머리글 = ['지원자 ID', '직무'];
for (const x of 항목) 머리글.push(`${x.이름} 판정`, `${x.이름} 근거`);
머리글.push('기준 충족 개수', '기준 충족 여부', '링크 확인 상태', '읽기 실패 여부', ...사람칸, ...연락칸);

const 행들 = [];
const 화면 = [];
for (const p of 판정) {
  const 행 = [p.지원자ID, p.직무 || ''];
  const 화면칸 = [];
  let 개수 = '', 여부 = '';
  if (p.읽기실패) {
    for (let j = 0; j < N; j++) 행.push('', '');
    화면칸.push(...항목.map(() => '—'));
  } else {
    let 센값 = 0;
    for (const x of p.항목) {
      const 근거 = `${x.링크근거 ? '[링크] ' : ''}${String(x.근거).trim()}`;
      행.push(x.판정, 근거);
      화면칸.push(`${x.판정} · ${근거}`);
      if (x.판정 === '충족') 센값++;
    }
    개수 = `${센값}/${N}`;
    여부 = 센값 >= 기준개수 ? '충족' : '미충족';
  }
  const 실패 = p.읽기실패 ? `읽기 실패${p.읽기실패사유 ? ` (${p.읽기실패사유})` : ''}` : '';
  행.push(개수, 여부, p.링크상태, 실패, '', '', p.읽기실패 ? '' : String(p.이름 ?? '').trim(), p.읽기실패 ? '' : String(p.이메일 ?? '').trim(), p.읽기실패 ? '' : String(p.전화번호 ?? '').trim());
  행들.push(행);
  화면.push([p.지원자ID, p.직무 || '', ...화면칸, 개수 || '—', 여부 || '—', p.링크상태, 실패 || '—']);
}

const 본문 = [머리글, ...행들].map((r) => r.map(칸쓰기).join(',')).join('\r\n') + '\r\n';
fs.writeFileSync(출력경로, '﻿' + 본문, 'utf8');

const 표칸 = (v) => String(v).replace(/\|/g, '/').replace(/\r?\n/g, ' ');
const 화면머리 = ['지원자 ID', '직무', ...항목.map((x) => x.이름), `충족 개수`, '기준 충족 여부', '링크', '읽기 실패'];
const 이름수 = 판정.filter((p) => !p.읽기실패 && String(p.이름 ?? '').trim()).length;
const 메일수 = 판정.filter((p) => !p.읽기실패 && String(p.이메일 ?? '').trim()).length;
const 전화수 = 판정.filter((p) => !p.읽기실패 && String(p.전화번호 ?? '').trim()).length;
console.log(`${출력경로} 저장: ${판정.length}명 · 서류 합격/불합격 · 면접 대상 칸은 비어 있음 · 이름 ${이름수}명 · 이메일 ${메일수}명 · 전화번호 ${전화수}명 (표 맨 끝 칸, 화면에는 찍지 않음)`);
for (const w of 경고) console.error(`주의: ${w}`);
console.log('');
console.log(`| ${화면머리.join(' | ')} |`);
console.log(`|${화면머리.map(() => '---').join('|')}|`);
for (const r of 화면) console.log(`| ${r.map(표칸).join(' | ')} |`);
