# web — 결과표 웹 화면 (기능 6, Vercel 배포)

- 지금 `index.html` 은 배포 확인용 임시 페이지다. 빌드 없이 그대로 올라가는 정적 페이지다.
- Vercel 프로젝트의 Root Directory 는 `web` 으로 한다.
- 기능 6을 만들 때는 이 폴더 안에서 `index.html` 을 바꾸거나 파일을 더한다. 다른 폴더(스킬 · 가상데이터)는 건드리지 않는다.
- 가상 데이터만 쓴다.
- JD 분석(`api/analyze.js`, Vercel 함수)만 서버를 쓴다. Vercel 환경 변수:
  - `ANTHROPIC_API_KEY` (필수) — 없으면 화면에 「AI 키가 등록되지 않았습니다」로 뜬다. 키는 코드에 쓰지 않는다.
  - `ACCESS_CODE` (선택) — 정하면 같은 코드를 입력한 사람만 JD 분석을 쓸 수 있다. 공개 주소라서 키 사용량을 막으려면 정해 두는 것을 권한다.
  - `ANTHROPIC_MODEL` (선택) — 기본값 `claude-sonnet-5-5`.
- 글 · 링크 · PDF · 이미지(3MB 이하)를 받아 경력 연차 · 자격증 · 보유지식으로 정리한다. 결과는 「초안」으로만 들어가고 확정은 사람이 한다.

## 배포

- GitHub 저장소 `build3` 의 `main` 에 올리면 Vercel 이 `web/` 을 자동으로 배포한다 (Root Directory = web).
- 배포 주소: https://hr-resume-review-five.vercel.app
