# Pokemon Battle 🎮

## Project Overview
Turn-based Pokemon battle game — web-based, playable di browser.

## Tech Stack
- **Frontend:** HTML + CSS + Vanilla JS (simple, no framework)
- **Backend:** Node.js + Express (API server)
- **Data:** JSON files (pokemon data, moves, types)
- **No database** — keep it simple for v1

## Game Features (v1)
1. Player picks 1 Pokemon dari roster
2. CPU opponent picks random Pokemon
3. Turn-based battle system
4. 4 moves per Pokemon
5. Type effectiveness (fire > grass > water > fire)
6. HP bar, damage calculation
7. Win/lose screen

## Architecture
```
pokemon-battle/
├── README.md          ← YOU ARE HERE (shared guide)
├── backend/
│   ├── server.js      ← Express API server
│   ├── data/
│   │   ├── pokemon.json    ← Pokemon roster + stats
│   │   ├── moves.json      ← Move data
│   │   └── types.json      ← Type effectiveness chart
│   └── routes/
│       ├── battle.js       ← Battle logic API
│       └── pokemon.js      ← Pokemon data API
├── frontend/
│   ├── index.html     ← Main page
│   ├── css/
│   │   └── style.css  ← Styling
│   └── js/
│       ├── app.js     ← Main app logic
│       ├── battle.js  ← Battle UI logic
│       └── api.js     ← API calls to backend
└── tests/
    └── battle.test.js ← QA test suite
```

## API Endpoints
- `GET /api/pokemon` — list all pokemon
- `GET /api/pokemon/:id` — get pokemon detail
- `POST /api/battle/start` — start battle (pick pokemon)
- `POST /api/battle/move` — execute a move
- `GET /api/battle/:id` — get battle state

## Battle Logic
- Damage = ((2 * Level / 5 + 2) * Power * Atk/Def) / 50 + 2) * TypeMultiplier * Random(0.85-1.0)
- Type chart: Fire > Grass > Water > Fire (classic triangle + Normal type)
- Each Pokemon: HP, Attack, Defense, Speed, 4 Moves
- Speed determines who goes first

## Agent Responsibilities
| Agent | Scope | Files |
|-------|-------|-------|
| **Backend** | API server, battle logic, data | `backend/**` |
| **Frontend** | UI, styling, browser logic | `frontend/**` |
| **QA** | Testing, bug reports, validation | `tests/**` + review all |

## Rules for All Agents
1. **READ THIS README FIRST** before doing anything
2. Stay in your lane — only edit files in your scope
3. Use the API contract above — don't change endpoints without PM approval
4. Commit messages: `[agent-name] description`
5. If you need something from another agent, note it in your code as `// TODO: needs [agent-name] to...`

## Status
- [ ] Backend: Pokemon data + API
- [ ] Backend: Battle logic
- [ ] Frontend: Pokemon select screen
- [ ] Frontend: Battle screen UI
- [ ] Frontend: Connect to API
- [ ] QA: Test battle logic
- [ ] QA: Test API endpoints
- [ ] Integration: Full flow test
