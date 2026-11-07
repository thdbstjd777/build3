#!/usr/bin/env node
// 지원서 묶음(압축파일 또는 폴더)을 읽어 JSON 으로 내보낸다.
//   node 문서읽기.mjs <지원서.zip | 폴더>
// - .docx / .txt / .md 는 본문을 뽑는다. .pdf 는 임시 폴더에 꺼내 경로만 알려 준다(클로드가 직접 읽는다).
// - 읽지 못한 파일은 상태 「읽기 실패」 와 사유를 남긴다.
// - 링크는 네트워크로 열지 않는다. 묶음 안의 「링크내용/링크목록.csv」(주소,파일)에 있고
//   주소의 호스트가 .test 로 끝나는 가상 링크만 그 파일 내용을 읽는다. 나머지는 「링크 확인 못 함」.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const 최대크기 = 20 * 1024 * 1024;

function 사용법() {
  console.error('사용법: node 문서읽기.mjs <지원서.zip | 폴더>');
  process.exit(1);
}

// ---------- zip 읽기 (메모리 안에서만 푼다) ----------
function 아스키인가(b) {
  return b.every((x) => x < 128);
}

function zip항목(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('압축파일이 아니거나 손상됨');
  const 개수 = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const 목록 = [];
  for (let n = 0; n < 개수; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('압축파일 목록이 손상됨');
    const flag = buf.readUInt16LE(off + 8);
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const usize = buf.readUInt32LE(off + 24);
    const nlen = buf.readUInt16LE(off + 28);
    const elen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const nb = buf.subarray(off + 46, off + 46 + nlen);
    const 이름 = (flag & 0x800) || 아스키인가(nb) ? nb.toString('utf8') : new TextDecoder('euc-kr').decode(nb);
    off += 46 + nlen + elen + clen;
    if (이름.endsWith('/')) continue;
    목록.push({
      이름,
      읽기() {
        if (csize === 0xffffffff || usize === 0xffffffff) throw new Error('zip64 는 지원하지 않음');
        if (usize > 최대크기) throw new Error('파일이 너무 큼');
        const n2 = buf.readUInt16LE(lho + 26);
        const e2 = buf.readUInt16LE(lho + 28);
        const 시작 = lho + 30 + n2 + e2;
        const raw = buf.subarray(시작, 시작 + csize);
        if (method === 0) return raw;
        if (method === 8) return zlib.inflateRawSync(raw, { maxOutputLength: 최대크기 });
        throw new Error(`지원하지 않는 압축 방식(${method})`);
      },
    });
  }
  return 목록;
}

function 폴더항목(루트) {
  const 목록 = [];
  const 걷기 = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) 걷기(p);
      else if (e.isFile()) {
        목록.push({
          이름: path.relative(루트, p).split(path.sep).join('/'),
          읽기() {
            if (fs.statSync(p).size > 최대크기) throw new Error('파일이 너무 큼');
            return fs.readFileSync(p);
          },
        });
      }
    }
  };
  걷기(루트);
  return 목록;
}

// ---------- 본문 뽑기 ----------
function 엔티티(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function 워드읽기(buf) {
  const 안 = zip항목(buf);
  const 문서 = 안.find((x) => x.이름 === 'word/document.xml');
  if (!문서) throw new Error('워드 문서 본문을 찾지 못함');
  const xml = 문서.읽기().toString('utf8');
  const 본문 = 엔티티(
    xml.replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, ''),
  ).trim();
  const 연결 = [];
  const rels = 안.find((x) => x.이름 === 'word/_rels/document.xml.rels');
  if (rels) {
    for (const m of rels.읽기().toString('utf8').matchAll(/Target="(https?:[^"]+)"[^>]*TargetMode="External"/g)) {
      연결.push(엔티티(m[1]));
    }
  }
  return { 본문, 연결 };
}

function 주소뽑기(본문, 추가 = []) {
  const 찾음 = [...본문.matchAll(/https?:\/\/[^\s)>\]"'」』，。]+/g)].map((m) => m[0].replace(/[.,;:]+$/, ''));
  return [...new Set([...찾음, ...추가])];
}

// 지원서 본문에서 연락처를 뽑는다. 처음 나온 값을 쓰고, 여러 개면 알린다(사람이 확인).
function 연락처뽑기(본문) {
  const 메일들 = [...new Set([...본문.matchAll(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)+/g)].map((m) => m[0].replace(/[.,;:]+$/, '')))];
  const 전화들 = [...new Set([...본문.matchAll(/(?<![\d-])0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}(?![\d-])/g)].map((m) => m[0].replace(/[.\s]/g, '-')))];
  const 결과 = { 이메일: 메일들[0] || '', 전화번호: 전화들[0] || '' };
  const 주의 = [];
  if (메일들.length > 1) 주의.push(`이메일이 ${메일들.length}개 있음(${메일들.join(', ')}) — 첫 번째만 씀`);
  if (전화들.length > 1) 주의.push(`전화번호가 ${전화들.length}개 있음(${전화들.join(', ')}) — 첫 번째만 씀`);
  if (주의.length) 결과.연락처주의 = 주의;
  return 결과;
}

