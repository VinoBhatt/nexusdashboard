import { useEffect, useRef, useState } from "react";
import { money } from "../../lib/money";

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
  const p = 18;
  const min = Math.min(...data) * 0.985;
  const max = Math.max(...data) * 1.015;
  const xAt = (i: number) => p + (i * (w - 2 * p)) / (data.length - 1 || 1);
  const pts = data.map((v, i): [number, number] => [xAt(i), h - p - ((v - min) / (max - min || 1)) * (h - 2 * p)]);

  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  let area = `M ${pts[0][0]} ${h - p} L ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const xc = (x0 + x1) / 2;
    d += ` C ${xc} ${y0}, ${xc} ${y1}, ${x1} ${y1}`;
    area += ` C ${xc} ${y0}, ${xc} ${y1}, ${x1} ${y1}`;
  }
  area += ` L ${pts[pts.length - 1][0]} ${h - p} Z`;

  const gradId = `chartGrad${color.replace("#", "")}`;

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
        {[...Array(5)].map((_, i) => (
          <line key={i} x1={p} y1={p + (i * (h - 2 * p)) / 4} x2={w - p} y2={p + (i * (h - 2 * p)) / 4} stroke="#dfe8f3" />
        ))}
        <path d={area} fill={`url(#${gradId})`} />
        <path d={d} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={hoverIndex === i ? 6 : 4}
            fill="#fff"
            stroke={color}
            strokeWidth={hoverIndex === i ? 4 : 3}
          />
        ))}
        {hover && <line x1={hover[0]} y1={p} x2={hover[0]} y2={h - p} stroke={color} strokeOpacity="0.25" strokeWidth="1.5" />}
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
