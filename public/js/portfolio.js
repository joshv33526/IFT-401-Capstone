// Easy Stock Solutions - Portfolio Page
// Loads the logged-in user's real cash, holdings and gain/loss from /api/portfolio.

const portfolioValue = document.getElementById("portfolioValue");
const totalGainLoss = document.getElementById("totalGainLoss");
const cashAvailable = document.getElementById("cashAvailable");
const holdingsBody = document.getElementById("holdingsBody");

function formatMoney(value) {
  return Number(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

// +$10.00 / -$10.00 / $0.00
function formatChange(value) {
  const n = Number(value);
  if (n === 0) return formatMoney(0);
  return (n > 0 ? "+" : "-") + formatMoney(Math.abs(n));
}

function changeClass(value) {
  const n = Number(value);
  if (n > 0) return "change-positive";
  if (n < 0) return "change-negative";
  return "";
}

// A single message row (empty portfolio or load error)
function showRowMessage(text) {
  holdingsBody.innerHTML = "";

  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = 7;
  td.textContent = text;
  tr.appendChild(td);
  holdingsBody.appendChild(tr);
}

function addCell(tr, text, className) {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  tr.appendChild(td);
}

async function loadPortfolio() {
  try {
    const res = await fetch("/api/portfolio");

    // Not logged in, go back to the login page
    if (res.status === 401) {
      window.location.href = "login.html";
      return;
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Unable to load your portfolio.");
    }

    // Top stats
    portfolioValue.textContent = formatMoney(data.portfolioValue);
    cashAvailable.textContent = formatMoney(data.cash);

    totalGainLoss.textContent = formatChange(data.totalGainLoss);
    totalGainLoss.className =
      "summary-value " + changeClass(data.totalGainLoss);

    // Holdings table
    if (data.holdings.length === 0) {
      showRowMessage(
        "You don't own any stocks yet. Use Trade Stocks to buy your first shares.",
      );
      return;
    }

    holdingsBody.innerHTML = "";

    data.holdings.forEach((h) => {
      const tr = document.createElement("tr");

      addCell(tr, h.ticker);
      addCell(tr, h.companyName);
      addCell(tr, h.shares);
      addCell(tr, formatMoney(h.avgPrice));
      addCell(tr, formatMoney(h.currentPrice));
      addCell(tr, formatChange(h.gainLoss), changeClass(h.gainLoss));

      const actionTd = document.createElement("td");
      const link = document.createElement("a");
      link.className = "view-button";
      link.href = "trade.html";
      link.textContent = "Trade";
      actionTd.appendChild(link);
      tr.appendChild(actionTd);

      holdingsBody.appendChild(tr);
    });
  } catch (error) {
    showRowMessage(error.message);
  }
}

loadPortfolio();
