/**
 * scienceToolkit.ts — Science & Physics utilities
 * Called by Quant (the AI brain) via tool handlers in agentToolsExtended.ts
 */

// ─── Physics calculator ─────────────────────────────────────────────────────
export function physicsCalculator(formula: string, values: string): string {
  const v = values.split(",").map(Number);
  const formulas: Record<string, () => string> = {
    "F=ma": () => `Force = ${v[0] * v[1]} N (mass=${v[0]} kg, acceleration=${v[1]} m/s²)`,
    "E=mc2": () => `Energy = ${v[0] * 8.98755179e16} J (mass=${v[0]} kg)`,
    "P=IV": () => `Power = ${v[0] * v[1]} W (current=${v[0]} A, voltage=${v[1]} V)`,
    "P=Fv": () => `Power = ${v[0] * v[1]} W (force=${v[0]} N, velocity=${v[1]} m/s)`,
    "W=Fd": () => `Work = ${v[0] * v[1]} J (force=${v[0]} N, distance=${v[1]} m)`,
    "p=mv": () => `Momentum = ${v[0] * v[1]} kg·m/s (mass=${v[0]} kg, velocity=${v[1]} m/s)`,
    "P=ρgh": () =>
      `Pressure = ${(v[0] * v[1] * v[2]).toExponential(2)} Pa (density=${v[0]} kg/m³, gravity=${v[1]} m/s², height=${v[2]} m)`,
  };
  const calc = formulas[formula];
  return calc
    ? calc()
    : `Unknown formula: ${formula}. Available: ${Object.keys(formulas).join(", ")}`;
}

// ─── Ohm's law calc ──────────────────────────────────────────────────────────
export function ohmsLawCalc(
  voltage: number,
  current: number,
  resistance: number,
  power: number,
): string {
  const results: Record<string, number> = {};
  if (voltage && current) {
    results.resistance = voltage / current;
    results.power = voltage * current;
  } else if (voltage && resistance) {
    results.current = voltage / resistance;
    results.power = (voltage * voltage) / resistance;
  } else if (current && resistance) {
    results.voltage = current * resistance;
    results.power = current * current * resistance;
  } else if (power && voltage) {
    results.current = power / voltage;
    results.resistance = (voltage * voltage) / power;
  } else if (power && current) {
    results.voltage = power / current;
    results.resistance = power / (current * current);
  } else if (power && resistance) {
    results.current = Math.sqrt(power / resistance);
    results.voltage = Math.sqrt(power * resistance);
  } else return "Provide exactly 2 known values";
  return JSON.stringify(results, null, 2);
}

// ─── Wavelength/frequency ───────────────────────────────────────────────────
export function wavelengthFrequency(value: number, type: string): string {
  const c = 299792458; // speed of light m/s
  const h = 6.62607015e-34; // Planck constant
  if (type === "wavelength") {
    const freq = c / value;
    const energy = h * freq;
    return `Wavelength: ${value} m\nFrequency: ${(freq / 1e9).toFixed(2)} GHz\nEnergy: ${energy.toExponential(2)} J (${(energy / 1.602e-19).toFixed(2)} eV)`;
  } else {
    const wavelength = c / value;
    const energy = h * value;
    return `Frequency: ${(value / 1e9).toFixed(2)} GHz\nWavelength: ${wavelength.toExponential(2)} m\nEnergy: ${energy.toExponential(2)} J (${(energy / 1.602e-19).toFixed(2)} eV)`;
  }
}

// ─── Radioactive decay calc ──────────────────────────────────────────────────
export function radioactiveDecayCalc(
  initialAmount: number,
  halfLife: number,
  time: number,
): string {
  const remaining = initialAmount * Math.pow(0.5, time / halfLife);
  const decayed = initialAmount - remaining;
  return JSON.stringify(
    {
      initialAmount,
      halfLife,
      time,
      remaining: parseFloat(remaining.toFixed(6)),
      decayed: parseFloat(decayed.toFixed(6)),
      decayConstant: parseFloat((Math.log(2) / halfLife).toExponential(4)),
    },
    null,
    2,
  );
}

