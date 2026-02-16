import { z } from 'zod'

export interface WeatherUIToolInvocation {
  type: string
  toolCallId: string
  toolName: string
  state: 'partial-call' | 'call' | 'result'
  step?: number
  args: { location: string }
  result?: WeatherResult
}

export interface WeatherResult {
  location: string
  temperature: number
  temperatureHigh: number
  temperatureLow: number
  condition: { text: string, icon: string }
  humidity: number
  windSpeed: number
  dailyForecast: Array<{
    day: string
    high: number
    low: number
    condition: { text: string, icon: string }
  }>
}

const getWeatherData = (k: string) => ({
  'sunny': { text: 'Sunny', icon: 'i-lucide-sun' },
  'partly-cloudy': { text: 'Partly Cloudy', icon: 'i-lucide-cloud-sun' },
  'cloudy': { text: 'Cloudy', icon: 'i-lucide-cloud' },
  'rainy': { text: 'Rainy', icon: 'i-lucide-cloud-rain' },
  'foggy': { text: 'Foggy', icon: 'i-lucide-cloud-fog' }
}[k] || { text: 'Sunny', icon: 'i-lucide-sun' })

export const weatherToolSchema = z.object({
  location: z.string().describe('Location for weather')
})

export async function executeWeatherTool({ location }: { location: string }): Promise<WeatherResult> {
  await new Promise(resolve => setTimeout(resolve, 1500))

  const temp = Math.floor(Math.random() * 35) + 5
  const conds = ['sunny', 'partly-cloudy', 'cloudy', 'rainy', 'foggy'] as const
  return {
    location,
    temperature: Math.round(temp),
    temperatureHigh: Math.round(temp + Math.random() * 5 + 2),
    temperatureLow: Math.round(temp - Math.random() * 5 - 2),
    condition: getWeatherData(conds[Math.floor(Math.random() * conds.length)]!),
    humidity: Math.floor(Math.random() * 60) + 20,
    windSpeed: Math.floor(Math.random() * 25) + 5,
    dailyForecast: ['Today', 'Tomorrow', 'Thu', 'Fri', 'Sat'].map((day, i) => ({
      day,
      high: Math.round(temp + Math.random() * 8 - 2),
      low: Math.round(temp - Math.random() * 8 - 3),
      condition: getWeatherData(conds[(Math.floor(Math.random() * conds.length) + i) % conds.length]!)
    }))
  }
}
