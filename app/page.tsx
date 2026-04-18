import { supabase } from "@/lib/supabase";
import Link from "next/link";

export const revalidate = 30; // Revalidate every 30 seconds

interface Bulletin {
  id: string;
  city_key: string;
  city_name: string;
  race_date: string;
  races: {
    id: string;
    race_no: number;
    race_name: string;
    race_time: string;
    has_altili: boolean;
    altili_no: number | null;
    horses: { id: string }[];
  }[];
}

async function getTodayData() {
  const today = new Date().toISOString().split("T")[0];

  const { data: bulletins } = await supabase
    .from("bulletins")
    .select(`
      id, city_key, city_name, race_date,
      races (
        id, race_no, race_name, race_time, has_altili, altili_no,
        horses ( id )
      )
    `)
    .eq("race_date", today)
    .order("city_key");

  return (bulletins as unknown as Bulletin[]) || [];
}

function formatTime(time: string) {
  return time.substring(0, 5);
}

export default async function HomePage() {
  const bulletins = await getTodayData();
  const today = new Date();
  const dateStr = today.toLocaleDateString("tr-TR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const totalRaces = bulletins.reduce((sum, b) => sum + (b.races?.length || 0), 0);
  const totalHorses = bulletins.reduce(
    (sum, b) => sum + (b.races?.reduce((s, r) => s + (r.horses?.length || 0), 0) || 0),
    0
  );
  const altiliCount = bulletins.reduce(
    (sum, b) => sum + (b.races?.filter((r) => r.has_altili).length || 0),
    0
  );

  return (
    <main className="container">
      {/* Hero */}
      <section className="hero">
        <p style={{ color: "var(--text-muted)", marginBottom: 4, fontSize: "0.85rem" }}>
          {dateStr}
        </p>
        <h1>Yarış Analiz Paneli</h1>
        <p>TJK at yarışları için canlı AGF ve ganyan takibi</p>

        {/* Stats */}
        <div style={{ display: "flex", gap: 48, marginTop: 32 }}>
          <div className="stat-box">
            <span className="stat-value">{bulletins.length}</span>
            <span className="stat-label">Aktif Bülten</span>
          </div>
          <div className="stat-box">
            <span className="stat-value">{totalRaces}</span>
            <span className="stat-label">Koşu</span>
          </div>
          <div className="stat-box">
            <span className="stat-value">{totalHorses}</span>
            <span className="stat-label">At</span>
          </div>
          <div className="stat-box">
            <span className="stat-value">{altiliCount}</span>
            <span className="stat-label">Altılı Ganyan</span>
          </div>
        </div>
      </section>

      {/* Bulletins */}
      {bulletins.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <p style={{ fontSize: "3rem", marginBottom: 16 }}>🏇</p>
          <h2 style={{ marginBottom: 8 }}>Henüz veri yok</h2>
          <p style={{ color: "var(--text-secondary)" }}>
            Bugünün yarış programı henüz yüklenmedi. Takvim 08:45&apos;te otomatik oluşturulacak.
          </p>
        </div>
      ) : (
        <div className="grid-3">
          {bulletins.map((bulletin) => (
            <Link
              key={bulletin.id}
              href={`/bulletin/${bulletin.city_key}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className="card" style={{ cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 16 }}>
                  <div>
                    <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>
                      {bulletin.city_name}
                    </h2>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                      {bulletin.city_key}
                    </p>
                  </div>
                  <div className="pulse" />
                </div>

                <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
                  <div>
                    <span className="mono" style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                      {bulletin.races?.length || 0}
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginLeft: 6 }}>koşu</span>
                  </div>
                  <div>
                    <span className="mono" style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                      {bulletin.races?.reduce((s, r) => s + (r.horses?.length || 0), 0) || 0}
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginLeft: 6 }}>at</span>
                  </div>
                </div>

                {/* Race times preview */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {bulletin.races
                    ?.sort((a, b) => a.race_no - b.race_no)
                    .map((race) => (
                      <span
                        key={race.id}
                        className={`badge ${race.has_altili ? "badge-gold" : "badge-blue"}`}
                      >
                        {race.race_no}. {formatTime(race.race_time)}
                        {race.has_altili && " 🎯"}
                      </span>
                    ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
