
import React, { useMemo } from 'react';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';

interface HistogramProps {
  data: number[];
  color?: string;
}

const Histogram: React.FC<HistogramProps> = ({ data, color = "#10b981" }) => {
  const chartData = useMemo(() => {
    return data.map((count, bin) => ({ bin, count }));
  }, [data]);

  const maxVal = Math.max(...data);

  return (
    <div className="h-40 w-full bg-slate-900/50 rounded-lg p-2 border border-slate-700">
      <h4 className="text-xs uppercase font-bold text-slate-400 mb-2">Intensity Distribution</h4>
      <ResponsiveContainer width="100%" height="80%">
        <BarChart data={chartData}>
          <XAxis dataKey="bin" hide />
          <YAxis hide domain={[0, maxVal]} />
          <Tooltip 
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="bg-slate-800 border border-slate-600 p-1 text-[10px]">
                    <p>{`Level: ${payload[0].payload.bin}`}</p>
                    <p>{`Count: ${payload[0].value}`}</p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Bar dataKey="count" fill={color} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default Histogram;
