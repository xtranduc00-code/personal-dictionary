"use client";
import { Label, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart, } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, } from "@gd/components/ui/card";
import { ChartConfig, ChartContainer } from "@gd/components/ui/chart";
import { convertFileSize } from "@gd/lib/utils";
function calculatePercentage(used: number, limit: number) {
    if (!limit)
        return 0;
    return Math.min(100, (used / limit) * 100);
}
const chartConfig = {
    size: {
        label: "Size",
    },
    used: {
        label: "Used",
        color: "hsl(217, 91%, 60%)",
    },
} satisfies ChartConfig;
const ACCENT = "#3b82f6";
export const Chart = ({ used = 0, limit = 2 * 1024 * 1024 * 1024, }: {
    used?: number;
    limit?: number;
}) => {
    const pct = calculatePercentage(used, limit);
    const chartData = [{ storage: "used", 10: used, fill: ACCENT }];
    return (<Card className="drive-storage-chart rounded-xl text-white">
      <div className="flex flex-col gap-5 p-5 text-white md:flex-row md:items-center md:gap-8 md:p-6">
        <CardContent className="flex flex-shrink-0 justify-center p-0">
          <ChartContainer config={chartConfig} className="chart-container mx-auto aspect-square w-[180px] text-white md:w-[220px] xl:w-[250px]">
            <RadialBarChart data={chartData} startAngle={90} endAngle={pct + 90} innerRadius={80} outerRadius={110}>
              <PolarGrid gridType="circle" radialLines={false} stroke="none" className="polar-grid" polarRadius={[86, 74]}/>
              <RadialBar dataKey="storage" background={{ fill: "rgba(255,255,255,0.08)" }} cornerRadius={10}/>
              <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
                <Label content={({ viewBox }) => {
            if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                return (<text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                          <tspan x={viewBox.cx} y={viewBox.cy} className="text-3xl font-bold" fill="#f4f4f5">
                            {pct ? pct.toFixed(0) : "0"}%
                          </tspan>
                          <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 22} className="text-sm font-semibold" fill="rgba(244,244,245,0.65)">
                            Space used
                          </tspan>
                        </text>);
            }
        }}/>
              </PolarRadiusAxis>
            </RadialBarChart>
          </ChartContainer>
        </CardContent>
        <CardHeader className="min-w-0 flex-1 space-y-2 p-0 text-center text-white md:text-left [&]:text-white">
          <CardTitle className="text-xl font-bold tracking-tight !text-white">
            Available Storage
          </CardTitle>
          <p className="text-lg font-bold leading-snug !text-white" style={{ color: "#ffffff" }}>
            {convertFileSize(used)} / {limit ? convertFileSize(limit) : "—"}
          </p>
          <p className="text-sm font-semibold !text-white" style={{ color: "#ffffff" }}>
            Google Drive quota for this account
          </p>
        </CardHeader>
      </div>
    </Card>);
};
