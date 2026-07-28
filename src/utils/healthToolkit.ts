/**
 * healthToolkit.ts — Health & Wellness utilities
 * Called by Quant (the AI brain) via tool handlers in agentToolsExtended.ts
 */

// ─── Water intake calc ──────────────────────────────────────────────────────
export function waterIntakeCalc(weightKg: number, activityMinutes: number): string {
  const base = weightKg * 35; // 35ml per kg
  const activity = activityMinutes * 12; // 12ml per minute of exercise
  const total = (base + activity) / 1000;
  return JSON.stringify(
    {
      weightKg,
      activityMinutes,
      recommendedIntake: `${total.toFixed(1)} liters/day`,
      baseRequirement: `${(base / 1000).toFixed(1)} L`,
      activityAddition: `${(activity / 1000).toFixed(1)} L`,
    },
    null,
    2,
  );
}

// ─── Heart rate zone ────────────────────────────────────────────────────────
export function heartRateZone(age: number, restingHr: number): string {
  const maxHr = 220 - age;
  const zones = [
    {
      name: "Zone 1 (Recovery)",
      range: `${Math.round(maxHr * 0.5)}-${Math.round(maxHr * 0.6)} bpm`,
      percentage: "50-60%",
    },
    {
      name: "Zone 2 (Fat Burn)",
      range: `${Math.round(maxHr * 0.6)}-${Math.round(maxHr * 0.7)} bpm`,
      percentage: "60-70%",
    },
    {
      name: "Zone 3 (Aerobic)",
      range: `${Math.round(maxHr * 0.7)}-${Math.round(maxHr * 0.8)} bpm`,
      percentage: "70-80%",
    },
    {
      name: "Zone 4 (Anaerobic)",
      range: `${Math.round(maxHr * 0.8)}-${Math.round(maxHr * 0.9)} bpm`,
      percentage: "80-90%",
    },
    {
      name: "Zone 5 (Max Effort)",
      range: `${Math.round(maxHr * 0.9)}-${maxHr} bpm`,
      percentage: "90-100%",
    },
  ];
  return JSON.stringify({ age, maxHr, restingHr, zones }, null, 2);
}

// ─── Body fat percentage calc ───────────────────────────────────────────────
export function bodyFatPercentageCalc(
  gender: string,
  heightCm: number,
  neckCm: number,
  waistCm: number,
  hipCm: number,
): string {
  let bodyFat: number;
  if (gender === "male") {
    bodyFat =
      495 / (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) -
      450;
  } else {
    bodyFat =
      495 /
        (1.29579 - 0.35004 * Math.log10(waistCm + hipCm - neckCm) + 0.221 * Math.log10(heightCm)) -
      450;
  }
  const category =
    bodyFat < 10
      ? "Essential fat"
      : bodyFat < 20
        ? "Athletic"
        : bodyFat < 25
          ? "Fitness"
          : bodyFat < 32
            ? "Average"
            : "Obese";
  return JSON.stringify({ gender, bodyFat: `${bodyFat.toFixed(1)}%`, category }, null, 2);
}

// ─── Ideal weight calc ──────────────────────────────────────────────────────
export function idealWeightCalc(gender: string, heightCm: number): string {
  const heightIn = heightCm / 2.54;
  const formulas = {
    devine: gender === "male" ? 50 + 2.3 * (heightIn - 60) : 45.5 + 2.3 * (heightIn - 60),
    robinson: gender === "male" ? 52 + 1.9 * (heightIn - 60) : 49 + 1.7 * (heightIn - 60),
    miller: gender === "male" ? 56.2 + 1.41 * (heightIn - 60) : 53.1 + 1.36 * (heightIn - 60),
    hamwi: gender === "male" ? 48 + 2.7 * (heightIn - 60) : 45.5 + 2.2 * (heightIn - 60),
  };
  return JSON.stringify(
    {
      gender,
      heightCm,
      idealWeights: Object.fromEntries(
        Object.entries(formulas).map(([k, v]) => [k, `${v.toFixed(1)} kg`]),
      ),
    },
    null,
    2,
  );
}

// ─── Pregnancy due date ──────────────────────────────────────────────────────
export function pregnancyDueDate(lastPeriod: string): string {
  const lmp = new Date(lastPeriod);
  const dueDate = new Date(lmp);
  dueDate.setDate(dueDate.getDate() + 280);
  const now = new Date();
  const weeksPregnant = Math.floor((now.getTime() - lmp.getTime()) / (7 * 86400000));
  return JSON.stringify(
    {
      lastMenstrualPeriod: lmp.toISOString().slice(0, 10),
      estimatedDueDate: dueDate.toISOString().slice(0, 10),
      currentWeek: weeksPregnant,
      daysRemaining: Math.floor((dueDate.getTime() - now.getTime()) / 86400000),
    },
    null,
    2,
  );
}

