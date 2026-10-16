// Admin Console page: create stocks, change market hours, trading days and closures.
// All data comes from /api/admin/... and /api/market/status.
// Login check, welcome name and Log Out are handled by js/session.js.

// -- PAGE ELEMENTS -- \\
const marketStatus = document.getElementById("marketStatus");
const stockCount = document.getElementById("stockCount");
const marketTimezone = document.getElementById("marketTimezone");

const createStockForm = document.getElementById("createStockForm");
const tickerInput = document.getElementById("tickerSymbol");
const createStockMessage = document.getElementById("createStockMessage");
const stocksBody = document.getElementById("adminStocksBody");

const currentOpenTime = document.getElementById("currentOpenTime");
const currentCloseTime = document.getElementById("currentCloseTime");
const marketHoursForm = document.getElementById("marketHoursForm");
const openTimeInput = document.getElementById("openTime");
const closeTimeInput = document.getElementById("closeTime");
const marketHoursMessage = document.getElementById("marketHoursMessage");

const tradingDaysForm = document.getElementById("tradingDaysForm");
const dayCheckboxes = tradingDaysForm.querySelectorAll('input[name="days"]');
const tradingDaysMessage = document.getElementById("tradingDaysMessage");

const addHolidayForm = document.getElementById("addHolidayForm");
const holidayDateInput = document.getElementById("holidayDate");
const holidayNameInput = document.getElementById("holidayName");
const addHolidayMessage = document.getElementById("addHolidayMessage");
const holidaysTable = document.getElementById("holidaysTable");
const holidaysBody = document.getElementById("holidaysBody");
const holidaysEmpty = document.getElementById("holidaysEmpty");

// -- FORMATTING HELPERS -- \\
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const timeFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  ear: "numeric",
});

const money = (value) => currency.format(Number(value));

// "14:00" = "2:00 PM"
function formatTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return timeFormat.format(new Date(2000, 0, 1, h, m));
}

// "2026-11-26" = "Nov 26, 2026"
function formatDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return dateFormat.format(new Date(y, m - 1, d));
}

// "America/New_York" = "Eastern Time"
function timezoneName(tz) {
  try {
    const part = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "longGeneric",
    })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName");
    return part ? `${part.value} (${tz})` : tz;
  } catch {
    return tz;
  }
}

// Builds a <td>
function cell(text, className = "") {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

// Shows a result under form, styled based upon "success/error" classes in components.css.
function showMessage(el, text, type) {
  el.textContent = text;
  el.className = `form-message ${type}`;
}

function clearMessage(el) {
  el.textContent = "";
  el.className = "form-message";
}

// -- TALKING TO THE SERVER -- \\
async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (res.status === 401) {
    window.location.href = "login.html"; // session expired
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

const sendJson = (method, url, payload) =>
  api(url, { method, body: JSON.stringify(payload) });

// Runs form submit: also disables button whilst waiting so it cannot be sent twice,
// also shows any error under the form.
async function handleSubmit(form, messageEl, work) {
  const button = form.querySelector('button[type="submit"]');
  clearMessage(messageEl);
  button.disabled = true;
  try {
    await work();
  } catch (err) {
    showMessage(messageEl, err.message, "error");
  } finally {
    button.disabled = false;
  }
}

// -- LOADING DATA -- \\
async function loadStatus() {
  try {
    const status = await api("/api/market/status");
    marketStatus.textContent = status.open ? "Open" : "Closed";
    marketStatus.className = `summary-value ${status.open ? "status-open" : "status-closed"}`;
    marketStatus.title = status.reason; // e.g. "Closed for Thanksgiving Day" on hover
    marketTimezone.textContent = timezoneName(status.timezone);
  } catch {
    marketStatus.textContent = "Unknown";
    marketStatus.className = "summary-value";
  }
}

async function loadStocks() {
  try {
    const data = await api("/api/admin/stocks");
    stocksBody.replaceChildren(
      ...data.stocks.map((s) => {
        const row = document.createElement("tr");
        row.append(
          cell(s.ticker),
          cell(s.companyName),
          cell(money(s.currentPrice), "numeric"),
          cell(money(s.initialPrice), "numeric"),
          cell(Number(s.volume).toLocaleString("en-US"), "numeric"),
        );
        return row;
      }),
    );
    stockCount.textContent = String(data.count);
  } catch (err) {
    showMessage(
      createStockMessage,
      `Could not load stocks: ${err.message}`,
      "error",
    );
  }
}

function showHolidays(holidays) {
  holidaysBody.replaceChildren(
    ...holidays.map((h) => {
      const row = document.createElement("tr");
      const dateCell = document.createElement("td");
      const time = document.createElement("time");
      time.dateTime = h.date;
      time.textContent = formatDate(h.date);
      dateCell.append(time);

      const actionCell = document.createElement("td");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove-button";
      remove.textContent = "Remove";
      remove.dataset.date = h.date;
      remove.dataset.name = h.name;
      remove.setAttribute("aria-label", `Remove ${h.name}`);
      actionCell.append(remove);

      row.append(dateCell, cell(h.name), actionCell);
      return row;
    }),
  );
  holidaysTable.hidden = holidays.length === 0;
  holidaysEmpty.hidden = holidays.length > 0;
}

async function loadSchedule() {
  try {
    const data = await api("/api/admin/market/schedule");
    currentOpenTime.textContent = formatTime(data.openTime);
    currentCloseTime.textContent = formatTime(data.closeTime);
    openTimeInput.value = data.openTime;
    closeTimeInput.value = data.closeTime;
    dayCheckboxes.forEach((box) => {
      box.checked = data.days.includes(box.value);
    });
    showHolidays(data.holidays);
  } catch (err) {
    showMessage(
      marketHoursMessage,
      `Could not load the market schedule: ${err.message}`,
      "error",
    );
  }
}

// -- CREATE STOCK -- \\
// Ticker must be uppercase; converts as admin types.
tickerInput.addEventListener("input", () => {
  tickerInput.value = tickerInput.value.toUpperCase();
});

createStockForm.addEventListener("submit", (e) => {
  e.preventDefault();
  handleSubmit(createStockForm, createStockMessage, async () => {
    const stock = await sendJson("POST", "/api/admin/stocks", {
      ticker: tickerInput.value.trim(),
      companyName: document.getElementById("companyName").value.trim(),
      initialPrice: document.getElementById("initialPrice").value,
      volume: document.getElementById("stockVolume").value,
    });
    createStockForm.reset();
    showMessage(
      createStockMessage,
      `${stock.ticker} (${stock.companyName}) is now listed at ${money(stock.initialPrice)}.`,
      "success",
    );
    await loadStocks();
  });
});

createStockForm.addEventListener("reset", () =>
  clearMessage(createStockMessage),
);

// -- MARKET HOURS -- \\
marketHoursForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (openTimeInput.value >= closeTimeInput.value) {
    showMessage(
      marketHoursMessage,
      "Open time must be earlier than close time.",
      "error",
    );
    return;
  }
  handleSubmit(marketHoursForm, marketHoursMessage, async () => {
    const hours = await sendJson("PUT", "/api/admin/market/hours", {
      openTime: openTimeInput.value,
      closeTime: closeTimeInput.value,
    });
    showMessage(
      marketHoursMessage,
      `Market hours are now ${formatTime(hours.openTime)} to ${formatTime(hours.closeTime)}.`,
      "success",
    );
    await Promise.all([loadSchedule(), loadStatus()]);
  });
});

