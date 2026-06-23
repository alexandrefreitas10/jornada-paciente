'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface ChartPoint {
  semana: number | string
  valor: number
}

interface Props {
  title: string
  unit: string
  data: ChartPoint[]
  color?: string
  zoomAxis?: boolean
}

export function MeasurementChart({ title, unit, data, color = '#7c3aed', zoomAxis = false }: Props) {
  if (data.length === 0) return null

  const values = data.map(d => d.valor)
  const dataMin = Math.min(...values)
  const dataMax = Math.max(...values)
  const padding = Math.max((dataMax - dataMin) * 0.4, 1)
  const yDomain: [number, number] | undefined = zoomAxis
    ? [Math.floor(dataMin - padding), Math.ceil(dataMax + padding)]
    : undefined

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">
        {title} <span className="text-gray-400 font-normal">({unit})</span>
      </h4>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="semana"
            tick={{ fontSize: 11 }}
            label={{ value: 'Semana', position: 'insideBottom', offset: -2, fontSize: 11 }}
            height={36}
          />
          <YAxis tick={{ fontSize: 11 }} domain={yDomain} />
          <Tooltip
            formatter={(value) => [`${value} ${unit}`, title]}
            labelFormatter={(label) => `Semana ${label}`}
          />
          <Line
            type="monotone"
            dataKey="valor"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 4, fill: color }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
