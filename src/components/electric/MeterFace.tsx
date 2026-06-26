"use client";

function formatMeterDigits(value: number) {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const [intPartRaw, decRaw] = safe.toFixed(2).split(".");
  const intPart = intPartRaw.padStart(6, "0").slice(-6);
  const decPart = (decRaw || "00").padEnd(2, "0").slice(0, 2);
  return { intPart, decPart };
}

export function MeterFace({
  value,
  online,
  label,
}: {
  value: number;
  online: boolean;
  label: string;
}) {
  const { intPart, decPart } = formatMeterDigits(value);

  return (
    <svg viewBox="0 0 400 260" width="100%" style={{ maxWidth: 420, display: "block", margin: "0 auto" }}>
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
      <rect x="6" y="6" width="388" height="248" rx="18" fill="url(#meterBezel)" stroke="#4a5566" strokeWidth="1.5" />
      {[[24, 24], [376, 24], [24, 236], [376, 236]].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4.5" fill="#0b0f14" stroke="#5a6577" strokeWidth="1" />
      ))}

      {/* Nhãn hãng + đèn báo */}
      <text x="30" y="40" fill="#aab4c2" fontSize="13" fontWeight="700" letterSpacing="1" className="meter-digits">
        SELEC EM368
      </text>
      <circle cx="364" cy="36" r="6" fill={online ? "#52c41a" : "#595959"} className={online ? "meter-pulse-dot" : ""} />
      <text x="350" y="40" fill={online ? "#52c41a" : "#8c8c8c"} fontSize="10" textAnchor="end">
        {online ? "ONLINE" : "OFFLINE"}
      </text>

      {/* Màn hình LCD */}
      <rect x="24" y="56" width="352" height="118" rx="8" fill="url(#meterScreen)" stroke="#0c2f15" strokeWidth="2" />
      <rect x="24" y="56" width="352" height="118" rx="8" fill="none" stroke="#1f5c2e" strokeWidth="1" opacity="0.6" />

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
      <text x="356" y="155" textAnchor="end" fill="#5fae6c" fontSize="15" fontWeight="600" className="meter-digits">
        kWh
      </text>
      <text x="44" y="155" fill="#3f9b4f" fontSize="11" className="meter-digits">
        ACTIVE ENERGY · TOTAL
      </text>

      {/* Đáy đồng hồ */}
      <text x="200" y="200" textAnchor="middle" fill="#aab4c2" fontSize="13" fontWeight="600">
        {label}
      </text>
      <rect x="24" y="212" width="352" height="2" fill="#2a323d" />
      <text x="200" y="232" textAnchor="middle" fill="#6b7585" fontSize="10" letterSpacing="2">
        MODBUS RTU · RS485 · 9600 8N1
      </text>
    </svg>
  );
}
