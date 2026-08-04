"use client";

import { Empty } from "antd";

/**
 * Biểu đồ chuyên cho báo cáo PHỤ TẢI. Tách riêng khỏi Charts.tsx vì:
 *   - Trục thời gian là KHOẢNG 30 PHÚT (0..47) chứ không phải ngày/tháng
 *   - Đơn vị là kW (công suất) chứ không phải kWh (sản lượng)
 *   - Có khái niệm riêng: khoảng "không đủ điều kiện" (thiếu đồng hồ / thiếu phút)
 * Nhét chung vào Charts.tsx sẽ làm cả hai bên khó đọc.
 */

function NoData({ text = "Chưa có dữ liệu" }: { text?: string }) {
  return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={text} style={{ padding: "24px 0" }} />;
}

/** 0..47 -> "14:30" */
export function slotLabel(slot: number) {
  const h = Math.floor(slot / 2);
  const m = slot % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
}

/** Thang màu xanh -> vàng -> đỏ theo tỷ lệ 0..1 của phụ tải. */
function heatColor(ratio: number) {
  if (!Number.isFinite(ratio) || ratio <= 0) return "#f0f0f0";
  const stops: [number, [number, number, number]][] = [
    [0.0, [227, 242, 253]], // xanh nhạt
    [0.4, [102, 187, 106]], // xanh lá
    [0.7, [255, 193, 7]], // vàng
    [0.9, [255, 112, 67]], // cam
    [1.0, [211, 47, 47]], // đỏ
  ];
  const r = Math.max(0, Math.min(1, ratio));
  for (let i = 1; i < stops.length; i++) {
    if (r <= stops[i][0]) {
      const [p0, c0] = stops[i - 1];
      const [p1, c1] = stops[i];
      const t = (r - p0) / (p1 - p0 || 1);
      const mix = c0.map((c, k) => Math.round(c + (c1[k] - c) * t));
      return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
    }
  }
  return "rgb(211, 47, 47)";
}

// ============================================================
// HEATMAP NGÀY x KHOẢNG 30 PHÚT
// Trả lời trực tiếp câu hỏi cốt lõi: "ngày nào, giờ nào tải cao nhất".
// Mắt người nhận ra vệt màu theo cột (khung giờ lặp lại hằng ngày) nhanh hơn nhiều
// so với đọc một đường cong dài — đó là thứ cần để quyết định dịch chuyển phụ tải.
// ============================================================
export function LoadHeatmap({
  cells,
  dates,
  onSelectDay,
  selectedDate,
}: {
  cells: { date: string; slot: number; kw: number; eligible: boolean }[];
  dates: string[];
  onSelectDay?: (date: string) => void;
  selectedDate?: string;
}) {
  if (cells.length === 0 || dates.length === 0) return <NoData text="Chưa có dữ liệu phụ tải" />;

  const maxKw = Math.max(...cells.map((c) => c.kw), 1);
  const cellW = 15;
  const cellH = 16;
  const labelW = 78;
  const topH = 26;
  const width = labelW + 48 * cellW + 8;
  const height = topH + dates.length * cellH + 26;

  const map = new Map<string, { kw: number; eligible: boolean }>();
  for (const c of cells) map.set(`${c.date}|${c.slot}`, { kw: c.kw, eligible: c.eligible });

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={width} height={height} style={{ display: "block" }}>
        {/* Nhãn giờ: chỉ hiện mỗi 2 tiếng cho đỡ rối */}
        {Array.from({ length: 48 }, (_, s) => s)
          .filter((s) => s % 4 === 0)
          .map((s) => (
            <text
              key={`h${s}`}
              x={labelW + s * cellW}
              y={topH - 10}
              fontSize={10}
              fill="#8c8c8c"
              textAnchor="middle"
            >
              {slotLabel(s)}
            </text>
          ))}

        {dates.map((date, di) => (
          <g key={date}>
            <text
              x={labelW - 8}
              y={topH + di * cellH + cellH / 2 + 4}
              fontSize={11}
              fill={selectedDate === date ? "#1677ff" : "#595959"}
              fontWeight={selectedDate === date ? 700 : 400}
              textAnchor="end"
              style={{ cursor: onSelectDay ? "pointer" : "default" }}
              onClick={() => onSelectDay?.(date)}
            >
              {date.slice(5)}
            </text>
            {Array.from({ length: 48 }, (_, s) => {
              const v = map.get(`${date}|${s}`);
              const x = labelW + s * cellW;
              const y = topH + di * cellH;
              if (!v) {
                // Lỗ hổng dữ liệu: vẽ ô gạch chéo nhạt thay vì để trắng, để phân biệt rõ
                // "không có số" với "tải bằng 0".
                return (
                  <rect
                    key={s}
                    x={x}
                    y={y}
                    width={cellW - 1}
                    height={cellH - 1}
                    fill="#fafafa"
                    stroke="#f0f0f0"
                  />
                );
              }
              return (
                <rect
                  key={s}
                  x={x}
                  y={y}
                  width={cellW - 1}
                  height={cellH - 1}
                  fill={heatColor(v.kw / maxKw)}
                  opacity={v.eligible ? 1 : 0.45}
                  stroke={selectedDate === date ? "#1677ff" : "transparent"}
                  strokeWidth={selectedDate === date ? 0.5 : 0}
                >
                  <title>{`${date} ${slotLabel(s)}\n${v.kw.toLocaleString("vi-VN")} kW${v.eligible ? "" : "\n(thiếu đồng hồ - chỉ tham khảo)"}`}</title>
                </rect>
              );
            })}
          </g>
        ))}

        {/* Chú giải thang màu */}
        <g transform={`translate(${labelW}, ${topH + dates.length * cellH + 10})`}>
          {Array.from({ length: 40 }, (_, i) => (
            <rect key={i} x={i * 5} y={0} width={5} height={8} fill={heatColor(i / 39)} />
          ))}
          <text x={0} y={-2} fontSize={9} fill="#8c8c8c">
            0
          </text>
          <text x={200} y={-2} fontSize={9} fill="#8c8c8c" textAnchor="end">
            {Math.round(maxKw).toLocaleString("vi-VN")} kW
          </text>
        </g>
      </svg>
    </div>
  );
}

