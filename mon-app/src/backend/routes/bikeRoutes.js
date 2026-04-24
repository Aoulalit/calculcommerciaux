const express = require("express");
const router = express.Router();

const ORS_API_KEY = process.env.ORS_API_KEY || "";

async function geocodeAddress(address) {
  const url = `https://api.openrouteservice.org/geocode/search?api_key=${encodeURIComponent(
    ORS_API_KEY
  )}&text=${encodeURIComponent(address)}&size=1`;

  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Erreur géocodage ORS: ${text}`);
  }

  const data = await response.json();
  const feature = data?.features?.[0];

  if (!feature?.geometry?.coordinates) {
    throw new Error(`Adresse introuvable : ${address}`);
  }

  return {
    coords: feature.geometry.coordinates,
    label: feature.properties?.label || address
  };
}

async function getBikeRoute(fromCoords, toCoords) {
  const response = await fetch(
    "https://api.openrouteservice.org/v2/directions/cycling-regular/geojson",
    {
      method: "POST",
      headers: {
        Authorization: ORS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        coordinates: [fromCoords, toCoords]
      })
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Erreur routing ORS: ${text}`);
  }

  const data = await response.json();
  const feature = data?.features?.[0];
  const summary = feature?.properties?.summary;

  if (!summary) {
    throw new Error("Aucun itinéraire vélo trouvé.");
  }

  return {
    distanceKm: summary.distance / 1000,
    minutes: summary.duration / 60,
    geometry: feature.geometry || null
  };
}

router.post("/bike", async (req, res) => {
  try {
    const { departureAddress, arrivalAddress } = req.body || {};

    if (!ORS_API_KEY) {
      return res.status(500).json({
        message: "ORS_API_KEY manquante dans le backend."
      });
    }

    if (!departureAddress || !arrivalAddress) {
      return res.status(400).json({
        message: "departureAddress et arrivalAddress sont obligatoires."
      });
    }

    const from = await geocodeAddress(departureAddress);
    const to = await geocodeAddress(arrivalAddress);
    const route = await getBikeRoute(from.coords, to.coords);

    return res.json({
      departureAddress: from.label,
      arrivalAddress: to.label,
      departureCoords: from.coords,
      arrivalCoords: to.coords,
      distanceKm: Number(route.distanceKm.toFixed(2)),
      minutes: Math.ceil(route.minutes),
      routeProvider: "openrouteservice / cycling-regular",
      geometry: route.geometry
    });
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Erreur lors du calcul de trajet vélo."
    });
  }
});

module.exports = router;