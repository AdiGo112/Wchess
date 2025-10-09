# ChessWeb

Full-stack MERN Chess Web App with real-time multiplayer using Socket.IO.

Quick start

1. Backend

 - cd backend
 - copy `.env.example` to `.env` and set `MONGO_URI` and `JWT_SECRET`
 - npm install
 - npm run dev

2. Frontend

 - cd frontend
 - copy `.env` keys if needed (REACT_APP_API_URL)
 - npm install
 - npm start

APIs

 - POST /api/auth/register { username, email, password }
 - POST /api/auth/login { email, password }
 - GET /api/games
 - POST /api/games/create (auth)
 - POST /api/games/join (auth)
