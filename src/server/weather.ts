/**
 * Green Loop — Weather Integration & Agronomic Risk Analysis Service
 * Fetches real weather and forecasts from Open-Meteo (open-access meteorological model)
 * without requiring private API keys, and evaluates qualified agricultural risk warnings.
 */

export interface WeatherCondition {
  temperature_c: number;
  relative_humidity_pct: number;
  wind_speed_kmh: number;
  precipitation_mm: number;
  weather_code: number;
  weather_description: string;
}

export interface DailyForecastItem {
  date: string;
  temp_max_c: number;
  temp_min_c: number;
  precipitation_probability_pct: number;
  precipitation_sum_mm: number;
  weather_code: number;
  weather_description: string;
}

export interface AgronomicRiskAlert {
  risk_type: 'heavy_rainfall' | 'heat_stress' | 'frost_low_temp' | 'high_winds' | 'spray_window';
  severity: 'advisory' | 'warning' | 'favorable';
  title: string;
  description: string;
  recommended_action: string;
}

export interface WeatherResponse {
  available: boolean;
  source: string;
  location_name: string;
  latitude: number | null;
  longitude: number | null;
  timestamp: string;
  current: WeatherCondition | null;
  daily_forecast: DailyForecastItem[];
  agronomic_risks: AgronomicRiskAlert[];
  notice?: string;
}

// WMO Weather interpretation codes (WW)
function interpretWmoCode(code: number): string {
  switch (code) {
    case 0:
      return 'Clear sky';
    case 1:
      return 'Mainly clear';
    case 2:
      return 'Partly cloudy';
    case 3:
      return 'Overcast';
    case 45:
    case 48:
      return 'Fog / depositing rime fog';
    case 51:
    case 53:
    case 55:
      return 'Drizzle (Light to Dense)';
    case 61:
    case 63:
    case 65:
      return 'Rain (Slight to Heavy)';
    case 71:
    case 73:
    case 75:
      return 'Snow fall (Slight to Heavy)';
    case 80:
    case 81:
    case 82:
      return 'Rain showers (Slight to Violent)';
    case 95:
      return 'Thunderstorm (Slight or Moderate)';
    case 96:
    case 99:
      return 'Thunderstorm with Hail';
    default:
      return 'Variable conditions';
  }
}

// Evaluate qualified agricultural risk insights based strictly on real meteorological data
function evaluateAgronomicRisks(
  current: WeatherCondition,
  daily: DailyForecastItem[]
): AgronomicRiskAlert[] {
  const alerts: AgronomicRiskAlert[] = [];

  // 1. High Rainfall & Waterlogging Risk
  const maxRainProb = Math.max(...daily.map((d) => d.precipitation_probability_pct), 0);
  const maxRainSum = Math.max(...daily.map((d) => d.precipitation_sum_mm), 0);
  if (maxRainProb >= 70 || maxRainSum >= 25) {
    alerts.push({
      risk_type: 'heavy_rainfall',
      severity: 'warning',
      title: 'High Precipitation & Infiltration Warning',
      description: `Meteorological models forecast up to ${maxRainSum.toFixed(1)} mm precipitation with ${maxRainProb}% probability in upcoming window.`,
      recommended_action:
        'Inspect field perimeter drainage channels, elevate nursery crates, and suspend scheduled overhead irrigation cycles.',
    });
  }

  // 2. Heat Stress Check
  const maxTemp = Math.max(...daily.map((d) => d.temp_max_c), current.temperature_c);
  if (maxTemp >= 38) {
    alerts.push({
      risk_type: 'heat_stress',
      severity: 'warning',
      title: 'Thermal Heat Stress Alert',
      description: `Canopy temperatures projected to peak at ${maxTemp.toFixed(1)}°C. High vapor pressure deficit accelerates transpiration shock.`,
      recommended_action:
        'Initiate early morning pulse fertigation and inspect shade netting over sensitive nursery or seedling beds.',
    });
  }

  // 3. Low Temperature / Frost Check
  const minTemp = Math.min(...daily.map((d) => d.temp_min_c), current.temperature_c);
  if (minTemp <= 4) {
    alerts.push({
      risk_type: 'frost_low_temp',
      severity: 'warning',
      title: 'Low Temperature & Frost Advisory',
      description: `Nighttime lows projected to drop to ${minTemp.toFixed(1)}°C. Cold-sensitive crops at risk of chilling injury.`,
      recommended_action:
        'Maintain protective mulch cover over root zones and consider light evening micro-sprinkler wetting to release latent heat.',
    });
  }

  // 4. Spray & Application Window
  if (current.wind_speed_kmh <= 14 && maxRainProb <= 25) {
    alerts.push({
      risk_type: 'spray_window',
      severity: 'favorable',
      title: 'Favorable Spraying & Foliar Window',
      description: `Calm wind (${current.wind_speed_kmh.toFixed(1)} km/h) and low rain probability (<25%) provide optimal conditions for foliar nutrient and biological pest application.`,
      recommended_action:
        'Foliar spray drift is minimized. Ensure protective PPE and calibrate application nozzles before midday temperature rise.',
    });
  } else if (current.wind_speed_kmh > 24) {
    alerts.push({
      risk_type: 'high_winds',
      severity: 'advisory',
      title: 'High Wind Drift Warning',
      description: `Surface winds exceed ${current.wind_speed_kmh.toFixed(1)} km/h. High potential for uneven foliar spray coverage and droplet drift.`,
      recommended_action:
        'Postpone foliar applications and inspect polyhouse tie-downs and trellis supports.',
    });
  }

  return alerts;
}

