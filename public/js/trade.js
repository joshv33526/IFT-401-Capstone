(() => {
  const el = (id) => document.getElementById(id);
  const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  let stocks = new Map();
  let busy = false;
  let ready = false;

  async function request(url, body) {
    let res;
    try {
      res = await fetch(url, body === undefined ? {} : {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error(body === undefined
        ? "Cannot reach the server. Please try again."
        : "Connection lost. Check pending orders and transaction history before retrying; the request may have completed.");
    }
    if (res.status === 401) {
      throw new Error("You can preview this page without logging in. Account data and trading require a logged-in account.");
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.details?.map((d) => d.message).join(", ") || data?.error || "Request failed.");
    }
    if (!data) throw new Error("Invalid server response. Check pending orders and transaction history before retrying.");
    return data;
  }

  function updateEstimate(side) {
    const stock = stocks.get(el(`${side}Stock`).value);
    const quantity = Number(el(`${side}Quantity`).value);
    el(`${side}Price`).value = stock ? currency.format(Number(stock.price)) : "$0.00";
    const cents = stock ? Math.round(Number(stock.price) * 100) : 0;
    el(side === "buy" ? "estimatedCost" : "estimatedProceeds").value =
      currency.format(Number.isInteger(quantity) && quantity > 0 ? cents * quantity / 100 : 0);
    if (side === "sell") {
      el("sharesOwned").value = stock ? String(stock.sharesOwned) : "0";
      el("sellQuantity").max = String(Math.min(100000, Number(stock?.sharesOwned || 0)));
    }
  }

  function updateButtons() {
    for (const side of ["buy", "sell"]) {
      el(`${side}Form`).querySelector('button[type="submit"]').disabled = busy || !ready;
    }
    for (const button of el("pendingOrders").querySelectorAll("button")) button.disabled = busy;
  }

  async function loadStocks() {
    ready = false;
    updateButtons();
    const data = await request("/api/trade/stocks");
    stocks = new Map(data.stocks.map((stock) => [stock.ticker, stock]));
    for (const side of ["buy", "sell"]) {
      const select = el(`${side}Stock`);
      const previous = select.value;
      select.replaceChildren(new Option("Select a stock", ""));
      for (const stock of stocks.values()) {
        if (side === "sell" && Number(stock.sharesOwned) === 0) continue;
        select.add(new Option(`${stock.ticker} - ${stock.companyName}`, stock.ticker));
      }
      if ([...select.options].some((option) => option.value === previous)) select.value = previous;
      updateEstimate(side);
    }
    ready = true;
    updateButtons();
  }

  async function loadOrders() {
    const data = await request("/api/trade/orders/pending");
    const tbody = el("pendingOrders");
    tbody.replaceChildren();
    if (!data.orders.length) {
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.textContent = "No pending orders.";
      const row = document.createElement("tr");
      row.append(cell);
      tbody.append(row);
    }
    for (const order of data.orders) {
      const row = document.createElement("tr");
      for (const value of [order.orderId, order.ticker, order.side, order.quantity, order.status]) {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        row.append(cell);
      }
      const cell = document.createElement("td");
      for (const action of ["process", "cancel"]) {
        if (action === "process" && order.side !== "BUY") continue;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "view-button";
        button.dataset.orderId = order.orderId;
        button.dataset.action = action;
        button.textContent = action === "process" ? "Process" : "Cancel";
        cell.append(button, document.createTextNode(" "));
      }
      row.append(cell);
      tbody.append(row);
    }
    updateButtons();
  }

  for (const side of ["buy", "sell"]) {
    el(`${side}Stock`).addEventListener("change", () => updateEstimate(side));
    el(`${side}Quantity`).addEventListener("input", () => updateEstimate(side));
    el(`${side}Form`).addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy || !ready) return;
      const form = el(`${side}Form`);
      const message = el(`${side}Message`);
      const ticker = el(`${side}Stock`).value;
      const quantity = Number(el(`${side}Quantity`).value);
      if (!form.reportValidity()) return;
      if (!stocks.has(ticker) || !Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
        message.textContent = "Choose a stock and enter a whole number of shares from 1 to 100,000.";
        return;
      }
      if (side === "sell" && quantity > Number(stocks.get(ticker).sharesOwned)) {
        message.textContent = "You do not own enough shares to sell.";
        return;
      }
      busy = true;
      updateButtons();
      message.textContent = "Submitting order...";
      try {
        const trade = await request(`/api/trade/${side}`, { ticker, quantity });
        message.textContent = side === "buy"
          ? `Order #${trade.orderId} placed for ${trade.quantity} ${trade.ticker} shares. Process or cancel it below.`
          : `Sold ${trade.quantity} ${trade.ticker} shares at ${currency.format(Number(trade.price))}. Total: ${currency.format(Number(trade.total))}. Cash balance: ${currency.format(Number(trade.cashBalance))}. Order #${trade.orderId}.`;
        el(`${side}Quantity`).value = "";
        updateEstimate(side);
        try {
          if (side === "buy") await loadOrders();
          else await loadStocks();
        } catch {
          message.textContent += " Order submitted, but page data could not refresh. Reload before trading again.";
        }
      } catch (err) {
        message.textContent = err.message;
      } finally {
        busy = false;
        updateButtons();
      }
    });
  }

 el("pendingOrders").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-order-id]");
    if (!button || busy) return;
    busy = true;
    updateButtons();
    const message = el("cancelMessage");
    const action = button.dataset.action;
    message.textContent = action === "process" ? "Processing order..." : "Cancelling order...";
    try {
      const trade = await request(`/api/trade/orders/${encodeURIComponent(button.dataset.orderId)}/${action}`, {});
      message.textContent = action === "process"
        ? `Order #${trade.orderId} processed. Bought ${trade.quantity} ${trade.ticker} shares at ${currency.format(Number(trade.price))}. Total: ${currency.format(Number(trade.total))}. Cash balance: ${currency.format(Number(trade.cashBalance))}.`
        : `Order #${button.dataset.orderId} cancelled.`;
      button.closest("tr").remove();
      if (action === "process") {
        try { await loadStocks(); }
        catch { message.textContent += " Account data could not refresh. Reload before trading again."; }
      }
    } catch (err) {
      message.textContent = err.message;
    } finally {
      try { await loadOrders(); }
      catch { message.textContent += " Pending orders could not refresh. Reload to see their current status."; }
      busy = false;
      updateButtons();
    }
  });

  updateButtons();
  loadStocks().catch((err) => {
    el("buyMessage").textContent = err.message;
    el("sellMessage").textContent = err.message;
  });
  loadOrders().catch((err) => {
    el("pendingOrders").replaceChildren();
    el("cancelMessage").textContent = err.message;
  });
})();