// ============================================================
// ĐƯỜNG CONG PHỤ TẢI MỘT NGÀY (48 khoảng 30 phút)
// Có đường ngưỡng đỉnh tháng để thấy ngay hôm nay còn cách đỉnh bao xa.
// ============================================================
export function DayLoadCurve({
  points,
  peakLine,
  height = 300,
}: {
  points: { slot: number; kw: number; eligible: boolean }[];
  peakLine?: number;
  height?: number;
}) {
  if (points.length === 0) return <NoData text="Chọn một ngày trên heatmap để xem đường cong chi tiết" />;

  const width = 960;
  const padding = { top: 24, right: 20, bottom: 34, left: 60 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const byslot = new Map(points.map((p) => [p.slot, p]));
  const maxVal = Math.max(...points.map((p) => p.kw), peakLine || 0, 1);
  const yMax = maxVal * 1.12;

  const x = (slot: number) => padding.left + (slot / 47) * innerW;
  const y = (v: number) => padding.top + innerH - (v / yMax) * innerH;

  // Ngắt đoạn ở chỗ thiếu dữ liệu thay vì nối thẳng qua — nối thẳng sẽ vẽ ra một đoạn
  // phụ tải không có thật.
  const segments: { slot: number; kw: number }[][] = [];
  let cur: { slot: number; kw: number }[] = [];
  for (let s = 0; s < 48; s++) {
    const p = byslot.get(s);
    if (p) cur.push({ slot: s, kw: p.kw });
    else if (cur.length > 0) {
      segments.push(cur);
      cur = [];
    }
  }
  if (cur.length > 0) segments.push(cur);

  const ticks = 5;
  const peakPoint = points.reduce((mx, p) => (p.eligible && p.kw > mx.kw ? p : mx), points[0]);

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={width} height={height} style={{ display: "block" }}>
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const v = (yMax / ticks) * i;
          return (
            <g key={i}>
              <line x1={padding.left} x2={width - padding.right} y1={y(v)} y2={y(v)} stroke="#f0f0f0" />
              <text x={padding.left - 8} y={y(v) + 4} fontSize={10} fill="#8c8c8c" textAnchor="end">
                {Math.round(v).toLocaleString("vi-VN")}
              </text>
            </g>
          );
        })}

        {/* Ngưỡng đỉnh tháng: vượt qua vạch này là lập đỉnh mới */}
        {peakLine ? (
          <g>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y(peakLine)}
              y2={y(peakLine)}
              stroke="#f5222d"
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />
            <text x={width - padding.right} y={y(peakLine) - 6} fontSize={10} fill="#f5222d" textAnchor="end">
              Đỉnh tháng {Math.round(peakLine).toLocaleString("vi-VN")} kW
            </text>
          </g>
        ) : null}

        {segments.map((seg, i) => (
          <g key={i}>
            <path
              d={
                `M ${x(seg[0].slot)} ${padding.top + innerH} ` +
                seg.map((p) => `L ${x(p.slot)} ${y(p.kw)}`).join(" ") +
                ` L ${x(seg[seg.length - 1].slot)} ${padding.top + innerH} Z`
              }
              fill="#1677ff"
              opacity={0.1}
            />
            <path
              d={seg.map((p, k) => `${k === 0 ? "M" : "L"} ${x(p.slot)} ${y(p.kw)}`).join(" ")}
              fill="none"
              stroke="#1677ff"
              strokeWidth={2}
            />
          </g>
        ))}

        {/* Đánh dấu đỉnh trong ngày */}
        {peakPoint ? (
          <g>
            <circle cx={x(peakPoint.slot)} cy={y(peakPoint.kw)} r={4} fill="#f5222d" />
            <text
              x={x(peakPoint.slot)}
              y={y(peakPoint.kw) - 10}
              fontSize={11}
              fill="#f5222d"
              fontWeight={600}
              textAnchor="middle"
            >
              {Math.round(peakPoint.kw).toLocaleString("vi-VN")} kW · {slotLabel(peakPoint.slot)}
            </text>
          </g>
        ) : null}

        {Array.from({ length: 48 }, (_, s) => s)
          .filter((s) => s % 4 === 0)
          .map((s) => (
            <text key={s} x={x(s)} y={height - 12} fontSize={10} fill="#8c8c8c" textAnchor="middle">
              {slotLabel(s)}
            </text>
          ))}
      </svg>
    </div>
  );
}