// ─── Unit convert scientific ─────────────────────────────────────────────────
export function unitConvertScientific(value: number, fromUnit: string, toUnit: string): string {
  const conversions: Record<string, number> = {
    m: 1,
    km: 1000,
    cm: 0.01,
    mm: 0.001,
    mi: 1609.344,
    ft: 0.3048,
    in: 0.0254,
    kg: 1,
    g: 0.001,
    lb: 0.453592,
    oz: 0.0283495,
    ton: 1000,
    s: 1,
    min: 60,
    hr: 3600,
    day: 86400,
    year: 31536000,
    J: 1,
    kJ: 1000,
    cal: 4.184,
    kcal: 4184,
    eV: 1.602e-19,
    kWh: 3.6e6,
    K: 1,
    C: 1,
    F: 5 / 9,
    Pa: 1,
    kPa: 1000,
    MPa: 1e6,
    bar: 1e5,
    atm: 101325,
    psi: 6894.76,
    Hz: 1,
    kHz: 1000,
    MHz: 1e6,
    GHz: 1e9,
  };
  const fromFactor = conversions[fromUnit];
  const toFactor = conversions[toUnit];
  if (!fromFactor || !toFactor)
    return `Unknown unit. Available: ${Object.keys(conversions).join(", ")}`;

  if (fromUnit === "C" && toUnit === "F")
    return `${value}°C = ${((value * 9) / 5 + 32).toFixed(2)}°F`;
  if (fromUnit === "F" && toUnit === "C")
    return `${value}°F = ${(((value - 32) * 5) / 9).toFixed(2)}°C`;
  if (fromUnit === "C" && toUnit === "K") return `${value}°C = ${(value + 273.15).toFixed(2)} K`;
  if (fromUnit === "K" && toUnit === "C") return `${value} K = ${(value - 273.15).toFixed(2)}°C`;

  const result = (value * fromFactor) / toFactor;
  return `${value} ${fromUnit} = ${result.toExponential(4)} ${toUnit}`;
}

// ─── Molar mass calc ────────────────────────────────────────────────────────
export function molarMassCalc(formula: string): string {
  const atomicMasses: Record<string, number> = {
    H: 1.008,
    He: 4.003,
    Li: 6.941,
    Be: 9.012,
    B: 10.81,
    C: 12.011,
    N: 14.007,
    O: 15.999,
    F: 18.998,
    Ne: 20.18,
    Na: 22.99,
    Mg: 24.305,
    Al: 26.982,
    Si: 28.086,
    P: 30.974,
    S: 32.065,
    Cl: 35.45,
    K: 39.098,
    Ar: 39.948,
    Ca: 40.078,
    Fe: 55.845,
    Cu: 63.546,
    Zn: 65.38,
    Ag: 107.868,
    Au: 196.967,
    Pb: 207.2,
    U: 238.029,
  };
  const tokens = formula.match(/([A-Z][a-z]?)(\d*)/g) || [];
  let total = 0;
  const breakdown: { element: string; count: number; mass: number }[] = [];
  for (const token of tokens) {
    const match = token.match(/([A-Z][a-z]?)(\d*)/);
    if (!match) continue;
    const element = match[1];
    const count = parseInt(match[2] || "1");
    const mass = atomicMasses[element];
    if (!mass) return `Unknown element: ${element}`;
    total += mass * count;
    breakdown.push({ element, count, mass: parseFloat((mass * count).toFixed(3)) });
  }
  return JSON.stringify({ formula, molarMass: parseFloat(total.toFixed(3)), breakdown }, null, 2);
}

// ─── Chemical equation balancer ──────────────────────────────────────────────
export function chemicalEquationBalancer(equation: string): string {
  return `Chemical equation balancing for: ${equation}\n\nNote: This is a complex task. For simple equations, try:\n  - Count atoms on each side\n  - Adjust coefficients\n  - Verify balance\n\nExample: H2 + O2 -> H2O\n  Balanced: 2H2 + O2 -> 2H2O`;
}

