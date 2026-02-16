import { z } from 'zod'

export interface ChartUIToolInvocation {
  type: string
  toolCallId: string
  toolName: string
  state: 'partial-call' | 'call' | 'result'
  step?: number
  args: ChartArgs
  result?: ChartResult
}

export interface ChartArgs {
  title?: string
  data: Array<Record<string, string | number>>
  xKey: string
  series: Array<{ key: string, name: string, color: string }>
  xLabel?: string
  yLabel?: string
}

export type ChartResult = ChartArgs

export const chartToolSchema = z.object({
  title: z.string().optional().describe('Title of the chart'),
  data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).min(1),
  xKey: z.string(),
  series: z.array(z.object({
    key: z.string(),
    name: z.string(),
    color: z.string()
  })).min(1),
  xLabel: z.string().optional(),
  yLabel: z.string().optional()
})

export async function executeChartTool(args: ChartArgs): Promise<ChartResult> {
  await new Promise(resolve => setTimeout(resolve, 1500))
  return args
}
