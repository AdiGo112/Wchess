interface PlayerCardProps {
  player: { username: string; name?: string; rating?: number | null };
  rank: number;
}

export default function PlayerCard({ player, rank }: PlayerCardProps) {
  return (
    <div className="card-b-flat flex items-center justify-between hover:shadow-brutal transition-shadow">
      <div className="min-w-0">
        <h2 className="font-bold uppercase tracking-wider truncate">
          <span className="font-display mr-2">#{rank}</span>
          {player.username}
        </h2>
        {player.name && (
          <p className="text-xs font-mono text-neutral-500 truncate">{player.name}</p>
        )}
      </div>
      <span className="font-mono font-bold whitespace-nowrap">
        {player.rating ?? "—"}
      </span>
    </div>
  );
}
