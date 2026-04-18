import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 30;

interface Horse {
  id: string;
  horse_no: number;
  horse_name: string;
  jockey_name: string;
  last_6_races: string;
  readings: {
    id: string;
    read_time: string;
    ganyan: number | null;
    agf1: number | null;
    agf1_rank: number | null;
    agf2: number | null;
    agf2_rank: number | null;
  }[];
}

interface Race {
  id: string;
  race_no: number;
  race_name: string;
  race_time: string;
  race_type: string;
  has_altili: boolean;
  altili_no: number | null;
  horses: Horse[];
}

interface Bulletin {
  id: string;
  city_key: string;
  city_name: string;
  race_date: string;
  races: Race[];
}

async function getBulletinData(cityKey: string) {
  const today = new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("bulletins")
    .select(`
      id, city_key, city_name, race_date,
      races (
        id, race_no, race_name, race_time, race_type, has_altili, altili_no,
        horses (
          id, horse_no, horse_name, jockey_name, last_6_races,
          readings (
            id, read_time, ganyan, agf1, agf1_rank, agf2, agf2_rank
          )
        )
      )
    `)
    .eq("race_date", today)
    .eq("city_key", cityKey.toUpperCase())
    .single();

  return data as unknown as Bulletin | null;
}

function getLastReading(readings: Horse["readings"]) {
  if (!readings || readings.length === 0) return null;
  return readings.sort((a, b) => new Date(b.read_time).getTime() - new Date(a.read_time).getTime())[0];
}

function getFirstReading(readings: Horse["readings"]) {
  if (!readings || readings.length === 0) return null;
  return readings.sort((a, b) => new Date(a.read_time).getTime() - new Date(b.read_time).getTime())[0];
}

function ChangeIndicator({ first, last }: { first: number | null; last: number | null }) {
  if (first === null || last === null) return <span className="value-neutral">—</span>;
  const diff = last - first;
  if (Math.abs(diff) < 0.01) return <span className="value-neutral mono">0.00</span>;
  return (
    <span className={diff > 0 ? "value-up" : "value-down"}>
      <span className="mono">{diff > 0 ? "+" : ""}{diff.toFixed(2)}</span>
    </span>
  );
}

export default async function BulletinPage({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  const bulletin = await getBulletinData(city);

  if (!bulletin) return notFound();

  const sortedRaces = bulletin.races
    ?.sort((a, b) => a.race_no - b.race_no) || [];

  return (
    <main className="container">
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.85rem" }}>
          ← Ana Sayfa
        </Link>
        <h1 style={{ fontSize: "2rem", fontWeight: 800, marginTop: 8 }}>
          {bulletin.city_name}
        </h1>
        <p style={{ color: "var(--text-secondary)" }}>
          {bulletin.race_date} • {sortedRaces.length} koşu
        </p>
      </div>

      {/* Race Cards */}
      {sortedRaces.map((race) => {
        const sortedHorses = race.horses
          ?.sort((a, b) => a.horse_no - b.horse_no) || [];

        return (
          <div key={race.id} className="race-card" style={{ marginBottom: 20 }}>
            <div className="race-card-header">
              <div>
                <h3>
                  {race.race_name} — {race.race_time.substring(0, 5)}
                  {race.has_altili && (
                    <span className="badge badge-gold" style={{ marginLeft: 12 }}>
                      {race.altili_no}. Altılı 🎯
                    </span>
                  )}
                </h3>
                {race.race_type && (
                  <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: 4 }}>
                    {race.race_type}
                  </p>
                )}
              </div>
              <Link
                href={`/race/${race.id}`}
                className="badge badge-blue"
                style={{ textDecoration: "none" }}
              >
                Grafik →
              </Link>
            </div>
            <div className="race-card-body" style={{ padding: 0, overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>At</th>
                    <th>Jokey</th>
                    <th>Son 6</th>
                    <th>Ganyan</th>
                    <th>AGF1 %</th>
                    <th>AGF1 Sıra</th>
                    {sortedHorses.some((h) => getLastReading(h.readings)?.agf2 !== null && getLastReading(h.readings)?.agf2 !== undefined) && (
                      <>
                        <th>AGF2 %</th>
                        <th>AGF2 Sıra</th>
                      </>
                    )}
                    <th>AGF Değişim</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHorses.map((horse) => {
                    const lastReading = getLastReading(horse.readings);
                    const firstReading = getFirstReading(horse.readings);
                    const hasAgf2 = lastReading?.agf2 !== null && lastReading?.agf2 !== undefined;

                    return (
                      <tr key={horse.id}>
                        <td>
                          <span className="mono" style={{ fontWeight: 700 }}>
                            {horse.horse_no}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{horse.horse_name}</td>
                        <td style={{ color: "var(--text-secondary)" }}>{horse.jockey_name}</td>
                        <td className="mono" style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                          {horse.last_6_races || "—"}
                        </td>
                        <td className="mono" style={{ fontWeight: 600, color: "var(--gold)" }}>
                          {lastReading?.ganyan?.toFixed(2) || "—"}
                        </td>
                        <td className="mono" style={{ fontWeight: 600 }}>
                          {lastReading?.agf1 != null ? `${lastReading.agf1.toFixed(2)}%` : "—"}
                        </td>
                        <td>
                          {lastReading?.agf1_rank != null && (
                            <span className="badge badge-blue">{lastReading.agf1_rank}</span>
                          )}
                        </td>
                        {sortedHorses.some((h) => getLastReading(h.readings)?.agf2 !== null && getLastReading(h.readings)?.agf2 !== undefined) && (
                          <>
                            <td className="mono" style={{ fontWeight: 600 }}>
                              {hasAgf2 ? `${lastReading?.agf2?.toFixed(2)}%` : "—"}
                            </td>
                            <td>
                              {hasAgf2 && lastReading?.agf2_rank != null && (
                                <span className="badge badge-blue">{lastReading.agf2_rank}</span>
                              )}
                            </td>
                          </>
                        )}
                        <td>
                          <ChangeIndicator
                            first={firstReading?.agf1 ?? null}
                            last={lastReading?.agf1 ?? null}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </main>
  );
}
