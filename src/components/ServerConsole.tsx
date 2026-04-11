import { useRef, useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Cpu, MemoryStick, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { LogEntry, ServerStats, ServerStatus } from "@/hooks/useServerState";

const CHART_LINE = "#FFA500";
const CHART_FILL = "rgba(255, 165, 0, 0.2)";
const TITLE_CLASS = "font-bold text-[#4B2C6D]";

const cpuChartConfig = {
  cpu: { label: "CPU %", color: CHART_LINE },
} satisfies ChartConfig;

const ramChartConfig = {
  ram: { label: "RAM (MB)", color: CHART_LINE },
} satisfies ChartConfig;

interface Props {
  logs: LogEntry[];
  stats: ServerStats;
  status: ServerStatus;
  onSendCommand: (cmd: string) => void;
}

const HISTORY_LEN = 48;

function CpuChart({ value, max }: { value: number; max: number }) {
  const [data, setData] = useState<{ i: number; cpu: number }[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    seq.current += 1;
    setData((prev) => {
      const next = [...prev, { i: seq.current, cpu: value }];
      return next.slice(-HISTORY_LEN);
    });
  }, [value]);

  const yMax = Math.max(max, 1);
  const yTicks = [0, Math.round(yMax / 3), Math.round((2 * yMax) / 3), yMax];

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Cpu className="h-5 w-5 shrink-0 text-[#4B2C6D]/80" />
        <h3 className={`text-sm sm:text-base ${TITLE_CLASS}`}>Uso de CPU</h3>
      </div>
      <ChartContainer config={cpuChartConfig} className="h-[200px] w-full aspect-auto [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/50" />
          <XAxis dataKey="i" hide />
          <YAxis
            domain={[0, yMax]}
            ticks={yTicks}
            tickFormatter={(v) => `${v}%`}
            width={44}
            tickLine={false}
            axisLine={false}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(val) => (
                  <span className="font-mono tabular-nums">{typeof val === "number" ? `${val.toFixed(1)}%` : val}</span>
                )}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="cpu"
            stroke={CHART_LINE}
            fill={CHART_FILL}
            strokeWidth={2}
            isAnimationActive={data.length < 8}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

function RamChart({ valueGb }: { valueGb: number }) {
  const maxMb = 3500;
  const valueMb = valueGb * 1024;
  const [data, setData] = useState<{ i: number; ram: number }[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    seq.current += 1;
    setData((prev) => {
      const next = [...prev, { i: seq.current, ram: valueMb }];
      return next.slice(-HISTORY_LEN);
    });
  }, [valueMb]);

  const ramTicks = [0, 1167, 2333, 3500];

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <MemoryStick className="h-5 w-5 shrink-0 text-[#4B2C6D]/80" />
        <h3 className={`text-sm sm:text-base ${TITLE_CLASS}`}>Uso de Memória RAM</h3>
      </div>
      <ChartContainer config={ramChartConfig} className="h-[200px] w-full aspect-auto [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/50" />
          <XAxis dataKey="i" hide />
          <YAxis
            domain={[0, maxMb]}
            ticks={ramTicks}
            tickFormatter={(v) => `${v}MB`}
            width={52}
            tickLine={false}
            axisLine={false}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(val) => (
                  <span className="font-mono tabular-nums">
                    {typeof val === "number" ? `${Math.round(val)} MB` : val}
                  </span>
                )}
              />
            }
          />
          <Area
            type="monotone"
            dataKey="ram"
            stroke={CHART_LINE}
            fill={CHART_FILL}
            strokeWidth={2}
            isAnimationActive={data.length < 8}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

export default function ServerConsole({ logs, stats, status, onSendCommand }: Props) {
  const [command, setCommand] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    onSendCommand(command.startsWith("/") ? command : `/${command}`);
    setCommand("");
  };

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <div className="flex flex-col gap-4">
        <CpuChart value={stats.cpu} max={stats.maxCpu} />
        <RamChart valueGb={stats.ram} />
      </div>

      <div className="flex h-[500px] flex-col rounded-xl overflow-hidden border">
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-scroll p-4 font-mono text-sm console-scrollbar bg-console text-console-text"
        >
          {logs.map(log => (
            <div key={log.id} className="leading-relaxed">
              <span className="text-muted-foreground">[{log.timestamp}]</span>{" "}
              <span className={
                log.level === "WARN" ? "text-warning" :
                log.level === "ERROR" ? "text-destructive" :
                "text-console-fg"
              }>
                [Server thread/{log.level}]
              </span>
              : {log.message}
            </div>
          ))}
          {logs.length === 0 && (
            <div className="text-muted-foreground italic">
              {status === "stopped" ? "Servidor offline. Clique em Iniciar para começar." : "Carregando..."}
            </div>
          )}
        </div>
        <form onSubmit={handleSubmit} className="flex border-t bg-console">
          <span className="flex items-center px-3 text-muted-foreground font-mono text-sm">{">"}</span>
          <Input
            value={command}
            onChange={e => setCommand(e.target.value)}
            placeholder="Digite um comando..."
            disabled={status !== "running"}
            className="flex-1 border-0 bg-transparent font-mono text-sm text-console-text focus-visible:ring-0 rounded-none"
          />
          <button type="submit" className="px-4 text-primary hover:text-primary/80 transition-colors" disabled={status !== "running"}>
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
