# web — 결과표 웹 화면 (기능 6, Vercel 배포)

- 지금 `index.html` 은 배포 확인용 임시 페이지다. 빌드 없이 그대로 올라가는 정적 페이지다.
- Vercel 프로젝트의 Root Directory 는 `web` 으로 한다.
- 기능 6을 만들 때는 이 폴더 안에서 `index.html` 을 바꾸거나 파일을 더한다. 다른 폴더(스킬 · 가상데이터)는 건드리지 않는다.
- 가상 데이터만 쓴다.
- 서버를 쓰는 AI 기능 셋 다 같은 Vercel 환경 변수를 쓴다(`api/_anthropic.js` 공용 호출 도우미):
  - `ANTHROPIC_API_KEY` (필수) — 없으면 화면에 「AI 키가 등록되지 않았습니다」로 뜬다. 키는 코드에 쓰지 않는다.
  - `ACCESS_CODE` (선택) — 정하면 같은 코드를 입력한 사람만 쓸 수 있다. 공개 주소라서 키 사용량을 막으려면 정해 두는 것을 권한다. 접속 코드는 세 기능이 같은 값을 공유한다(한 번 입력하면 `sessionStorage`에 저장).
  - `ANTHROPIC_MODEL` (선택) — 기본값 `claude-sonnet-5-5`. **이 값이 강제 도구 호출(tool_choice)을 지원하지 않는 모델이면 AI 호출이 400으로 실패한다** — `api/_anthropic.js`가 자동으로 `tool_choice: auto`로 한 번 더 시도하지만, 그래도 안 되면 이 환경 변수를 지우거나 올바른 모델 ID로 바꿔야 한다.
- `api/analyze.js` — JD(글 · 링크 · PDF · 이미지, 3MB 이하)를 받아 경력 연차 · 자격증 · 보유지식으로 정리한다. 결과는 「초안」으로만 들어가고 확정은 사람이 한다.
- `api/interview-questions.js` — 서류 합격자의 직무 · 평가 항목 판정을 받아 면접 질문지(전사 공통 · 직무 공통 · 지원자별, BEST/WORST 포함)를 만든다.
- `api/screen-resumes.js` — 지원서 PDF(한 번에 15건 · 3MB 이하)와 확정된 직무 평가 기준을 받아, 결과표.csv를 그 자리에서 만든다(「①서류 업로드」의 "AI로 지원서 바로 정리하기"). 지원서 1건당 Claude를 한 번씩 부르고, 기준 충족 개수 · 충족 여부는 서버가 직접 센다(AI가 세지 않는다). Word · HWP · 스캔 이미지는 아직 못 읽는다 — 클로드의 `/서류-정리`를 쓴다.
- `vercel.json` — 위 세 함수의 실행 시간을 60초로 늘린다(기본값으로는 여러 건을 처리하다 중간에 끊길 수 있다).

## 배포

- GitHub 저장소 `build3` 의 `main` 에 올리면 Vercel 이 `web/` 을 자동으로 배포한다 (Root Directory = web).
- 배포 주소: https://hr-resume-review-five.vercel.app
