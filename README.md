# 우리팀 허브

팀 소통·공지를 한 화면에서 보는 웹앱입니다. 휴대폰·PC 어디서든 열 수 있고, 홈 화면에 추가하면 앱처럼 쓸 수 있습니다.

- **바로 열기:** https://leanonmept.github.io/team-hub/
- **만든 방식:** 단일 HTML 파일(`index.html`) — 별도 빌드 없이 GitHub Pages로 서빙됩니다.

## 화면

- **공지** — 공지 작성·고정·중요 표시, 댓글, 읽음 확인
- **상태** — 팀원 근무 상태(근무/휴무/연차/교육 등)와 한 줄 메모
- **일정** — 당직·당직 섬·교육 일정 달력
- **사진** — 팀 사진 공유
- **설정** — 팀원 승인, 관리자 기능

## 처음 설정하기

처음에는 **미리보기 모드**(내 기기에만 저장)로 열립니다. 실제로 팀과 함께 쓰려면 Firebase를 연결하세요.

1. Firebase 콘솔에서 새 프로젝트를 만들고, Authentication에서 **이메일/비밀번호** 로그인을 켭니다.
2. Authentication → Settings → **승인된 도메인**에 `leanonmept.github.io`를 추가합니다.
3. Firestore Database를 만듭니다(위치: `asia-northeast3` 서울 권장).
4. 이 저장소의 [`firebase-rules.txt`](firebase-rules.txt) 내용을 Firestore 규칙 탭에 붙여넣고 게시합니다.
5. 앱의 설정 화면에서 Firebase 웹 앱 설정값(`apiKey`, `authDomain`, `projectId`, `appId` 등)을 입력합니다.
6. 첫 팀장(관리자) 지정 방법은 `firebase-rules.txt` 맨 위 주석을 참고하세요.

## 참고

- `firebase-rules.txt`는 Firebase 콘솔에 붙여넣는 보안 규칙 원본입니다(웹 화면에서는 쓰이지 않습니다).
- 저장소를 고쳐도 Pages 반영까지 1분 안팎 걸릴 수 있습니다.