// ============================================================
// SO SÁNH ĐỈNH CÁC THÁNG
// Cột = đỉnh kW, chấm nối = hệ số phụ tải (trục phải).
// Đọc cùng lúc hai chỉ số này mới ra hành động: đỉnh cao + LF thấp = có dư địa cắt.
// ============================================================
export function MonthlyPeakChart({
  data,
  height = 300,
}: {
  data: { label: string; peakKw: number; loadFactor: number; isMonthClosed: boolean }[];
  height?: number;
}) {
  if (data.length === 0) return <NoData text="Chưa có dữ liệu đỉnh tháng" />;

  const width = Math.max(680, data.length * 84);
  const padding = { top: 28, right: 52, bottom: 44, left: 60 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const maxKw = Math.max(...data.map((d) => d.peakKw), 1) * 1.15;
  const bandW = innerW / data.length;
  const barW = Math.min(46, bandW * 0.55);

  const y = (v: number) => padding.top + innerH - (v / maxKw) * innerH;
  const yLf = (v: number) => padding.top + innerH - v * innerH;
  const cx = (i: number) => padding.left + bandW * i + bandW / 2;

  const maxPeak = Math.max(...data.map((d) => d.peakKw));

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={width} height={height} style={{ display: "block" }}>
        {Array.from({ length: 5 }, (_, i) => {
          const v = (maxKw / 4) * i;
          return (
            <g key={i}>
              <line x1={padding.left} x2={width - padding.right} y1={y(v)} y2={y(v)} stroke="#f0f0f0" />
              <text x={padding.left - 8} y={y(v) + 4} fontSize={10} fill="#8c8c8c" textAnchor="end">
                {Math.round(v).toLocaleString("vi-VN")}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => (
          <g key={d.label}>
            <rect
              x={cx(i) - barW / 2}
              y={y(d.peakKw)}
              width={barW}
              height={padding.top + innerH - y(d.peakKw)}
              fill={d.peakKw === maxPeak ? "#f5222d" : "#1677ff"}
              opacity={d.isMonthClosed ? 0.9 : 0.45}
              rx={3}
            >
              <title>{`${d.label}\nĐỉnh ${d.peakKw.toLocaleString("vi-VN")} kW\nHệ số phụ tải ${d.loadFactor.toFixed(2)}${d.isMonthClosed ? "" : "\n(tháng đang chạy)"}`}</title>
            </rect>
            <text x={cx(i)} y={y(d.peakKw) - 6} fontSize={10} fill="#595959" textAnchor="middle">
              {Math.round(d.peakKw).toLocaleString("vi-VN")}
            </text>
            <text x={cx(i)} y={height - 24} fontSize={10} fill="#595959" textAnchor="middle">
              {d.label}
            </text>
            {!d.isMonthClosed ? (
              <text x={cx(i)} y={height - 11} fontSize={9} fill="#faad14" textAnchor="middle">
                đang chạy
              </text>
            ) : null}
          </g>
        ))}

        {/* Hệ số phụ tải trên trục phải */}
        <path
          d={data.map((d, i) => `${i === 0 ? "M" : "L"} ${cx(i)} ${yLf(d.loadFactor)}`).join(" ")}
          fill="none"
          stroke="#52c41a"
          strokeWidth={2}
          strokeDasharray="4 3"
        />
        {data.map((d, i) => (
          <circle key={`lf${d.label}`} cx={cx(i)} cy={yLf(d.loadFactor)} r={3.5} fill="#52c41a">
            <title>{`Hệ số phụ tải ${d.loadFactor.toFixed(2)}`}</title>
          </circle>
        ))}
        {[0, 0.5, 1].map((v) => (
          <text
            key={`r${v}`}
            x={width - padding.right + 8}
            y={yLf(v) + 4}
            fontSize={10}
            fill="#52c41a"
            textAnchor="start"
          >
            {v.toFixed(1)}
          </text>
        ))}
        <text x={width - padding.right + 8} y={padding.top - 12} fontSize={10} fill="#52c41a">
          LF
        </text>
      </svg>
    </div>
  );
}
