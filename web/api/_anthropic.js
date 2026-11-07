// 세 AI 기능(JD 분석 · 면접 질문지 자동 생성 · 서류 자동 정리)이 함께 쓰는 Claude 호출 도우미.
// 환경 변수: ANTHROPIC_API_KEY (필수), ANTHROPIC_MODEL (선택, 기본 claude-sonnet-5-5)
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

function httpErr(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

async function rawCall(body, timeoutMs) {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  }).catch(() => { throw httpErr(504, 'AI 응답이 늦어 중단했습니다. 다시 시도해 주세요.'); });
}

/**
 * tool_choice로 강제 도구 호출을 시도한다. 배포 환경의 모델이 tool_choice "tool"을
 * 지원하지 않으면(Anthropic이 400으로 "tool_choice ... not supported"를 주면)
 * tool_choice "auto"로 한 번 더 시도한다 — 둘 다 받아들여지지 않는 모델도 있을 수
 * 있어서, 이 경우 system 프롬프트에 "반드시 그 도구로만 답하라"를 강하게 적어 둔다.
 * 그래도 도구를 쓰지 않고 답하면 호출한 쪽에서 502로 처리한다.
 */
async function callClaudeTool({ system, tool, content, maxTokens = 4000, timeoutMs = 55000 }) {
  const base = { model: MODEL, max_tokens: maxTokens, system, tools: [tool], messages: [{ role: 'user', content }] };

  let r = await rawCall({ ...base, tool_choice: { type: 'tool', name: tool.name } }, timeoutMs);
  if (!r.ok && r.status === 400) {
    const peek = await r.clone().json().catch(() => null);
    const msg = (peek && peek.error && peek.error.message) || '';
    if (/tool_choice/i.test(msg)) {
      r = await rawCall({ ...base, tool_choice: { type: 'auto' } }, timeoutMs);
    }
  }
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) throw httpErr(500, '서버의 AI 키 설정이 올바르지 않습니다. 관리자에게 알려 주세요.');
    if (r.status === 429) throw httpErr(429, 'AI 사용량이 몰렸습니다. 잠시 뒤 다시 시도해 주세요.');
    const peek = await r.json().catch(() => null);
    const detail = peek && peek.error && peek.error.message ? ` — ${peek.error.message}` : '';
    throw httpErr(502, `AI 호출에 실패했습니다 (${r.status})${detail}.`);
  }
  const data = await r.json();
  const block = (data.content || []).find((b) => b.type === 'tool_use' && b.name === tool.name);
  if (!block) throw httpErr(502, 'AI가 정해진 형식으로 답하지 못했습니다. 다시 시도해 주세요.');
  return block.input;
}

module.exports = { httpErr, callClaudeTool, MODEL };
