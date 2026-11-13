// Fills the dashboard stocks table from /api/stocks and refreshes it every few
// seconds so the price generator's changes show up without reloading.
(() => {
  const REFRESH_MS = 5000;
  const body = document.getElementById("stocksBody");
  if (!body) return;

  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });
  const whole = new Intl.NumberFormat("en-US");

  function cell(text, className) {
    const td = document.createElement("td");
    td.textContent = text;
    if (className) td.className = className;
    return td;
  }

  function message(text) {
    const tr = document.createElement("tr");
    const td = cell(text);
    td.colSpan = 10;
    tr.appendChild(td);
    body.replaceChildren(tr);
  }

  function render(stocks) {
    if (!stocks.length) return message("No stocks are available yet.");

    const rows = stocks.map((s) => {
      const tr = document.createElement("tr");
      const change = Number(s.changePercent);
      const changeClass =
        change > 0
          ? "change-positive"
          : change < 0
            ? "change-negative"
            : "change-neutral";
      const sign = change > 0 ? "+" : "";

      tr.appendChild(cell(s.ticker));
      tr.appendChild(cell(s.companyName));
      tr.appendChild(cell(money.format(Number(s.price)), "numeric"));
      tr.appendChild(
        cell(`${sign}${change.toFixed(2)}%`, `numeric ${changeClass}`),
      );
      tr.appendChild(cell(money.format(Number(s.openPrice)), "numeric"));
      tr.appendChild(cell(money.format(Number(s.dayHigh)), "numeric"));
      tr.appendChild(cell(money.format(Number(s.dayLow)), "numeric"));
      tr.appendChild(cell(whole.format(Number(s.volume)), "numeric"));
      tr.appendChild(cell(money.format(Number(s.marketCap)), "numeric"));

      const action = document.createElement("td");
      const button = document.createElement("button");
      button.className = "view-button";
      button.type = "button";
      button.textContent = "View";
      action.appendChild(button);
      tr.appendChild(action);
      return tr;
    });
    body.replaceChildren(...rows);
  }

  async function load() {
    try {
      const res = await fetch("/api/stocks");
      if (res.status === 401) return; // session.js sends the user to login page
      if (!res.ok) throw new Error("Request failed");
      render((await res.json()).stocks);
    } catch {
      // Keep showing last good table if a refresh fails; only say so so first load.
      if (body.querySelector("[data-loading]"))
        message("Could not load stocks. Please refresh the page.");
    }
  }

// Market status box" "Open" (green) or "Closed" (red)
// Hovering over it shows the market hours, or why it is closed (holiday, weekend).
  const marketStatus = document.getElementById("marketStatus");

  async function loadMarketStatus() {
    if (!marketStatus) return;
    try {
      const res = await fetch("/api/market/status");
      if (!res.ok) throw new Error("Request failed");
      const status = await res.json();
      marketStatus.textContent = status.open ? "Open" : "Closed";
      marketStatus.className = `summary-value ${status.open ? "change-positive" : "change-negative"}`;
      marketStatus.title = status.reason;
    } catch {
      marketStatus.textContent = "Unavailable";
      marketStatus.className = "summary-value";
      marketStatus.title = "";
    }
  }

  const portfolioValue = document.getElementById("portfolioValue");

  async function loadPortfolioValue() {
    if (!portfolioValue) return;
    try {
      const res = await fetch("/api/portfolio");
      if (res.status === 401) return; // session.js sends the user to login page
      if (!res.ok) throw new Error("Request failed");
      portfolioValue.textContent = money.format(
        Number((await res.json()).portfolioValue),
      );
    } catch {
      portfolioValue.textContent = "Unavailable";
    }
  }

  function refreshAll() {
    load();
    loadMarketStatus();
    loadPortfolioValue();
  }

  refreshAll();
  setInterval(() => {
    if (!document.hidden) refreshAll();
  }, REFRESH_MS);
})();