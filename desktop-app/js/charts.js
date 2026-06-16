/* ═══════════════════════════════════════════════════════════════════════════
   charts.js — Real-time Chart.js graphs for dashboard
   ═══════════════════════════════════════════════════════════════════════════ */

const Charts = {
  _instances: {},
  _data: { cpu: [], ram: [], ping: [], events: [], labels: [] },
  _maxPoints: 60,
  _period: 60,

  init() {
    const commonOpts = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      scales: {
        x: { display: false },
        y: {
          display: true,
          grid: { color: "rgba(45,58,79,0.4)" },
          ticks: { color: "#64748b", font: { size: 10 } },
        },
      },
      plugins: { legend: { display: false } },
      elements: { point: { radius: 0 }, line: { borderWidth: 1.5, tension: 0.35 } },
    };

    this._instances.cpu = new Chart(document.getElementById("chart-cpu"), {
      type: "line",
      data: {
        labels: [],
        datasets: [{ data: [], borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.06)", fill: true }],
      },
      options: { ...commonOpts, scales: { ...commonOpts.scales, y: { ...commonOpts.scales.y, max: 100 } } },
    });

    this._instances.ram = new Chart(document.getElementById("chart-ram"), {
      type: "line",
      data: {
        labels: [],
        datasets: [{ data: [], borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.06)", fill: true }],
      },
      options: commonOpts,
    });

    this._instances.ping = new Chart(document.getElementById("chart-ping"), {
      type: "line",
      data: {
        labels: [],
        datasets: [{ data: [], borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.06)", fill: true }],
      },
      options: commonOpts,
    });

    this._instances.events = new Chart(document.getElementById("chart-events"), {
      type: "bar",
      data: {
        labels: [],
        datasets: [{ data: [], backgroundColor: "rgba(139,92,246,0.5)", borderColor: "#8b5cf6", borderWidth: 1 }],
      },
      options: { ...commonOpts, elements: { point: { radius: 0 } } },
    });
  },

  record(cpu, ram, ping, events) {
    const now = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    this._data.labels.push(now);
    this._data.cpu.push(cpu);
    this._data.ram.push(ram);
    this._data.ping.push(ping);
    this._data.events.push(events);

    if (this._data.labels.length > this._maxPoints) {
      this._data.labels.shift();
      this._data.cpu.shift();
      this._data.ram.shift();
      this._data.ping.shift();
      this._data.events.shift();
    }
    this._update();
  },

  _update() {
    for (const key of ["cpu", "ram", "ping", "events"]) {
      const inst = this._instances[key];
      if (!inst) continue;
      inst.data.labels = this._data.labels;
      inst.data.datasets[0].data = this._data[key];
      inst.update("none");
    }
  },

  setPeriod(minutes) {
    this._period = minutes;
    if (minutes === 60) this._maxPoints = 60;
    else if (minutes === 1440) this._maxPoints = 144;
    else this._maxPoints = 720;

    while (this._data.labels.length > this._maxPoints) {
      this._data.labels.shift();
      this._data.cpu.shift();
      this._data.ram.shift();
      this._data.ping.shift();
      this._data.events.shift();
    }
    this._update();
  },
};

// Period selector
Store.on("init", () => {
  document.querySelectorAll(".period-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".period-btn").forEach((b) => b.classList.remove("active"));
      this.classList.add("active");
      Charts.setPeriod(parseInt(this.dataset.period));
    });
  });
});
