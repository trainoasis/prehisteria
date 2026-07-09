// Local high-score table. Kept behind an async interface so a server-backed
// leaderboard (e.g. a Vercel function + DB) can slot in later without touching
// game code: just make load()/submit() hit the network and fall back here.

export interface Score { name: string; score: number; }

const KEY = 'prehisteria-scores';
const MAX = 10;

function read(): Score[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s) => s && typeof s.name === 'string' && typeof s.score === 'number')
      .map((s) => ({ name: String(s.name).slice(0, 8), score: Math.floor(s.score) }));
  } catch {
    return [];
  }
}

function write(list: Score[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

export async function load(): Promise<Score[]> {
  return read().sort((a, b) => b.score - a.score).slice(0, MAX);
}

// Insert a score, persist, and return the updated top-10.
export async function submit(name: string, score: number): Promise<Score[]> {
  const clean = (name.trim() || 'BRKO').toUpperCase().slice(0, 8);
  const list = read();
  list.push({ name: clean, score: Math.floor(score) });
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, MAX);
  write(top);
  return top;
}

// Would this score make the table? Used to decide whether to prompt for a name.
export async function qualifies(score: number): Promise<boolean> {
  if (score <= 0) return false;
  const list = await load();
  return list.length < MAX || score > list[list.length - 1].score;
}
