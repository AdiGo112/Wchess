# Implementation Prompt — Frontend (Feature 07: Tournaments)

## Purpose

Self-contained prompt for a fresh AI session. Paste everything between "BEGIN PROMPT"
and "END PROMPT" to implement the Tournaments frontend.

---

## BEGIN PROMPT

You are implementing the Tournaments UI for ChessWeb, a React 18 + TypeScript chess
application using React Router v6, TanStack Query (React Query v5), Zustand, Tailwind CSS,
Radix UI, and Socket.io-client.

### Assumptions

- Axios instance is already configured at `frontend/src/lib/api.ts` (attaches JWT from
  localStorage automatically).
- Socket.io client is already configured at `frontend/src/lib/socket.ts` and exported
  as `socket`.
- Zustand store root is at `frontend/src/store/index.ts`.
- Radix UI is installed: `@radix-ui/react-tabs`, `@radix-ui/react-toast`.
- React Query QueryClient is provided at app root.

---

### Step 1: Zustand Slice

Add to `frontend/src/store/tournamentSlice.ts`:

```typescript
import { create } from 'zustand';

interface TournamentSlice {
  activeTournamentId: string | null;
  joinedTournamentIds: string[];
  setActiveTournament: (id: string | null) => void;
  addJoinedTournament: (id: string) => void;
  removeJoinedTournament: (id: string) => void;
}

export const useTournamentStore = create<TournamentSlice>((set) => ({
  activeTournamentId: null,
  joinedTournamentIds: [],
  setActiveTournament: (id) => set({ activeTournamentId: id }),
  addJoinedTournament: (id) =>
    set((s) => ({ joinedTournamentIds: [...s.joinedTournamentIds, id] })),
  removeJoinedTournament: (id) =>
    set((s) => ({ joinedTournamentIds: s.joinedTournamentIds.filter((x) => x !== id) })),
}));
```

---

### Step 2: React Query Hooks

Create `frontend/src/hooks/useTournaments.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export interface Tournament {
  id: string;
  name: string;
  status: 'WAITING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  variant: string;
  timeControl: string;
  maxPlayers: number;
  currentPlayers: number;
  rounds: number;
  currentRound: number;
  organizer: { id: string; username: string };
  createdAt: string;
}

export interface StandingsEntry {
  rank: number;
  userId: string;
  username: string;
  points: number;
  tiebreak: number;
  byeRound: number | null;
  eliminated: boolean;
}

// List all tournaments, optionally filtered by status
export function useTournaments(status?: string) {
  return useQuery<Tournament[]>({
    queryKey: ['tournaments', status],
    queryFn: () =>
      api.get('/tournaments', { params: status ? { status } : {} }).then((r) => r.data),
    refetchInterval: (query) => {
      // Auto-refresh every 10s if any tournament is ACTIVE
      const data = query.state.data;
      return data?.some((t) => t.status === 'ACTIVE') ? 10_000 : false;
    },
  });
}

// Single tournament with standings refetch when active
export function useTournament(id: string) {
  return useQuery<Tournament>({
    queryKey: ['tournament', id],
    queryFn: () => api.get(`/tournaments/${id}`).then((r) => r.data),
    enabled: !!id,
    refetchInterval: (query) =>
      query.state.data?.status === 'ACTIVE' ? 5_000 : false,
  });
}

export function useTournamentStandings(id: string) {
  return useQuery<StandingsEntry[]>({
    queryKey: ['tournament-standings', id],
    queryFn: () => api.get(`/tournaments/${id}/standings`).then((r) => r.data),
    enabled: !!id,
    refetchInterval: (query) => {
      // Refetch standings every 5s while the tournament is active
      // The tournament status is read from the sibling query cache — rely on the
      // parent component passing isActive.
      return false; // caller controls via invalidateQueries from Socket.io
    },
  });
}

export function useJoinTournament() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tournamentId: string) =>
      api.post(`/tournaments/${tournamentId}/join`).then((r) => r.data),
    onSuccess: (_data, tournamentId) => {
      qc.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      qc.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });
}

export function useStartTournament() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tournamentId: string) =>
      api.post(`/tournaments/${tournamentId}/start`).then((r) => r.data),
    onSuccess: (_data, tournamentId) => {
      qc.invalidateQueries({ queryKey: ['tournament', tournamentId] });
    },
  });
}

export function useCreateTournament() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      timeControl: string;
      maxPlayers: number;
      rounds: number;
      variant?: string;
    }) => api.post('/tournaments', body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournaments'] });
    },
  });
}
```

