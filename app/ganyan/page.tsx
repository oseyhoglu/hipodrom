import { supabase } from "@/lib/supabase";
import Link from "next/link";

export const revalidate = 30;

interface ReadingData {
  read_time: string;
  ganyan: number | null;
  agf1: number | null;
  agf1_rank: number | null;
  agf2: number | null;
  agf2_rank: number | null;
}

interface HorseData {
  horse_no: number;
  horse_name: string;
  readings: ReadingData[];
}

interface RaceData {
  id: string;
  race_no: number;
  race_name: string;
  race_time: string;
  bulletin: { city_key: string; city_name: string };
  horses: HorseData[];
}

async function getGanyanData() {
  const today = new Date().toISOString().split("T")[0];

  const { data: bulletins } = await supabase
    .from("bulletins")
    .select("id, city_key, city_name")
    .eq("race_date", today);

  if (!bulletins || bulletins.length === 0) return [];

  const allRaces: RaceData[] = [];

  for (const bulletin of bulletins) {
    const { data: races } = await supabase
      .from("races")
      .select(`
        id, race_no, race_name, race_time,
        horses (
          horse_no, horse_name,
          readings ( read_time, ganyan, agf1, agf1_rank, agf2, agf2_rank )
        )
      `)
      .eq("bulletin_id", bulletin.id)
      .order("race_no");

    if (races) {
      for (const race of races) {
        allRaces.push({
          ...race,
          bulletin: { city_key: bulletin.city_key, city_name: bulletin.city_name },
          horses: race.horses as unknown as HorseData[],
        });
      }
    }
  }

  // Sort by time
  allRaces.sort((a, b) => a.race_time.localeCompare(b.race_time));

  // Filter to future races only
  const now = new Date();
  const nowTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

  return allRaces.filter((r) => r.race_time.substring(0, 5) >= nowTime);
}

export default async function GanyanPage() {
  const races = await getGanyanData();

  return (
    <main className="container">
      <div style={{ marginBottom: 32 }}>
        <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.85rem" }}>
          ← Ana Sayfa
        </Link>
        <h1 style={{ fontSize: "2rem", fontWeight: 800, marginTop: 8 }}>
          Ganyan Değişim Raporu
        </h1>
        <p style={{ color: "var(--text-secondary)" }}>
          Gelecek koşular için ganyan ve AGF değişimleri
        </p>
      </div>

      {races.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48 }}>
          <p style={{ fontSize: "2rem", marginBottom: 12 }}>📊</p>
          <h3>Raporlanacak koşu bulunamadı</h3>
          <p style={{ color: "var(--text-secondary)" }}>
            Henüz gelecek koşu yok veya veri yüklenmedi.
          </p>
        </div>
      ) : (
        races.map((race) => {
          const sortedHorses = race.horses?.sort((a, b) => a.horse_no - b.horse_no) || [];

          return (
            <div key={race.id} className="race-card" style={{ marginBottom: 20 }}>
              <div className="race-card-header">
                <h3>
                  {race.bulletin.city_name} — {race.race_name} ({race.race_time.substring(0, 5)})
                </h3>
                <Link href={`/race/${race.id}`} className="badge badge-blue" style={{ textDecoration: "none" }}>
                  Detay →
                </Link>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>No</th>
                      <th>At Adı</th>
                      <th>Ganyan (İlk→Son)</th>
                      <th>Ganyan Fark</th>
                      <th>AGF (İlk→Son)</th>
                      <th>AGF Fark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHorses.map((horse) => {
                      const sorted = (horse.readings || []).sort(
                        (a, b) => new Date(a.read_time).getTime() - new Date(b.read_time).getTime()
                      );
                      const ganyanReadings = sorted.filter((r) => r.ganyan != null);
                      const agfReadings = sorted.filter((r) => r.agf1 != null);

                      const firstGanyan = ganyanReadings[0]?.ganyan;
                      const lastGanyan = ganyanReadings[ganyanReadings.length - 1]?.ganyan;
                      // Reverse logic: oran düşerse pozitif (at daha çok oynanıyor)
                      const ganyanDiff = firstGanyan != null && lastGanyan != null ? firstGanyan - lastGanyan : null;

                      const firstAgf = agfReadings[0]?.agf1;
                      const lastAgf = agfReadings[agfReadings.length - 1]?.agf1;
                      const agfDiff = firstAgf != null && lastAgf != null ? lastAgf - firstAgf : null;

                      return (
                        <tr key={horse.horse_no}>
                          <td className="mono" style={{ fontWeight: 700 }}>{horse.horse_no}</td>
                          <td style={{ fontWeight: 600 }}>{horse.horse_name}</td>
                          <td className="mono">
                            {firstGanyan != null && lastGanyan != null
                              ? `${firstGanyan.toFixed(2)} → ${lastGanyan.toFixed(2)}`
                              : "—"}
                          </td>
                          <td>
                            {ganyanDiff != null ? (
                              <span className={`mono ${ganyanDiff > 0 ? "value-up" : ganyanDiff < 0 ? "value-down" : "value-neutral"}`} style={{ fontWeight: 600 }}>
                                ({ganyanDiff > 0 ? "+" : ""}{ganyanDiff.toFixed(2)})
                              </span>
                            ) : (
                              <span className="value-neutral">—</span>
                            )}
                          </td>
                          <td className="mono">
                            {firstAgf != null && lastAgf != null
                              ? `${firstAgf.toFixed(2)}% → ${lastAgf.toFixed(2)}%`
                              : "—"}
                          </td>
                          <td>
                            {agfDiff != null ? (
                              <span className={`mono ${agfDiff > 0 ? "value-up" : agfDiff < 0 ? "value-down" : "value-neutral"}`} style={{ fontWeight: 600 }}>
                                ({agfDiff > 0 ? "+" : ""}{agfDiff.toFixed(2)}%)
                              </span>
                            ) : (
                              <span className="value-neutral">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </main>
  );
}