// -- TRADING DAYS -- \\
tradingDaysForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const days = [...dayCheckboxes]
    .filter((box) => box.checked)
    .map((box) => box.value);
  if (
    days.length === 0 &&
    !confirm(
      "No days are selected, so the market will be closed every day. Continue?",
    )
  ) {
    return;
  }
  handleSubmit(tradingDaysForm, tradingDaysMessage, async () => {
    const result = await sendJson("PUT", "/api/admin/market/days", { days });
    showMessage(
      tradingDaysMessage,
      result.days.length
        ? `Trading days saved (${result.days.length} day${result.days.length === 1 ? "" : "s"} a week).`
        : "Trading days saved. The market is now closed every day.",
      "success",
    );
    await Promise.all([loadSchedule(), loadStatus()]);
  });
});

// -- HOLIDAYS / CLOSURES -- \\
// Can't pick a date in the past
function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}
holidayDateInput.min = localToday();

addHolidayForm.addEventListener("submit", (e) => {
  e.preventDefault();
  handleSubmit(addHolidayForm, addHolidayMessage, async () => {
    const holiday = await sendJson("POST", "/api/admin/market/holidays", {
      date: holidayDateInput.value,
      name: holidayNameInput.value.trim(),
    });
    addHolidayForm.reset();
    showMessage(
      addHolidayMessage,
      `Added ${holiday.name} on ${formatDate(holiday.date)}.`,
      "success",
    );
    await Promise.all([loadSchedule(), loadStatus()]);
  });
});

// One listener for every Remove button, including rows added later
holidaysBody.addEventListener("click", async (e) => {
  const button = e.target.closest(".remove-button");
  if (!button) return;
  const { date, name } = button.dataset;
  if (
    !confirm(
      `Remove ${name} (${formatDate(date)})? Trading will be allowed that day.`,
    )
  )
    return;

  button.disabled = true;
  clearMessage(addHolidayMessage);
  try {
    await api(`/api/admin/market/holidays/${encodeURIComponent(date)}`, {
      method: "DELETE",
    });
    showMessage(addHolidayMessage, `Removed ${name}.`, "success");
    await Promise.all([loadSchedule(), loadStatus()]);
  } catch (err) {
    button.disabled = false;
    showMessage(addHolidayMessage, err.message, "error");
  }
});

// -- START -- \\
// Only admins belong here. The server already blocks non-admins from every
// /api/admin route (403); this just sends them back to their own page.
(async () => {
  try {
    const me = await api("/api/auth/me");
    if (me.role !== "admin") {
      window.location.href = "dashboard.html";
      return;
    }
  } catch {
    return; // api() already redirected to login
  }
  loadStatus();
  loadStocks();
  loadSchedule();
})();
