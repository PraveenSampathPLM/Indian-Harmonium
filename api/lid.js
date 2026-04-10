export default function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({
    angle: null,
    isOpen: true,
    changedAt: Date.now(),
    source: "vercel-fallback",
    sensorMode: "state",
    available: false,
    delta: 0
  });
}
