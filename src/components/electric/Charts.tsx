"use client";

import { Empty } from "antd";

const palette = ["#faad14", "#1677ff", "#52c41a", "#f5222d", "#722ed1", "#13c2c2", "#eb2f96", "#a0d911"];

function NoData({ text = "Chưa có dữ liệu" }: { text?: string }) {
  return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={text} style={{ padding: "24px 0" }} />;
}

export function TrendLineChart({
  data,
  height = 240,
  metric = "cons",
}: {
  data: { label: string; consTotal: number; costTotal: number }[];
  height?: number;
  metric?: "cons" | "cost";
}) {
  if (data.length < 2) return <NoData text="Cần ít nhất 2 ngày có dữ liệu để vẽ xu hướng" />;

  const isCost = metric === "cost";
  const baseColor = isCost ? "#1677ff" : "#faad14";
  // Chấm tô theo hướng so với ngày liền trước: đỏ = tăng, xanh = giảm (giống EVN nhìn hóa đơn).
  const UP = "#f5222d";
  const DOWN = "#52c41a";

  const valueOf = (d: { consTotal: number; costTotal: number }) =>
    isCost ? d.costTotal : d.consTotal;
  const fmtValue = (v: number) =>
    isCost
      ? v.toLocaleString("vi-VN", { maximumFractionDigits: 0 }) + " đ"
      : v.toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + " kWh";
  const fmtTick = (v: number) =>
    isCost && v >= 1_000_000
      ? (v / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + " tr"
      : Math.round(v).toLocaleString("vi-VN");

  const width = 900;
  const padding = { top: 16, right: 16, bottom: 28, left: isCost ? 60 : 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const values = data.map(valueOf);
  const max = Math.max(...values, 1);
  const min = 0;

  const x = (i: number) => padding.left + (i / (data.length - 1)) * innerW;
  const y = (v: number) => padding.top + innerH - ((v - min) / (max - min || 1)) * innerH;

  const linePoints = data.map((d, i) => `${x(i).toFixed(1)},${y(valueOf(d)).toFixed(1)}`);
  const areaPoints = `${x(0)},${y(0)} ${linePoints.join(" ")} ${x(data.length - 1)},${y(0)}`;

  const ticks = 4;
  const tickValues = Array.from({ length: ticks + 1 }, (_, i) => (max / ticks) * i);

  const labelStep = Math.max(1, Math.ceil(data.length / 10));

  const dotColor = (i: number) => {
    if (i === 0) return baseColor;
    const cur = valueOf(data[i]);
    const prev = valueOf(data[i - 1]);
    if (cur > prev) return UP;
    if (cur < prev) return DOWN;
    return baseColor;
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
      {tickValues.map((tv, i) => (
        <g key={i}>
          <line x1={padding.left} x2={width - padding.right} y1={y(tv)} y2={y(tv)} stroke="#f0f0f0" strokeWidth={1} />
          <text x={padding.left - 8} y={y(tv) + 4} textAnchor="end" fontSize={11} fill="#8c8c8c">
            {fmtTick(tv)}
          </text>
        </g>
      ))}
      <polygon points={areaPoints} fill={baseColor} opacity={0.1} />
      <polyline points={linePoints.join(" ")} fill="none" stroke={baseColor} strokeWidth={2.5} />
      {data.map((d, i) => {
        const cur = valueOf(d);
        const prev = i > 0 ? valueOf(data[i - 1]) : null;
        const delta = prev == null ? null : cur - prev;
        return (
          <circle key={i} cx={x(i)} cy={y(cur)} r={4} fill={dotColor(i)} stroke="#fff" strokeWidth={1.5}>
            <title>
              {`${d.label}: ${fmtValue(cur)}` +
                (delta == null
                  ? ""
                  : ` (${delta >= 0 ? "▲" : "▼"} ${fmtValue(Math.abs(delta))} so ngày trước)`)}
            </title>
          </circle>
        );
      })}
      {data.map((d, i) =>
        i % labelStep === 0 || i === data.length - 1 ? (
          <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fontSize={11} fill="#8c8c8c">
            {d.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export function RankedBarChart({
  data,
  height,
  unit = "kWh",
}: {
  data: { label: string; value: number; sub?: string }[];
  height?: number;
  unit?: string;
}) {
  if (data.length === 0) return <NoData />;

  const rowHeight = 32;
  const chartHeight = height || data.length * rowHeight + 16;
  const max = Math.max(...data.map((d) => d.value), 1);
  const width = 700;
  const labelWidth = 160;
  const barAreaWidth = width - labelWidth - 90;

  return (
    <svg viewBox={`0 0 ${width} ${chartHeight}`} width="100%" height={chartHeight}>
      {data.map((d, i) => {
        const barWidth = (d.value / max) * barAreaWidth;
        const yPos = 8 + i * rowHeight;
        return (
          <g key={i}>
            <text x={labelWidth - 10} y={yPos + 16} textAnchor="end" fontSize={12} fill="#262626" fontWeight={500}>
              {d.label.length > 22 ? d.label.slice(0, 21) + "…" : d.label}
            </text>
            <rect x={labelWidth} y={yPos + 4} width={barAreaWidth} height={16} fill="#f5f5f5" rx={4} />
            <rect x={labelWidth} y={yPos + 4} width={Math.max(barWidth, 2)} height={16} fill={palette[i % palette.length]} rx={4} />
            <text x={labelWidth + barAreaWidth + 8} y={yPos + 16} fontSize={12} fill="#595959">
              {d.value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} {unit}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function DonutChart({
  data,
  height = 220,
}: {
  data: { label: string; value: number; color: string }[];
  height?: number;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total <= 0) return <NoData />;

  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const r = 78;
  const strokeWidth = 28;
  const circumference = 2 * Math.PI * r;

  const segments = data
    .filter((d) => d.value > 0)
    .map((d) => ({ ...d, fraction: d.value / total, length: (d.value / total) * circumference }))
    .reduce<Array<{ label: string; value: number; color: string; fraction: number; length: number; offset: number }>>(
      (acc, seg) => {
        const offset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].length : 0;
        acc.push({ ...seg, offset });
        return acc;
      },
      [],
    );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={height}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f5f5f5" strokeWidth={strokeWidth} />
        {segments.map((seg, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${seg.length} ${circumference - seg.length}`}
            strokeDashoffset={-seg.offset}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={20} fontWeight={700} fill="#262626">
          {total.toLocaleString("vi-VN", { maximumFractionDigits: 0 })}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize={11} fill="#8c8c8c">
          kWh
        </text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color, display: "inline-block" }} />
            <span style={{ color: "#595959" }}>{d.label}</span>
            <span style={{ fontWeight: 600 }}>
              {d.value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} kWh
              {total > 0 ? ` (${((d.value / total) * 100).toFixed(1)}%)` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MultiTrendChart({
  dates,
  series,
  kind = "line",
  height = 340,
}: {
  dates: string[];
  series: { meterCode: string; meterName: string; points: (number | null)[] }[];
  kind?: "line" | "column";
  height?: number;
}) {
  if (dates.length === 0 || series.length === 0)
    return <NoData text="Chọn đồng hồ để xem xu hướng tiêu thụ" />;

  const width = 960;
  const legendH = Math.ceil(series.length / 3) * 22 + 8;
  const padding = { top: 16, right: 16, bottom: 34 + legendH, left: 56 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const allVals = series.flatMap((s) =>
    s.points.filter((v): v is number => v != null),
  );
  const max = Math.max(...allVals, 1);
  const min = 0;

  const n = dates.length;
  const xBand = innerW / Math.max(n, 1);
  const xCenter = (i: number) => padding.left + xBand * (i + 0.5);
  const y = (v: number) =>
    padding.top + innerH - ((v - min) / (max - min || 1)) * innerH;

  const fmtLabel = (d: string) =>
    d.length === 10
      ? d.slice(8, 10) + "/" + d.slice(5, 7)
      : d.slice(5, 7) + "/" + d.slice(0, 4);
  const fmtVal = (v: number) =>
    v.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

  const ticks = 4;
  const tickValues = Array.from({ length: ticks + 1 }, (_, i) => (max / ticks) * i);
  const labelStep = Math.max(1, Math.ceil(n / 12));
  const color = (i: number) => palette[i % palette.length];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
      {tickValues.map((tv, i) => (
        <g key={i}>
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={y(tv)}
            y2={y(tv)}
            stroke="#f0f0f0"
            strokeWidth={1}
          />
          <text
            x={padding.left - 8}
            y={y(tv) + 4}
            textAnchor="end"
            fontSize={11}
            fill="#8c8c8c"
          >
            {Math.round(tv).toLocaleString("vi-VN")}
          </text>
        </g>
      ))}

      {kind === "column"
        ? series.map((s, si) => {
            const groupW = xBand * 0.7;
            const barW = groupW / series.length;
            return (
              <g key={si}>
                {s.points.map((v, i) =>
                  v == null ? null : (
                    <rect
                      key={i}
                      x={xCenter(i) - groupW / 2 + si * barW}
                      y={y(v)}
                      width={Math.max(barW - 1, 1)}
                      height={Math.max(y(0) - y(v), 0)}
                      fill={color(si)}
                      rx={1}
                    >
                      <title>{`${s.meterCode} • ${fmtLabel(dates[i])}: ${fmtVal(v)} kWh`}</title>
                    </rect>
                  ),
                )}
              </g>
            );
          })
        : series.map((s, si) => {
            const segs: string[] = [];
            let cur: string[] = [];
            s.points.forEach((v, i) => {
              if (v == null) {
                if (cur.length) {
                  segs.push(cur.join(" "));
                  cur = [];
                }
              } else {
                cur.push(`${xCenter(i).toFixed(1)},${y(v).toFixed(1)}`);
              }
            });
            if (cur.length) segs.push(cur.join(" "));
            return (
              <g key={si}>
                {segs.map((pts, k) => (
                  <polyline
                    key={k}
                    points={pts}
                    fill="none"
                    stroke={color(si)}
                    strokeWidth={2.5}
                  />
                ))}
                {s.points.map((v, i) =>
                  v == null ? null : (
                    <circle
                      key={i}
                      cx={xCenter(i)}
                      cy={y(v)}
                      r={3}
                      fill="#fff"
                      stroke={color(si)}
                      strokeWidth={2}
                    >
                      <title>{`${s.meterCode} • ${fmtLabel(dates[i])}: ${fmtVal(v)} kWh`}</title>
                    </circle>
                  ),
                )}
              </g>
            );
          })}

      {dates.map((d, i) =>
        i % labelStep === 0 || i === n - 1 ? (
          <text
            key={i}
            x={xCenter(i)}
            y={height - legendH - 10}
            textAnchor="middle"
            fontSize={11}
            fill="#8c8c8c"
          >
            {fmtLabel(d)}
          </text>
        ) : null,
      )}

      {series.map((s, si) => {
        const col = si % 3;
        const rowLg = Math.floor(si / 3);
        const lx = padding.left + col * (innerW / 3);
        const ly = height - legendH + 12 + rowLg * 22;
        const label = `${s.meterCode} — ${s.meterName}`;
        return (
          <g key={si}>
            <rect x={lx} y={ly - 9} width={11} height={11} rx={2} fill={color(si)} />
            <text x={lx + 17} y={ly} fontSize={12} fill="#595959">
              {label.length > 34 ? label.slice(0, 33) + "…" : label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
