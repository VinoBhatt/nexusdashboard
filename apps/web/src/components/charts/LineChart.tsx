import { useEffect, useRef, useState } from "react";
import { money, shortMoney } from "../../lib/money";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatXLabel(raw: string | undefined, index: number): string {
  if (!raw) return String(index + 1);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${MONTH_ABBR[Number(m[2]) - 1]} '${m[1].slice(2)}`;
  return raw;
}

export function LineChart({
  data,
  labels,
  color = "#2395dc",
}: {
  data: number[];
  labels?: string[];
  color?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 700, h: 250 });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const update = () => setSize({ w: el.clientWidth || 700, h: el.clientHeight || 250 });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (data.length === 0) return <svg ref={ref} width="100%" height="100%" />;

  const { w, h } = size;
  const padLeft = 58;
  const padRight = 14;
  const padTop = 14;
  const padBottom = 26;
  const plotW = w - padLeft - padRight;
  const plotH = h - padTop - padBottom;

  const min = Math.min(...data) * 0.985;
  const max = Math.max(...data) * 1.015;
  const xAt = (i: number) => padLeft + (i * plotW) / (data.length - 1 || 1);
  const yAt = (v: number) => padTop + plotH - ((v - min) / (max - min || 1)) * plotH;
  const pts = data.map((v, i): [number, number] => [xAt(i), yAt(v)]);

  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  let area = `M ${pts[0][0]} ${padTop + plotH} L ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const xc = (x0 + x1) / 2;
    d += ` C ${xc} ${y0}, ${xc} ${y1}, ${x1} ${y1}`;
    area += ` C ${xc} ${y0}, ${xc} ${y1}, ${x1} ${y1}`;
  }
  area += ` L ${pts[pts.length - 1][0]} ${padTop + plotH} Z`;

  const gradId = `chartGrad${color.replace("#", "")}`;

  // Y-axis: 5 evenly spaced ticks from max (top) to min (bottom).
  const yTicks = [0, 1, 2, 3, 4].map((i) => {
    const value = max - (i * (max - min)) / 4;
    return { y: padTop + (i * plotH) / 4, value };
  });

  // X-axis: skip labels so they don't overlap on narrow charts.
  const maxXTicks = Math.max(2, Math.floor(plotW / 56));
  const tickStep = Math.max(1, Math.ceil((data.length - 1) / (maxXTicks - 1)));
  const xTickIndices: number[] = [];
  for (let i = 0; i < data.length; i += tickStep) xTickIndices.push(i);
  if (xTickIndices[xTickIndices.length - 1] !== data.length - 1) xTickIndices.push(data.length - 1);

  function handleMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * w;
    let nearest = 0;
    let nearestDist = Infinity;
    pts.forEach(([x], i) => {
      const dist = Math.abs(x - relX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  const hover = hoverIndex !== null ? pts[hoverIndex] : null;
  const tooltipLeft = hover ? Math.min(Math.max((hover[0] / w) * 100, 8), 92) : 0;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg ref={ref} width="100%" height="100%" viewBox={`0 0 ${w} ${h}`}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".22" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={padLeft} y1={t.y} x2={w - padRight} y2={t.y} style={{ stroke: "var(--line)" }} />
            <text x={padLeft - 8} y={t.y} textAnchor="end" dominantBaseline="middle" fontSize="10.5" style={{ fill: "var(--muted)" }}>
              {shortMoney(t.value)}
            </text>
          </g>
        ))}
        <line x1={padLeft} y1={padTop} x2={padLeft} y2={padTop + plotH} style={{ stroke: "var(--line)" }} />
        <path d={area} fill={`url(#${gradId})`} />
        <path d={d} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={hoverIndex === i ? 6 : 4}
            style={{ fill: "var(--surface)" }}
            stroke={color}
            strokeWidth={hoverIndex === i ? 4 : 3}
          />
        ))}
        {xTickIndices.map((i) => (
          <text key={i} x={pts[i][0]} y={padTop + plotH + 18} textAnchor="middle" fontSize="10.5" style={{ fill: "var(--muted)" }}>
            {formatXLabel(labels?.[i], i)}
          </text>
        ))}
        {hover && <line x1={hover[0]} y1={padTop} x2={hover[0]} y2={padTop + plotH} stroke={color} strokeOpacity="0.25" strokeWidth="1.5" />}
        <rect
          x={0}
          y={0}
          width={w}
          height={h}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIndex(null)}
        />
      </svg>
      {hover && hoverIndex !== null && (
        <div
          style={{
            position: "absolute",
            left: `${tooltipLeft}%`,
            top: Math.max((hover[1] / h) * 100 - 14, 2) + "%",
            transform: "translate(-50%, -100%)",
            background: "#13294b",
            color: "#fff",
            borderRadius: 10,
            padding: "6px 10px",
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            boxShadow: "0 8px 18px rgba(15,45,80,.25)",
          }}
        >
          {labels?.[hoverIndex] && <div style={{ opacity: 0.7, fontWeight: 600, fontSize: 11 }}>{labels[hoverIndex]}</div>}
          <div>{money(data[hoverIndex])}</div>
        </div>
      )}
    </div>
  );
}