// ---------- CSV (링크목록용 간단 파서) ----------
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
const 입력 = process.argv[2];
if (!입력 || !fs.existsSync(입력)) 사용법();

let 항목;
try {
  항목 = fs.statSync(입력).isDirectory() ? 폴더항목(입력) : zip항목(fs.readFileSync(입력));
} catch (e) {
  console.log(JSON.stringify({ 입력, 오류: `묶음을 열지 못함: ${e.message}` }, null, 2));
  process.exit(2);
}

항목 = 항목.filter((x) => !x.이름.startsWith('__MACOSX/') && !path.posix.basename(x.이름).startsWith('.'));

// 링크 목록 (가상 링크 → 묶음 안 파일)
const 링크지도 = new Map();
const 링크목록파일 = 항목.find((x) => path.posix.basename(x.이름) === '링크목록.csv');
const 링크파일들 = new Set();
if (링크목록파일) {
  const 폴더 = path.posix.dirname(링크목록파일.이름);
  const 줄들 = csv읽기(링크목록파일.읽기().toString('utf8'));
  for (const [주소, 파일] of 줄들.slice(1)) {
    if (!주소 || !파일) continue;
    const 이름 = 폴더 === '.' ? 파일 : `${폴더}/${파일}`;
    링크지도.set(주소.trim(), 이름);
    링크파일들.add(이름);
  }
}

function 링크읽기(주소) {
  let 호스트 = '';
  try { 호스트 = new URL(주소).hostname; } catch { /* 주소 형식이 아님 */ }
  const 파일이름 = 링크지도.get(주소);
  if (!호스트.endsWith('.test') || !파일이름) return { 주소, 상태: '링크 확인 못 함', 내용: '' };
  const 파일 = 항목.find((x) => x.이름 === 파일이름);
  if (!파일) return { 주소, 상태: '링크 확인 못 함', 내용: '' };
  try {
    return { 주소, 상태: '확인됨', 내용: 파일.읽기().toString('utf8').trim() };
  } catch {
    return { 주소, 상태: '링크 확인 못 함', 내용: '' };
  }
}

const pdf폴더 = path.join(os.tmpdir(), '서류-정리-pdf');
const 지원서 = [];
const 건너뜀 = [];

for (const 파일 of 항목) {
  const 이름 = 파일.이름;
  if (이름 === 링크목록파일?.이름 || 링크파일들.has(이름)) continue;
  const 확장자 = path.posix.extname(이름).toLowerCase();
  const 기본 = { 파일: 이름, 지원자ID_추정: (path.posix.basename(이름).match(/^[A-Za-z]+-\d+/) || [''])[0] };
  try {
    if (확장자 === '.docx') {
      const { 본문, 연결 } = 워드읽기(파일.읽기());
      if (!본문) throw new Error('본문이 비어 있음');
      지원서.push({ ...기본, 상태: '읽음', 본문, ...연락처뽑기(본문), 링크: 주소뽑기(본문, 연결).map(링크읽기) });
    } else if (['.txt', '.md'].includes(확장자)) {
      const 본문 = 파일.읽기().toString('utf8').replace(/^﻿/, '').trim();
      if (!본문) throw new Error('본문이 비어 있음');
      지원서.push({ ...기본, 상태: '읽음', 본문, ...연락처뽑기(본문), 링크: 주소뽑기(본문).map(링크읽기) });
    } else if (확장자 === '.pdf') {
      fs.mkdirSync(pdf폴더, { recursive: true });
      const 꺼낸곳 = path.join(pdf폴더, path.posix.basename(이름).replace(/[^\w.\-가-힣]/g, '_'));
      fs.writeFileSync(꺼낸곳, 파일.읽기());
      지원서.push({ ...기본, 상태: 'PDF 직접 읽기 필요', PDF경로: 꺼낸곳, 안내: 'Read 도구로 PDF 를 읽고, 링크는 이 스크립트와 같은 규칙(가상 링크만)으로 다룬다. 읽히지 않으면 읽기 실패로 판정 파일에 적는다.' });
    } else {
      건너뜀.push({ 파일: 이름, 사유: `지원하지 않는 형식(${확장자 || '확장자 없음'})` });
      지원서.push({ ...기본, 상태: '읽기 실패', 사유: `지원하지 않는 형식(${확장자 || '확장자 없음'})` });
    }
  } catch (e) {
    지원서.push({ ...기본, 상태: '읽기 실패', 사유: e.message });
  }
}

console.log(JSON.stringify({ 입력, 파일수: 지원서.length, 지원서 }, null, 2));
