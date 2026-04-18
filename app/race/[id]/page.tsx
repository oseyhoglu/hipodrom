import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";
import Link from "next/link";
import AgfChart from "@/components/AgfChart";

export const revalidate = 30;

async function getRaceData(raceId: string) {
  const { data } = await supabase
    .from("races")
    .select(`
      id, race_no, race_name, race_time, race_type, has_altili, altili_no,
      bulletin:bulletins ( id, city_key, city_name, race_date ),
      horses (
        id, horse_no, horse_name, jockey_name, last_6_races,
        readings (
          id, read_time, ganyan, sabit_ganyan, agf1, agf1_rank, agf2, agf2_rank
        )
      )
    `)
    .eq("id", raceId)
    .single();

  return data;
}

function formatReadTime(iso: string) {
  const d = new Date(iso);
  // UTC+3 (Türkiye saati) — sunucu UTC'de çalışır, offset elle eklenir
  const utcMinutes = d.getUTCHours() * 60 + d.getUTCMinutes() + 3 * 60;
  const trHours = Math.floor((utcMinutes % (24 * 60)) / 60);
  const trMinutes = utcMinutes % 60;
  return `${trHours.toString().padStart(2, "0")}:${trMinutes.toString().padStart(2, "0")}`;
}

export default async function RacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const race = await getRaceData(id);
  if (!race) return notFound();

  const bulletin = race.bulletin as unknown as { id: string; city_key: string; city_name: string; race_date: string } | null;
  const horses = (race.horses || []).sort((a: { horse_no: number }, b: { horse_no: number }) => a.horse_no - b.horse_no);

  // Prepare chart data for AGF1
  const agf1ChartHorses = horses
    .filter((h: { readings: { agf1: number | null }[] }) => h.readings?.some((r: { agf1: number | null }) => r.agf1 != null))
    .map((h: { horse_no: number; horse_name: string; readings: { read_time: string; agf1: number | null }[] }) => ({
      horseName: h.horse_name,
      horseNo: h.horse_no,
      readings: h.readings
        .filter((r: { agf1: number | null }) => r.agf1 != null)
        .sort((a: { read_time: string }, b: { read_time: string }) => new Date(a.read_time).getTime() - new Date(b.read_time).getTime())
        .map((r: { read_time: string; agf1: number | null }) => ({
          time: formatReadTime(r.read_time),
          agf: r.agf1,
        })),
    }));

  // Prepare chart data for AGF2
  const agf2ChartHorses = horses
    .filter((h: { readings: { agf2: number | null }[] }) => h.readings?.some((r: { agf2: number | null }) => r.agf2 != null))
    .map((h: { horse_no: number; horse_name: string; readings: { read_time: string; agf2: number | null }[] }) => ({
      horseName: h.horse_name,
      horseNo: h.horse_no,
      readings: h.readings
        .filter((r: { agf2: number | null }) => r.agf2 != null)
        .sort((a: { read_time: string }, b: { read_time: string }) => new Date(a.read_time).getTime() - new Date(b.read_time).getTime())
        .map((r: { read_time: string; agf2: number | null }) => ({
          time: formatReadTime(r.read_time),
          agf: r.agf2,
        })),
    }));

  // Analysis per horse
  interface ReadingData {
    read_time: string;
    ganyan: number | null;
    sabit_ganyan: number | null;
    agf1: number | null;
    agf1_rank: number | null;
  }

  interface HorseWithReadings {
    horse_no: number;
    horse_name: string;
    jockey_name: string;
    last_6_races: string;
    readings: ReadingData[];
  }

  const analysisData = horses.map((h: HorseWithReadings) => {
    const sorted = (h.readings || []).sort(
      (a: ReadingData, b: ReadingData) => new Date(a.read_time).getTime() - new Date(b.read_time).getTime()
    );
    const agfReadings = sorted.filter((r: ReadingData) => r.agf1 != null);
    const first = agfReadings[0];
    const last = agfReadings[agfReadings.length - 1];
    const totalChange = first && last ? (last.agf1! - first.agf1!) : 0;

    // Last 30 min
    const now = last ? new Date(last.read_time) : new Date();
    const thirtyAgo = new Date(now.getTime() - 30 * 60000);
    const fiveAgo = new Date(now.getTime() - 5 * 60000);
    const r30 = agfReadings.filter((r: ReadingData) => new Date(r.read_time) >= thirtyAgo);
    const r5 = agfReadings.filter((r: ReadingData) => new Date(r.read_time) >= fiveAgo);
    const change30 = r30.length > 0 && last ? last.agf1! - r30[0].agf1! : 0;
    const change5 = r5.length > 0 && last ? last.agf1! - r5[0].agf1! : 0;

    return {
      horseNo: h.horse_no,
      horseName: h.horse_name,
      jockey: h.jockey_name,
      last6: h.last_6_races,
      ganyan: last?.ganyan,
      firstAgf: first?.agf1,
      lastAgf: last?.agf1,
      lastRank: last?.agf1_rank,
      totalChange,
      change30,
      change5,
      readingsCount: agfReadings.length,
    };
  });

  return (
    <main className="container">
      {/* Breadcrumb */}
      <div style={{ marginBottom: 24 }}>
        <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.85rem" }}>
          Ana Sayfa
        </Link>
        <span style={{ color: "var(--text-muted)", margin: "0 8px" }}>→</span>
        {bulletin && (
          <Link
            href={`/bulletin/${bulletin.city_key}`}
            style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "0.85rem" }}
          >
            {bulletin.city_name}
          </Link>
        )}
        <span style={{ color: "var(--text-muted)", margin: "0 8px" }}>→</span>
        <span style={{ color: "var(--text-primary)", fontSize: "0.85rem" }}>{race.race_name}</span>
      </div>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 800 }}>
          {bulletin?.city_name} — {race.race_name}
          {race.has_altili && (
            <span className="badge badge-gold" style={{ marginLeft: 12, fontSize: "0.8rem" }}>
              {race.altili_no}. Altılı
            </span>
          )}
        </h1>
        <p style={{ color: "var(--text-secondary)" }}>
          Saat: {race.race_time?.substring(0, 5)} • {race.race_type}
        </p>
      </div>

      {/* Charts */}
      {agf1ChartHorses.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <AgfChart
            horses={agf1ChartHorses}
            title={`${bulletin?.city_name} ${race.race_name}`}
            agfKey="agf1"
          />
        </div>
      )}

      {agf2ChartHorses.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <AgfChart
            horses={agf2ChartHorses}
            title={`${bulletin?.city_name} ${race.race_name}`}
            agfKey="agf2"
          />
        </div>
      )}

      {/* Analysis Table */}
      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ fontWeight: 700 }}>AGF Analiz Tablosu</h3>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              <th>No</th>
              <th>At</th>
              <th>Jokey</th>
              <th>Ganyan</th>
              <th>AGF (İlk→Son)</th>
              <th>Sıra</th>
              <th>Toplam Değişim</th>
              <th>Son 30dk</th>
              <th>Son 5dk</th>
            </tr>
          </thead>
          <tbody>
            {analysisData.map((a: {
              horseNo: number;
              horseName: string;
              jockey: string;
              ganyan?: number | null;
              firstAgf?: number | null;
              lastAgf?: number | null;
              lastRank?: number | null;
              totalChange: number;
              change30: number;
              change5: number;
            }) => (
              <tr key={a.horseNo}>
                <td>
                  {a.change5 > 0 ? (
                    <span style={{ color: "var(--green)", fontWeight: 700 }}>✓</span>
                  ) : a.change5 < 0 ? (
                    <span style={{ color: "var(--red)", fontWeight: 700 }}>✗</span>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>—</span>
                  )}
                </td>
                <td className="mono" style={{ fontWeight: 700 }}>{a.horseNo}</td>
                <td style={{ fontWeight: 600 }}>{a.horseName}</td>
                <td style={{ color: "var(--text-secondary)" }}>{a.jockey}</td>
                <td className="mono" style={{ color: "var(--gold)", fontWeight: 600 }}>
                  {a.ganyan?.toFixed(2) || "—"}
                </td>
                <td className="mono">
                  {a.firstAgf != null && a.lastAgf != null
                    ? `${a.firstAgf.toFixed(2)}% → ${a.lastAgf.toFixed(2)}%`
                    : "—"}
                </td>
                <td>
                  {a.lastRank != null && (
                    <span className="badge badge-blue">{a.lastRank}</span>
                  )}
                </td>
                <td className={`mono ${a.totalChange > 0 ? "value-up" : a.totalChange < 0 ? "value-down" : "value-neutral"}`}>
                  {a.totalChange !== 0 ? `${a.totalChange > 0 ? "+" : ""}${a.totalChange.toFixed(2)}` : "0.00"}
                </td>
                <td className={`mono ${a.change30 > 0 ? "value-up" : a.change30 < 0 ? "value-down" : "value-neutral"}`}>
                  {a.change30 !== 0 ? `${a.change30 > 0 ? "+" : ""}${a.change30.toFixed(2)}` : "0.00"}
                </td>
                <td className={`mono ${a.change5 > 0 ? "value-up" : a.change5 < 0 ? "value-down" : "value-neutral"}`} style={{ fontWeight: 700 }}>
                  {a.change5 !== 0 ? `${a.change5 > 0 ? "+" : ""}${a.change5.toFixed(2)}` : "0.00"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
