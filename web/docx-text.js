// .docx 본문 글자 꺼내기 — 브라우저(DecompressionStream)와 Node 18+ 에서 같이 쓴다. 파일은 밖으로 보내지 않고 글자만 서버로 보낸다.
(function (root) {
  async function inflateRaw(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }

  // zip 안에서 이름이 같은 파일 하나의 바이트를 돌려준다. 없으면 null
  async function zipEntry(buf, wanted) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('docx 파일이 아니거나 손상됨');
    const count = dv.getUint16(eocd + 10, true);
    let off = dv.getUint32(eocd + 16, true);
    const dec = new TextDecoder('utf-8');
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(off, true) !== 0x02014b50) throw new Error('docx 목록이 손상됨');
      const flag = dv.getUint16(off + 8, true), method = dv.getUint16(off + 10, true);
      const csize = dv.getUint32(off + 20, true), usize = dv.getUint32(off + 24, true);
      const nlen = dv.getUint16(off + 28, true), elen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true);
      const lho = dv.getUint32(off + 42, true);
      const name = dec.decode(buf.subarray(off + 46, off + 46 + nlen));
      off += 46 + nlen + elen + clen;
      if (name !== wanted) continue;
      if (flag & 1) throw new Error('암호가 걸린 파일');
      if (usize > 30 * 1024 * 1024) throw new Error('파일이 너무 큼');
      const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
      const raw = buf.subarray(start, start + csize);
      if (method === 0) return raw;
      if (method === 8) return inflateRaw(raw);
      throw new Error('지원하지 않는 압축 방식');
    }
    return null;
  }

  function decodeXml(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, '&');
  }

  // 본문(word/document.xml) 문단 · 표 칸 · 줄바꿈을 살려 글자만 뽑는다
  function xmlToText(xml) {
    return decodeXml(xml
      .replace(/<w:tab\b[^>]*\/>/g, '\t')
      .replace(/<w:(br|cr)\b[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<\/w:tc>/g, ' | ')
      .replace(/<[^>]+>/g, ''))
      .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  async function docxToText(arrayBuffer) {
    const buf = new Uint8Array(arrayBuffer);
    const doc = await zipEntry(buf, 'word/document.xml');
    if (!doc) throw new Error('docx 본문을 찾지 못함');
    return xmlToText(new TextDecoder('utf-8').decode(doc));
  }

  root.docxToText = docxToText;
  if (typeof module !== 'undefined' && module.exports) module.exports = { docxToText, xmlToText };
})(typeof window !== 'undefined' ? window : globalThis);
