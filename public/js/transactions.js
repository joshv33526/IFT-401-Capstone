// Transaction History page: loads the user's history from /api/transactions.
// Fills the table, and handles the data / type filters.
// Login check, welcome name and Log Out are all handled by js/session.js.
const filterForm = document.getElementById("transactionFilters");
const fromInput = document.getElementById("filterFrom");
const toInput = document.getElementById("filterTo");
const typeSelect = document.getElementById("filterType");
const applyButton = filterForm.querySelector('button[type="submit"]');

const table = document.getElementById("transactionsTable");
const tbody = document.getElementById("transactionsBody");
const emptyMessage = document.getElementById("transactionsEmpty");
const resultsCount = document.getElementById("resultsCount");
const cashBalance = document.getElementById("cashBalance");
const transactionTotal = document.getElementById("transactionTotal");

// Formatting Helpers
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

// How the database types are shown. "sign" decides +/- on the Amount column:
// money coming IN (deposit, sale) is positive, money going OUT is negative.
const TYPES = {
  CANCELLED: { label: "Cancelled", badge: "", sign: 0 },
  BUY: { label: "Bought", badge: "type-bought", sign: -1 },
  SELL: { label: "Sold", badge: "type-sold", sign: 1 },
  DEPOSIT: { label: "Deposit", badge: "type-deposit", sign: 1 },
  WITHDRAWAL: { label: "Withdrawal", badge: "type-withdrawal", sign: -1 },
};

function money(value) {
  return currency.format(Number(value));
}

// Builds a <td> = Text is always set with textContent,
// prevents anything from the server being ran as HTML or script (prevents XSS).
function cell(text, className = "") {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

// Render
function buildRow(txn) {
  const info = TYPES[txn.type] || { label: txn.type, badge: "", sign: 1 };
  const isTrade = txn.ticker !== null;
  const cancelled = txn.type === "CANCELLED";
  const row = document.createElement("tr");

  // Date with time shown on hover over.
  const when = new Date(txn.date);
  const dateCell = document.createElement("td");
  const time = document.createElement("time");
  time.dateTime = txn.date;
  time.textContent = dateFormat.format(when);
  time.title = timeFormat.format(when);
  dateCell.append(time);
  if (txn.dateIsPlacement) {
    dateCell.append(document.createTextNode(" (placed)"));
    time.title += " — order placement time; cancellation time is not recorded";
  }

  // Type badge
  const typeCell = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = `type-badge ${info.badge}`;
  badge.textContent = cancelled ? `Cancelled ${txn.side === "SELL" ? "Sell" : "Buy"}` : info.label;
  typeCell.append(badge);

  // Deposits and withdrawals have no ticker, quantity or price.
  const signed = info.sign * Number(txn.amount);
  const amountText = (signed >= 0 ? "+" : "-") + money(Math.abs(signed));

  row.append(
    dateCell,
    typeCell,
    isTrade ? cell(txn.ticker) : cell("-", "muted"),
    isTrade
      ? cell(txn.quantity.toLocaleString("en-US"), "numeric")
      : cell("-", "numeric muted"),
    isTrade && !cancelled ? cell(money(txn.price), "numeric") : cell("—", "numeric muted"),
    cancelled ? cell(money(0), "numeric muted") : cell(amountText, `numeric ${signed >= 0 ? "positive" : "negative"}`),
    txn.balanceAfter == null ? cell("—", "numeric muted") : cell(money(txn.balanceAfter), "numeric"),
  );
  return row;
}

function showTransactions(data, filtered) {
  tbody.replaceChildren(...data.transactions.map(buildRow));

  const hasRows = data.count > 0;
  table.hidden = !hasRows;
  emptyMessage.hidden = hasRows;
  if (!hasRows) {
    emptyMessage.textContent = filtered
      ? "No transactions match these chosen filters."
      : "No transactions yet. Deposit cash to start trading.";
  }

  const noun = data.count === 1 ? "transaction" : "transactions";
  resultsCount.textContent = !hasRows
    ? "0 transactions found."
    : data.limited
      ? `Showing the ${data.count} most recent ${noun}. Narrow the dates to see older ones.`
      : `Showing ${data.count} ${noun}, most recent first.`;
}

// Load Data
// Turns date boxes into exact moments for the user's own time zone.
// "To" includes the whole day, so we send midnight at the START of next day.
// and the server will return everything before it.
function readFilters() {
  const params = new URLSearchParams();
  if (typeSelect.value !== "all") params.set("type", typeSelect.value);
  if (fromInput.value) {
    params.set("from", new Date(`${fromInput.value}T00:00:00`).toISOString());
  }
  if (toInput.value) {
    const dayAfter = new Date(`${toInput.value}T00:00:00`);
    dayAfter.setDate(dayAfter.getDate() + 1);
    params.set("to", dayAfter.toISOString());
  }
  return params;
}

async function getJson(url) {
  const res = await fetch(url);
  if (res.status === 401) {
    window.location.href = "login.html";
    throw new Error("Not logged in");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.details
      ? data.details.map((d) => d.message).join(", ")
      : data.error;
    throw new Error(detail || "Request failed");
  }
  return data;
}

let latestRequest = 0; // ignores slower, out of date responses if filters are changed quickly.

async function loadTransactions() {
  const params = readFilters();
  const filtered = params.toString() !== "";
  const requestId = ++latestRequest;

  applyButton.disabled = true;
  resultsCount.textContent = "Loading transactions...";
  try {
    const data = await getJson(
      `/api/transactions${filtered ? `?${params}` : ""}`,
    );
    if (requestId !== latestRequest) return;
    showTransactions(data, filtered);
    // Summary box shows overall total, so only set from an unfiltered load.
    if (!filtered)
      transactionTotal.textContent = data.limited
        ? `${data.count}+`
        : String(data.count);
  } catch (err) {
    if (requestId !== latestRequest) return;
    resultsCount.textContent = `Could not load transactions: ${err.message}`;
  } finally {
    if (requestId === latestRequest) applyButton.disabled = false;
  }
}

async function loadBalance() {
  try {
    const data = await getJson("/api/cash/balance");
    cashBalance.textContent = money(data.balance);
  } catch {
    cashBalance.textContent = "Unavailable";
  }
}

// Filters
// Stops the date pickers from choosing an impossible range.
function syncDateLimits() {
  const today = new Date();
  const localToday = new Date(
    today.getTime() - today.getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 10);
  fromInput.max = toInput.value || localToday;
  toInput.min = fromInput.value;
  toInput.max = localToday;
}

filterForm.addEventListener("submit", (e) => {
  e.preventDefault(); // stay on page instead of reloading it.
  if (fromInput.value && toInput.value && fromInput.value > toInput.value) {
    resultsCount.textContent =
      "The From date must be on or before the To date.";
    return;
  }
  loadTransactions();
});

// "Clear" resets the current form: the browser will clear fields after this event,
// so wait a single tick before reloading the full list.
filterForm.addEventListener("reset", () => {
  setTimeout(() => {
    syncDateLimits();
    loadTransactions();
  }, 0);
});

fromInput.addEventListener("change", syncDateLimits);
toInput.addEventListener("change", syncDateLimits);

//Start
syncDateLimits();
loadBalance();
loadTransactions();
