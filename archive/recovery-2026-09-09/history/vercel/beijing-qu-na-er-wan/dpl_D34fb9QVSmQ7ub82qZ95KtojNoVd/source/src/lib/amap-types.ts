export type AmapCoordinate = {
  lng: number;
  lat: number;
};

export type AmapPlace = AmapCoordinate & {
  name: string;
  address: string;
  adcode?: string;
  matchedBy: "address" | "poi" | "system";
};

export type TravelMode = "transit" | "driving" | "walking" | "bicycling";

export type TravelEstimate = {
  mode: TravelMode;
  available: boolean;
  durationMinutes: number | null;
  distanceKm: number | null;
  summary: string;
  suburbanRail: string[];
  polyline: AmapCoordinate[];
};

export type ParticipantRoutePlan = {
  id: "serenity" | "zzz";
  name: string;
  origin: AmapPlace;
  estimates: Record<TravelMode, TravelEstimate>;
  toMeeting: TravelEstimate | null;
};

export type AmapTripPlan = {
  generatedAt: string;
  destination: AmapPlace;
  destinationNeedsConfirmation: boolean;
  meetingPoint: AmapPlace;
  meetingToDestination: TravelEstimate | null;
  participants: ParticipantRoutePlan[];
  warnings: string[];
};

export type AmapWeatherDay = {
  date: string;
  dayWeather: string;
  nightWeather: string;
  dayTemp: string;
  nightTemp: string;
  dayWind: string;
};

export type AmapWeather = {
  city: string;
  reportTime: string;
  days: AmapWeatherDay[];
};