// ─── Ovulation calc ──────────────────────────────────────────────────────────
export function ovulationCalc(lastPeriod: string, cycleLength: number): string {
  const lmp = new Date(lastPeriod);
  const cycle = cycleLength || 28;
  const ovulation = new Date(lmp);
  ovulation.setDate(ovulation.getDate() + cycle - 14);
  const fertileStart = new Date(ovulation);
  fertileStart.setDate(fertileStart.getDate() - 5);
  const fertileEnd = new Date(ovulation);
  fertileEnd.setDate(fertileEnd.getDate() + 1);
  const nextPeriod = new Date(lmp);
  nextPeriod.setDate(nextPeriod.getDate() + cycle);
  return JSON.stringify(
    {
      lastPeriod: lmp.toISOString().slice(0, 10),
      cycleLength: cycle,
      ovulationDate: ovulation.toISOString().slice(0, 10),
      fertileWindow: `${fertileStart.toISOString().slice(0, 10)} to ${fertileEnd.toISOString().slice(0, 10)}`,
      nextPeriod: nextPeriod.toISOString().slice(0, 10),
    },
    null,
    2,
  );
}

// ─── Macro nutrient calc ────────────────────────────────────────────────────
export function macroNutrientCalc(weightKg: number, goal: string, activityLevel: string): string {
  const activityMultipliers: Record<string, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    veryActive: 1.9,
  };
  const goalMultipliers: Record<string, number> = { lose: 0.8, maintain: 1.0, gain: 1.15 };
  const bmr = 10 * weightKg + 625; // simplified
  const tdee = bmr * (activityMultipliers[activityLevel] || 1.2);
  const calories = tdee * (goalMultipliers[goal] || 1.0);
  const protein = weightKg * (goal === "gain" ? 2.2 : 1.6);
  const fat = (calories * 0.25) / 9;
  const carbs = (calories - protein * 4 - fat * 9) / 4;
  return JSON.stringify(
    {
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      targetCalories: Math.round(calories),
      protein: `${protein.toFixed(0)}g`,
      fat: `${fat.toFixed(0)}g`,
      carbs: `${carbs.toFixed(0)}g`,
    },
    null,
    2,
  );
}

// ─── Sleep quality score ────────────────────────────────────────────────────
export function sleepQualityScore(
  bedtime: string,
  wakeTime: string,
  awakenings: number,
  deepSleepPct: number,
): string {
  const bed = new Date(`2000-01-01T${bedtime}`);
  const wake = new Date(`2000-01-02T${wakeTime}`);
  const sleepHours = (wake.getTime() - bed.getTime()) / 3600000;
  const durationScore = sleepHours >= 7.5 ? 100 : sleepHours >= 6 ? 80 : sleepHours >= 5 ? 60 : 40;
  const awakeningScore = Math.max(0, 100 - awakenings * 15);
  const deepScore =
    deepSleepPct >= 20 ? 100 : deepSleepPct >= 15 ? 80 : deepSleepPct >= 10 ? 60 : 40;
  const overall = Math.round((durationScore + awakeningScore + deepScore) / 3);
  return JSON.stringify(
    {
      sleepHours: parseFloat(sleepHours.toFixed(1)),
      durationScore,
      awakeningScore,
      deepScore,
      overallScore: overall,
      rating:
        overall >= 80 ? "Excellent" : overall >= 60 ? "Good" : overall >= 40 ? "Fair" : "Poor",
    },
    null,
    2,
  );
}

// ─── Step to calorie ────────────────────────────────────────────────────────
export function stepToCalorie(steps: number, weightKg: number): string {
  const caloriesPerStep = 0.04 * (weightKg / 70);
  const totalCalories = steps * caloriesPerStep;
  return JSON.stringify(
    {
      steps,
      weightKg,
      caloriesBurned: parseFloat(totalCalories.toFixed(1)),
      equivalent: `${(totalCalories / 100).toFixed(1)} slices of bread`,
    },
    null,
    2,
  );
}

// ─── Hydration tracker ──────────────────────────────────────────────────────
export function hydrationTracker(glassesToday: number, weightKg: number): string {
  const target = Math.round((weightKg * 35) / 250); // 250ml per glass
  const consumed = glassesToday * 250;
  const targetMl = weightKg * 35;
  const percentage = Math.round((consumed / targetMl) * 100);
  return JSON.stringify(
    {
      glassesConsumed: glassesToday,
      targetGlasses: target,
      consumedMl: consumed,
      targetMl,
      percentage,
      status: percentage >= 100 ? "✅ Goal reached!" : `Need ${target - glassesToday} more glasses`,
    },
    null,
    2,
  );
}
