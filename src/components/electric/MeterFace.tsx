"use client";

function formatMeterDigits(value: number) {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const [intPartRaw, decRaw] = safe.toFixed(2).split(".");
  const intPart = intPartRaw.padStart(7, "0").slice(-7);
  const decPart = (decRaw || "00").padEnd(2, "0").slice(0, 2);
  return { intPart, decPart };
}

export function MeterFace({
  value,
  online,
  label,
  power,
}: {
  value: number;
  online: boolean;
  label: string;
  power?: number | null;
}) {
  const { intPart, decPart } = formatMeterDigits(value);
  const powerStr = power != null && Number.isFinite(power)
    ? power.toFixed(2)
    : "---";

  return (
    <svg viewBox="0 0 440 310" width="100%" style={{ maxWidth: 460, display: "block", margin: "0 auto" }}>
      <defs>
        <linearGradient id="meterBezel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a4452" />
          <stop offset="100%" stopColor="#161b22" />
        </linearGradient>
        <linearGradient id="meterScreen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0e3318" />
          <stop offset="100%" stopColor="#0a2412" />
        </linearGradient>
        <filter id="digitGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <style>{`
          @keyframes meterPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
          .meter-pulse-dot { animation: meterPulse 1.4s ease-in-out infinite; }
          .meter-digits { font-family: "Consolas", "SF Mono", "Courier New", monospace; }
        `}</style>
      </defs>

      {/* Vỏ đồng hồ */}
      <rect x="6" y="6" width="428" height="298" rx="18" fill="url(#meterBezel)" stroke="#4a5566" strokeWidth="1.5" />
      {[[24, 24], [416, 24], [24, 286], [416, 286]].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4.5" fill="#0b0f14" stroke="#5a6577" strokeWidth="1" />
      ))}

      {/* Nhãn hãng + đèn báo */}
      <text x="30" y="40" fill="#aab4c2" fontSize="13" fontWeight="700" letterSpacing="1" className="meter-digits">
        SELEC EM368
      </text>
      <circle cx="404" cy="36" r="6" fill={online ? "#52c41a" : "#595959"} className={online ? "meter-pulse-dot" : ""} />
      <text x="390" y="40" fill={online ? "#52c41a" : "#8c8c8c"} fontSize="10" textAnchor="end">
        {online ? "ONLINE" : "OFFLINE"}
      </text>

      {/* Màn hình LCD */}
      <rect x="24" y="56" width="392" height="118" rx="8" fill="url(#meterScreen)" stroke="#0c2f15" strokeWidth="2" />
      <rect x="24" y="56" width="392" height="118" rx="8" fill="none" stroke="#1f5c2e" strokeWidth="1" opacity="0.6" />

      <text
        x="44"
        y="132"
        className="meter-digits"
        fontSize="46"
        fontWeight="700"
        fill="#7CFC8A"
        filter="url(#digitGlow)"
      >
        {intPart}
        <tspan fill="#3f9b4f" fontSize="32">.{decPart}</tspan>
      </text>
      <text x="396" y="155" textAnchor="end" fill="#5fae6c" fontSize="15" fontWeight="600" className="meter-digits">
        kWh
      </text>
      <text x="44" y="155" fill="#3f9b4f" fontSize="11" className="meter-digits">
        ACTIVE ENERGY · TOTAL
      </text>

      {/* Thanh công suất tức thời */}
      <rect x="24" y="182" width="392" height="42" rx="6" fill="#0a1628" stroke="#1a3a5c" strokeWidth="1.5" />
      <text x="36" y="200" fill="#5b8ab5" fontSize="10" className="meter-digits">
        INSTANT POWER
      </text>
      <text
        x="384"
        y="214"
        textAnchor="end"
        className="meter-digits"
        fontSize="22"
        fontWeight="700"
        fill="#60b4ff"
        filter="url(#digitGlow)"
      >
        {powerStr}
        <tspan fill="#3d7ab0" fontSize="14"> kW</tspan>
      </text>

      {/* Đáy đồng hồ */}
      <text x="220" y="250" textAnchor="middle" fill="#aab4c2" fontSize="13" fontWeight="600">
        {label}
      </text>
      <rect x="24" y="262" width="392" height="2" fill="#2a323d" />
      <text x="220" y="282" textAnchor="middle" fill="#6b7585" fontSize="10" letterSpacing="2">
        MODBUS RTU · RS485 · 9600 8N1
      </text>
    </svg>
  );
}
