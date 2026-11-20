// Easy Stock Solutions - Portfolio Page
// Loads the user's live cash balance and stock holdings.

const portfolioValue = document.getElementById("portfolioValue");
const totalGainLoss = document.getElementById("totalGainLoss");
const portfolioCash = document.getElementById("portfolioCash");
const holdingsBody = document.getElementById("holdingsBody");
const portfolioMessage = document.getElementById("portfolioMessage");


const currency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});


function money(value) {
    return currency.format(Number(value));
}


async function request(url) {
    const res = await fetch(url);

    if (res.status === 401) {
        window.location.href = "login.html";
        return null;
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new Error(
            data.error || "Unable to load portfolio information."
        );
    }

    return data;
}


// Uses transaction history to estimate the current average cost.
// If the transaction history doesn't match the current holding,
// the page simply shows "-" rather than displaying incorrect data.

function calculateCostBasis(transactions) {
    const positions = new Map();

    const ordered = [...transactions].reverse();

    for (const txn of ordered) {

        if (
            !txn.ticker ||
            !txn.quantity ||
            (txn.type !== "BUY" && txn.type !== "SELL")
        ) {
            continue;
        }

        const ticker = txn.ticker;
        const quantity = Number(txn.quantity);
        const price = Number(txn.price);

        if (!positions.has(ticker)) {
            positions.set(ticker, {
                quantity: 0,
                cost: 0,
            });
        }

        const position = positions.get(ticker);


        if (txn.type === "BUY") {

            position.cost += price * quantity;
            position.quantity += quantity;

        } else if (txn.type === "SELL") {

            if (position.quantity > 0) {

                const averageCost =
                    position.cost / position.quantity;

                position.cost -= averageCost * quantity;
                position.quantity -= quantity;

                if (position.quantity <= 0) {
                    position.quantity = 0;
                    position.cost = 0;
                }
            }
        }
    }

    return positions;
}


function createCell(text, className = "") {
    const td = document.createElement("td");

    td.textContent = text;

    if (className) {
        td.className = className;
    }

    return td;
}


function createTradeCell() {
    const td = document.createElement("td");

    const link = document.createElement("a");

    link.className = "view-button";
    link.href = "trade.html";
    link.textContent = "Trade";

    td.appendChild(link);

    return td;
}


async function loadPortfolio() {
    try {

        const [
            cashData,
            stockData,
            transactionData
        ] = await Promise.all([
            request("/api/cash/balance"),
            request("/api/trade/stocks"),
            request("/api/transactions"),
        ]);


        if (!cashData || !stockData || !transactionData) {
            return;
        }


        const cash = Number(cashData.balance);

        const holdings = stockData.stocks.filter(
            (stock) => Number(stock.sharesOwned) > 0
        );

        const costBasis = calculateCostBasis(
            transactionData.transactions || []
        );


        let stockValue = 0;
        let totalGain = 0;
        let allGainValuesKnown = true;


        holdingsBody.replaceChildren();


        if (holdings.length === 0) {

            const row = document.createElement("tr");

            const cell = document.createElement("td");

            cell.colSpan = 7;
            cell.textContent =
                "You do not currently own any stocks.";

            cell.className = "empty-holdings";

            row.appendChild(cell);

            holdingsBody.appendChild(row);
        }


        for (const stock of holdings) {

            const shares = Number(stock.sharesOwned);
            const currentPrice = Number(stock.price);

            const currentValue =
                shares * currentPrice;

            stockValue += currentValue;


            const storedPosition =
                costBasis.get(stock.ticker);

            let averageCost = null;
            let gainLoss = null;


            if (
                storedPosition &&
                storedPosition.quantity === shares &&
                shares > 0
            ) {
                averageCost =
                    storedPosition.cost / shares;

                gainLoss =
                    currentValue -
                    storedPosition.cost;

                totalGain += gainLoss;

            } else {
                allGainValuesKnown = false;
            }


            const row =
                document.createElement("tr");


            row.appendChild(
                createCell(stock.ticker)
            );

            row.appendChild(
                createCell(stock.companyName)
            );

            row.appendChild(
                createCell(shares)
            );

            row.appendChild(
                createCell(
                    averageCost === null
                        ? "-"
                        : money(averageCost)
                )
            );

            row.appendChild(
                createCell(
                    money(currentPrice)
                )
            );


            if (gainLoss === null) {

                row.appendChild(
                    createCell("-")
                );

            } else {

                const gainCell =
                    createCell(
                        `${gainLoss >= 0 ? "+" : "-"}${money(Math.abs(gainLoss))}`,
                        gainLoss >= 0
                            ? "change-positive"
                            : "change-negative"
                    );

                row.appendChild(gainCell);
            }


            row.appendChild(
                createTradeCell()
            );


            holdingsBody.appendChild(row);
        }


        const totalValue =
            cash + stockValue;


        portfolioValue.textContent =
            money(totalValue);

        portfolioCash.textContent =
            money(cash);


        if (allGainValuesKnown) {

            totalGainLoss.textContent =
                `${totalGain >= 0 ? "+" : "-"}${money(Math.abs(totalGain))}`;

            totalGainLoss.classList.remove(
                "positive",
                "negative"
            );

            totalGainLoss.classList.add(
                totalGain >= 0
                    ? "positive"
                    : "negative"
            );

        } else {

            totalGainLoss.textContent = "-";
        }


        if (portfolioMessage) {
            portfolioMessage.textContent = "";
        }


    } catch (error) {

        if (portfolioMessage) {
            portfolioMessage.textContent =
                error.message ||
                "Unable to load portfolio information.";
        }
    }
}


loadPortfolio();