// Default coordinates for Maharashtra agricultural belt if farm coordinates are not yet geocoded
const DEFAULT_LAT = 19.8968; // Nashik / Godavari basin
const DEFAULT_LON = 74.4764;

export async function fetchAgriculturalWeather(options: {
  latitude?: number | null;
  longitude?: number | null;
  locationName?: string;
}): Promise<WeatherResponse> {
  const lat = options.latitude ?? DEFAULT_LAT;
  const lon = options.longitude ?? DEFAULT_LON;
  const locationName =
    options.locationName || (options.latitude ? `Parcel (${lat.toFixed(3)}, ${lon.toFixed(3)})` : 'Nashik Agricultural Belt, Maharashtra');

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&timezone=auto`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'GreenLoop-AgroTech/2.4 (agricultural-decision-support)',
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Open-Meteo HTTP ${res.status}: ${res.statusText}`);
    }

    interface OpenMeteoPayload {
      current?: {
        temperature_2m: number;
        relative_humidity_2m: number;
        weather_code: number;
        wind_speed_10m: number;
        precipitation: number;
      };
      daily?: {
        time: string[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_probability_max: number[];
        precipitation_sum: number[];
        weather_code: number[];
      };
    }

    const json = (await res.json()) as OpenMeteoPayload;

    if (!json.current || !json.daily || !Array.isArray(json.daily.time)) {
      throw new Error('Incomplete weather payload returned by provider');
    }

    const current: WeatherCondition = {
      temperature_c: json.current.temperature_2m,
      relative_humidity_pct: json.current.relative_humidity_2m,
      wind_speed_kmh: json.current.wind_speed_10m,
      precipitation_mm: json.current.precipitation,
      weather_code: json.current.weather_code,
      weather_description: interpretWmoCode(json.current.weather_code),
    };

    const dailyForecast: DailyForecastItem[] = json.daily.time.slice(0, 5).map((date, idx) => ({
      date,
      temp_max_c: json.daily?.temperature_2m_max[idx] ?? 0,
      temp_min_c: json.daily?.temperature_2m_min[idx] ?? 0,
      precipitation_probability_pct: json.daily?.precipitation_probability_max[idx] ?? 0,
      precipitation_sum_mm: json.daily?.precipitation_sum[idx] ?? 0,
      weather_code: json.daily?.weather_code[idx] ?? 0,
      weather_description: interpretWmoCode(json.daily?.weather_code[idx] ?? 0),
    }));

    const agronomicRisks = evaluateAgronomicRisks(current, dailyForecast);

    return {
      available: true,
      source: 'Open-Meteo Global Numerical Weather Prediction (WMO-compliant)',
      location_name: locationName,
      latitude: lat,
      longitude: lon,
      timestamp: new Date().toISOString(),
      current,
      daily_forecast: dailyForecast,
      agronomic_risks: agronomicRisks,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Weather service unreachable';
    return {
      available: false,
      source: 'Open-Meteo (Temporarily Unreachable)',
      location_name: locationName,
      latitude: lat,
      longitude: lon,
      timestamp: new Date().toISOString(),
      current: null,
      daily_forecast: [],
      agronomic_risks: [],
      notice: `Live weather telemetry currently unavailable (${errorMsg}). No fabricated weather values substituted.`,
    };
  }
}
