const cityProfiles = {
  mumbai: { zoneRisk: 0.58, trafficRisk: 0.62, climateRisk: 0.68, volatility: 0.64 },
  delhi: { zoneRisk: 0.82, trafficRisk: 0.68, climateRisk: 0.57, volatility: 0.6 },
  bangalore: { zoneRisk: 0.51, trafficRisk: 0.74, climateRisk: 0.42, volatility: 0.5 },
  hyderabad: { zoneRisk: 0.49, trafficRisk: 0.57, climateRisk: 0.49, volatility: 0.47 },
  chennai: { zoneRisk: 0.56, trafficRisk: 0.54, climateRisk: 0.63, volatility: 0.58 },
  kolkata: { zoneRisk: 0.64, trafficRisk: 0.59, climateRisk: 0.61, volatility: 0.56 }
};

const defaultCityProfile = { zoneRisk: 0.55, trafficRisk: 0.55, climateRisk: 0.52, volatility: 0.5 };

module.exports = {
  cityProfiles,
  defaultCityProfile
};