// ─── pH calculator ───────────────────────────────────────────────────────────
export function phCalculator(concentration: number, type: string): string {
  if (type === "acid") {
    const pH = -Math.log10(concentration);
    return `pH = ${pH.toFixed(2)} (acid, [H+] = ${concentration} M)`;
  } else {
    const pOH = -Math.log10(concentration);
    const pH = 14 - pOH;
    return `pH = ${pH.toFixed(2)} (base, [OH-] = ${concentration} M, pOH = ${pOH.toFixed(2)})`;
  }
}

// ─── Ideal gas law ───────────────────────────────────────────────────────────
export function idealGasLaw(
  pressure: number,
  volume: number,
  moles: number,
  temperature: number,
  solveFor: string,
): string {
  const R = 0.0821; // L·atm/(mol·K)
  if (solveFor === "pressure") return `P = ${((moles * R * temperature) / volume).toFixed(2)} atm`;
  if (solveFor === "volume") return `V = ${((moles * R * temperature) / pressure).toFixed(2)} L`;
  if (solveFor === "moles")
    return `n = ${((pressure * volume) / (R * temperature)).toFixed(4)} mol`;
  if (solveFor === "temperature") return `T = ${((pressure * volume) / (moles * R)).toFixed(2)} K`;
  return "Specify solveFor: pressure, volume, moles, or temperature";
}

// ─── Kinematics calc ─────────────────────────────────────────────────────────
export function kinematicsCalc(v0: number, a: number, t: number): string {
  const v = v0 + a * t;
  const d = v0 * t + 0.5 * a * t * t;
  return JSON.stringify(
    {
      initialVelocity: v0,
      acceleration: a,
      time: t,
      finalVelocity: parseFloat(v.toFixed(4)),
      distance: parseFloat(d.toFixed(4)),
    },
    null,
    2,
  );
}

// ─── Optics calc ─────────────────────────────────────────────────────────────
export function opticsCalc(focalLength: number, objectDistance: number): string {
  if (objectDistance === 0) return "Object distance cannot be 0";
  const imageDistance = (focalLength * objectDistance) / (objectDistance - focalLength);
  const magnification = -imageDistance / objectDistance;
  return JSON.stringify(
    {
      focalLength,
      objectDistance,
      imageDistance: parseFloat(imageDistance.toFixed(4)),
      magnification: parseFloat(magnification.toFixed(4)),
      real: imageDistance > 0,
      inverted: magnification < 0,
    },
    null,
    2,
  );
}

// ─── Electric field calc ─────────────────────────────────────────────────────
export function electricFieldCalc(charge: number, distance: number): string {
  const k = 8.98755179e9; // Coulomb's constant
  const E = (k * charge) / (distance * distance);
  return `Electric field at ${distance} m from charge ${charge} C:\n  E = ${E.toExponential(4)} N/C`;
}

// ─── Thermal expansion calc ──────────────────────────────────────────────────
export function thermalExpansionCalc(
  initialLength: number,
  coefficient: number,
  tempChange: number,
): string {
  const deltaL = initialLength * coefficient * tempChange;
  const finalLength = initialLength + deltaL;
  return JSON.stringify(
    {
      initialLength,
      coefficient,
      tempChange,
      deltaL: parseFloat(deltaL.toExponential(4)),
      finalLength: parseFloat(finalLength.toExponential(4)),
    },
    null,
    2,
  );
}

// ─── Astronomical distance ───────────────────────────────────────────────────
export function astronomicalDistance(value: number, fromUnit: string, toUnit: string): string {
  const conversions: Record<string, number> = {
    m: 1,
    km: 1e3,
    AU: 1.496e11,
    ly: 9.461e15,
    pc: 3.086e16,
    Mpc: 3.086e22,
  };
  const from = conversions[fromUnit];
  const to = conversions[toUnit];
  if (!from || !to) return `Unknown unit. Available: ${Object.keys(conversions).join(", ")}`;
  const result = (value * from) / to;
  return `${value} ${fromUnit} = ${result.toExponential(4)} ${toUnit}`;
}
