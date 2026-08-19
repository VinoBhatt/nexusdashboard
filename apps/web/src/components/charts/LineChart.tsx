import { useEffect, useRef, useState } from "react";

export function LineChart({ data, color = "#2395dc" }: { data: number[]; color?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 700, h: 250 });

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
  const pts = data.map((v, i): [number, number] => [
    p + (i * (w - 2 * p)) / (data.length - 1 || 1),
    h - p - ((v - min) / (max - min || 1)) * (h - 2 * p),
  ]);

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

  return (
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
        <circle key={i} cx={x} cy={y} r="4" fill="#fff" stroke={color} strokeWidth="3" />
      ))}
    </svg>
  );
}