---

### Step 3: TournamentListPage

Create `frontend/src/pages/TournamentListPage.tsx`:

```tsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTournaments, useCreateTournament } from '../hooks/useTournaments';
import { useTournamentStore } from '../store/tournamentSlice';

const STATUS_LABELS: Record<string, { label: string; classes: string }> = {
  WAITING:   { label: 'Waiting',   classes: 'bg-green-100 text-green-800' },
  ACTIVE:    { label: 'Active',    classes: 'bg-blue-100  text-blue-800'  },
  COMPLETED: { label: 'Completed', classes: 'bg-gray-100  text-gray-600'  },
  CANCELLED: { label: 'Cancelled', classes: 'bg-red-100   text-red-700'   },
};

export default function TournamentListPage() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [showCreate, setShowCreate] = useState(false);
  const { data: tournaments, isLoading, error } = useTournaments(statusFilter);
  const joinedIds = useTournamentStore((s) => s.joinedTournamentIds);

  if (isLoading) return <div className="p-6 text-gray-500">Loading tournaments…</div>;
  if (error)     return <div className="p-6 text-red-600">Failed to load tournaments.</div>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tournaments</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          Create Tournament
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-4">
        {[undefined, 'WAITING', 'ACTIVE', 'COMPLETED'].map((s) => (
          <button
            key={s ?? 'ALL'}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
              statusFilter === s
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
            }`}
          >
            {s ?? 'All'}
          </button>
        ))}
      </div>

      {/* Tournament list */}
      {!tournaments?.length ? (
        <p className="text-gray-500 text-center py-12">No tournaments found.</p>
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => {
            const { label, classes } = STATUS_LABELS[t.status] ?? STATUS_LABELS.WAITING;
            const alreadyJoined = joinedIds.includes(t.id);
            return (
              <div
                key={t.id}
                className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div>
                  <Link
                    to={`/tournaments/${t.id}`}
                    className="font-semibold text-gray-900 hover:text-indigo-600"
                  >
                    {t.name}
                  </Link>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {t.timeControl} · {t.variant} · {t.currentPlayers}/{t.maxPlayers} players · {t.rounds} rounds
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${classes}`}>
                    {label}
                  </span>
                  {t.status === 'WAITING' && !alreadyJoined && (
                    <Link
                      to={`/tournaments/${t.id}`}
                      className="text-sm text-indigo-600 font-medium hover:underline"
                    >
                      Join
                    </Link>
                  )}
                  {alreadyJoined && (
                    <span className="text-xs text-green-600 font-medium">Joined</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && <CreateTournamentModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function CreateTournamentModal({ onClose }: { onClose: () => void }) {
  const { mutate, isPending, error } = useCreateTournament();
  const [form, setForm] = useState({
    name: '', timeControl: '5+0', maxPlayers: 8, rounds: 3, variant: 'standard',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutate(form, { onSuccess: onClose });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-lg font-bold mb-4">Create Tournament</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Tournament name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="Time control (e.g. 5+0)"
            value={form.timeControl}
            onChange={(e) => setForm((f) => ({ ...f, timeControl: e.target.value }))}
            required
          />
          <div className="flex gap-3">
            <input
              type="number" min={2} max={256}
              className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Max players"
              value={form.maxPlayers}
              onChange={(e) => setForm((f) => ({ ...f, maxPlayers: Number(e.target.value) }))}
            />
            <input
              type="number" min={1} max={11}
              className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Rounds"
              value={form.rounds}
              onChange={(e) => setForm((f) => ({ ...f, rounds: Number(e.target.value) }))}
            />
          </div>
          {error && (
            <p className="text-red-600 text-sm">
              {(error as any).response?.data?.message ?? 'Failed to create tournament'}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
              Cancel
            </button>
            <button
              type="submit" disabled={isPending}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

---

### Step 4: TournamentDetailPage

Create `frontend/src/pages/TournamentDetailPage.tsx`:

```tsx
import React, { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import { useQueryClient } from '@tanstack/react-query';
import {
  useTournament, useTournamentStandings, useJoinTournament, useStartTournament,
} from '../hooks/useTournaments';
import { useTournamentStore } from '../store/tournamentSlice';
import { socket } from '../lib/socket';

const STATUS_CLASSES: Record<string, string> = {
  WAITING:   'bg-green-100 text-green-800',
  ACTIVE:    'bg-blue-100  text-blue-800',
  COMPLETED: 'bg-gray-100  text-gray-600',
  CANCELLED: 'bg-red-100   text-red-700',
};

export default function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data: tournament, isLoading } = useTournament(id!);
  const { data: standings } = useTournamentStandings(id!);
  const joinMutation = useJoinTournament();
  const startMutation = useStartTournament();
  const addJoined = useTournamentStore((s) => s.addJoinedTournament);

  // Socket.io listeners
  useEffect(() => {
    const handleRoundStarted = (payload: { tournamentId: string; round: number }) => {
      if (payload.tournamentId !== id) return;
      qc.invalidateQueries({ queryKey: ['tournament', id] });
      qc.invalidateQueries({ queryKey: ['tournament-standings', id] });
      // Show toast (simplified — wire up Radix Toast for full implementation)
      console.info(`Round ${payload.round} started!`);
    };

    const handleGameStarted = (payload: {
      tournamentId: string; round: number; gameId: string; whiteId: string; blackId: string;
    }) => {
      if (payload.tournamentId !== id) return;
      qc.invalidateQueries({ queryKey: ['tournament', id] });
    };

    socket.on('tournamentRoundStarted', handleRoundStarted);
    socket.on('tournamentGameStarted', handleGameStarted);
    return () => {
      socket.off('tournamentRoundStarted', handleRoundStarted);
      socket.off('tournamentGameStarted', handleGameStarted);
    };
  }, [id, qc]);

  if (isLoading || !tournament) {
    return <div className="p-6 text-gray-500">Loading…</div>;
  }

  const statusClasses = STATUS_CLASSES[tournament.status] ?? '';

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">{tournament.name}</h1>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusClasses}`}>
            {tournament.status}
          </span>
        </div>
        <p className="text-sm text-gray-500">
          {tournament.timeControl} · {tournament.variant} · Round {tournament.currentRound}/{tournament.rounds} ·
          Organised by {tournament.organizer.username}
        </p>
      </div>

      {/* Join / Start buttons */}
      {tournament.status === 'WAITING' && (
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => joinMutation.mutate(id!, { onSuccess: () => addJoined(id!) })}
            disabled={joinMutation.isPending}
            className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {joinMutation.isPending ? 'Joining…' : 'Join Tournament'}
          </button>
          <button
            onClick={() => startMutation.mutate(id!)}
            disabled={startMutation.isPending}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {startMutation.isPending ? 'Starting…' : 'Start (Organizer)'}
          </button>
        </div>
      )}

      {/* Tabs */}
      <Tabs.Root defaultValue="overview">
        <Tabs.List className="flex border-b border-gray-200 mb-4">
          {['overview', 'standings', 'games'].map((tab) => (
            <Tabs.Trigger
              key={tab}
              value={tab}
              className="px-4 py-2 text-sm font-medium capitalize text-gray-500 border-b-2 border-transparent data-[state=active]:border-indigo-600 data-[state=active]:text-indigo-600"
            >
              {tab}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="overview">
          <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 space-y-2">
            <p><span className="font-medium">Players:</span> {tournament.currentPlayers} / {tournament.maxPlayers}</p>
            <p><span className="font-medium">Rounds:</span> {tournament.rounds}</p>
            <p><span className="font-medium">Variant:</span> {tournament.variant}</p>
            <p><span className="font-medium">Time control:</span> {tournament.timeControl}</p>
          </div>
        </Tabs.Content>

        <Tabs.Content value="standings">
          {!standings?.length ? (
            <p className="text-gray-500 text-sm">No standings yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-4 font-medium">Rank</th>
                  <th className="py-2 pr-4 font-medium">Player</th>
                  <th className="py-2 pr-4 font-medium">Points</th>
                  <th className="py-2 font-medium">Tiebreak (Buchholz)</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((entry) => (
                  <tr
                    key={entry.userId}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="py-2 pr-4 text-gray-500">{entry.rank}</td>
                    <td className="py-2 pr-4 font-medium text-gray-900">{entry.username}</td>
                    <td className="py-2 pr-4">{entry.points}</td>
                    <td className="py-2 text-gray-500">{entry.tiebreak.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Tabs.Content>

        <Tabs.Content value="games">
          <TournamentGamesList tournamentId={id!} currentRound={tournament.currentRound} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function TournamentGamesList({ tournamentId, currentRound }: { tournamentId: string; currentRound: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['tournament-games', tournamentId, currentRound],
    queryFn: () =>
      import('../lib/api').then((m) =>
        m.default.get(`/tournaments/${tournamentId}/games?round=${currentRound}`).then((r) => r.data),
      ),
    enabled: currentRound > 0,
  });

  if (isLoading) return <p className="text-gray-500 text-sm">Loading games…</p>;
  if (!data?.length) return <p className="text-gray-500 text-sm">No games in this round yet.</p>;

  return (
    <ul className="space-y-2">
      {data.map((g: any) => (
        <li key={g.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3">
          <span className="text-sm text-gray-700">
            {g.white?.username ?? g.whiteId} vs {g.black?.username ?? g.blackId ?? 'BYE'}
          </span>
          {g.gameId && (
            <Link
              to={`/game/${g.gameId}`}
              className="text-indigo-600 text-sm font-medium hover:underline"
            >
              Spectate
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

// Re-export useQuery for inline use inside TournamentGamesList
import { useQuery } from '@tanstack/react-query';
```

---

### Step 5: Routes

Add to `frontend/src/App.tsx`:

```tsx
import TournamentListPage   from './pages/TournamentListPage';
import TournamentDetailPage from './pages/TournamentDetailPage';

// Inside <Routes>:
<Route path="/tournaments"     element={<TournamentListPage />} />
<Route path="/tournaments/:id" element={<TournamentDetailPage />} />
```

---

### Error Handling

Map API error codes to user-facing messages in a shared helper
`frontend/src/lib/tournamentErrors.ts`:

```typescript
export function parseTournamentError(err: unknown): string {
  const msg: string = (err as any)?.response?.data?.message ?? '';
  if (msg.includes('full'))           return 'This tournament is full.';
  if (msg.includes('already joined')) return 'You have already joined this tournament.';
  if (msg.includes('not accepting'))  return 'This tournament is no longer accepting registrations.';
  if (msg.includes('2 players'))      return 'At least 2 players must join before starting.';
  return 'Something went wrong. Please try again.';
}
```

Use `parseTournamentError` in the `onError` callbacks of `useJoinTournament` and
`useStartTournament` to display a toast.

---

### Verification

1. Navigate to `/tournaments` — list renders with status badges.
2. Click "Create Tournament" — modal opens, submit creates a tournament, list refreshes.
3. Click a tournament → `/tournaments/:id` — Overview tab shows details.
4. Click "Join Tournament" — button disables, currentPlayers increments (refresh).
5. Click "Start (Organizer)" — status changes to ACTIVE, Standings tab populates.
6. When `tournamentRoundStarted` Socket.io event arrives, standings auto-refresh.
7. Spectate link in Games tab navigates to `/game/:gameId`.

## END PROMPT
