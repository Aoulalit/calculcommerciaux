const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "pricing.json");

const FIELD_KEYS = [
  "baseCourse",
  "pricePerKm",
  "pricePerMinute",
  "hourlyRate",
  "minimumHours",
  "forfaitPrice",
  "vatPct",
  "nightPct",
  "weekendPct",
  "discountPct"
];

const defaultConfig = {
  baseCourse: { value: 0, enabled: true },
  pricePerKm: { value: 1, enabled: true },
  pricePerMinute: { value: 0, enabled: true },
  hourlyRate: { value: 0, enabled: true },
  minimumHours: { value: 0, enabled: true },
  forfaitPrice: { value: 25, enabled: true },
  vatPct: { value: 20, enabled: true },
  nightPct: { value: 15, enabled: true },
  weekendPct: { value: 20, enabled: true },
  discountPct: { value: 0, enabled: true }
};

function loadFromDisk() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(defaultConfig, null, 2));
      return { ...defaultConfig };
    }

    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw);

    const merged = {};
    FIELD_KEYS.forEach((key) => {
      merged[key] = {
        value:
          parsed[key] && Number.isFinite(Number(parsed[key].value))
            ? Number(parsed[key].value)
            : defaultConfig[key].value,
        enabled:
          parsed[key] && typeof parsed[key].enabled === "boolean"
            ? parsed[key].enabled
            : true
      };
    });

    return merged;
  } catch (error) {
    console.error("Erreur lecture pricing.json, fallback sur les valeurs par défaut", error);
    return { ...defaultConfig };
  }
}

function saveToDisk(config) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(config, null, 2));
}

let config = loadFromDisk();

function getConfig() {
  return config;
}

function updateConfig(partial) {
  const next = { ...config };

  FIELD_KEYS.forEach((key) => {
    if (partial[key]) {
      const incoming = partial[key];
      next[key] = {
        value:
          incoming.value !== undefined && Number.isFinite(Number(incoming.value))
            ? Number(incoming.value)
            : next[key].value,
        enabled:
          typeof incoming.enabled === "boolean"
            ? incoming.enabled
            : next[key].enabled
      };
    }
  });

  config = next;
  saveToDisk(config);

  return config;
}

module.exports = {
  FIELD_KEYS,
  getConfig,
  updateConfig
};