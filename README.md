# 모닥불 눈싸움

눈 내린 밤바다 해변에서 여러 명이 눈뭉치를 던지고 주먹을 날리는 3D 멀티플레이 게임.

- `server.js`: 게임 페이지와 WebSocket(`/ws`)을 함께 제공. 눈뭉치 궤적, 명중, 주먹, 체온, 리스폰을 서버가 판정한다.
- `public/map.js`: 맵(엄폐물, 등장 지점, 코코아 위치)과 규칙 수치. 서버와 화면이 같이 쓴다.
- `public/index.html`: Three.js 화면.

## 실행

```bash
npm install
npm start
```

브라우저에서 `http://localhost:3000` 을 연다. 같은 와이파이의 친구는 `http://<이 PC의 IP>:3000` 으로 들어온다.
주소 뒤에 `?room=이름` 을 붙이면 그 방끼리만 붙는다. 포트는 `PORT` 환경변수로 바꾼다.

## 배포

WebSocket을 계속 열어 둘 수 있는 Node 호스팅(Render, Railway, Fly.io 등)에 올리면 된다.
시작 명령은 `npm start`, 상태 확인 경로는 `/health`.
