"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface ReadingPoint {
  time: string;
  [horseName: string]: string | number | null;
}

interface HorseData {
  horseName: string;
  horseNo: number;
  readings: { time: string; agf: number | null }[];
}

const COLORS = [
  "#448aff", "#ff5252", "#00e676", "#ffd740", "#b388ff",
  "#18ffff", "#ff6e40", "#69f0ae", "#ea80fc", "#ffff00",
  "#40c4ff", "#ff4081", "#00e5ff", "#76ff03", "#e040fb",
];

export default function AgfChart({
  horses,
  title,
  agfKey,
}: {
  horses: HorseData[];
  title: string;
  agfKey: string;
}) {
  if (!horses || horses.length === 0) {
    return (
      <div className="chart-container" style={{ textAlign: "center", padding: 48 }}>
        <p style={{ color: "var(--text-muted)" }}>Grafik için yeterli veri yok</p>
      </div>
    );
  }

  // Build unified timeline
  const allTimes = new Set<string>();
  horses.forEach((h) => h.readings.forEach((r) => allTimes.add(r.time)));
  const sortedTimes = Array.from(allTimes).sort();

  const chartData: ReadingPoint[] = sortedTimes.map((time) => {
    const point: ReadingPoint = { time };
    horses.forEach((h) => {
      const reading = h.readings.find((r) => r.time === time);
      point[`#${h.horseNo} ${h.horseName}`] = reading?.agf ?? null;
    });
    return point;
  });

  return (
    <div className="chart-container">
      <h3 style={{ marginBottom: 16, fontWeight: 700 }}>{title} — {agfKey.toUpperCase()} Değişim Grafiği</h3>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,42,74,0.5)" />
          <XAxis
            dataKey="time"
            stroke="#6868a8"
            fontSize={12}
            tick={{ fill: "#9898b8" }}
          />
          <YAxis
            stroke="#6868a8"
            fontSize={12}
            tick={{ fill: "#9898b8" }}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              background: "#1a1a2e",
              border: "1px solid #2a2a4a",
              borderRadius: 8,
              color: "#e8e8f0",
              fontSize: 12,
            }}
            formatter={(value) => {
              const num = typeof value === 'number' ? value : 0;
              return [`${num.toFixed(2)}%`, ""];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "#9898b8" }}
            iconType="circle"
          />
          {horses.map((h, i) => (
            <Line
              key={h.horseNo}
              type="monotone"
              dataKey={`#${h.horseNo} ${h.horseName}`}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
