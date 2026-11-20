// Easy Stock Solutions - Cash Management
// Handles loading cash balance, deposits, and withdrawals.

const depositForm = document.getElementById("depositForm");
const depositAmount = document.getElementById("depositAmount");
const depositMessage = document.getElementById("depositMessage");
const depositButton = depositForm?.querySelector("button");

const withdrawForm = document.getElementById("withdrawForm");
const withdrawAmount = document.getElementById("withdrawAmount");
const withdrawMessage = document.getElementById("withdrawMessage");
const withdrawButton = withdrawForm?.querySelector("button");

const topCashBalance = document.getElementById("topCashBalance");
const summaryCashBalance = document.getElementById("summaryCashBalance");
const buyingPower = document.getElementById("buyingPower");
const cashPageMessage = document.getElementById("cashPageMessage");


function formatMoney(value) {
    return Number(value).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
    });
}


function updateBalance(balance) {
    const formatted = formatMoney(balance);

    if (topCashBalance) {
        topCashBalance.textContent = formatted;
    }

    if (summaryCashBalance) {
        summaryCashBalance.textContent = formatted;
    }

    if (buyingPower) {
        buyingPower.textContent = formatted;
    }

    // Helps prevent entering more than the current balance.
    // The backend still performs the real insufficient-funds check.
    if (withdrawAmount && Number(balance) > 0) {
        withdrawAmount.max = Number(balance).toFixed(2);
    }
}


function showMessage(element, message, success = false) {
    if (!element) return;

    element.textContent = message;
    element.className = success
        ? "cash-message success-message"
        : "cash-message error-message";
}


function clearMessage(element) {
    if (!element) return;

    element.textContent = "";
    element.className = "cash-message";
}


async function loadBalance() {
    try {
        const res = await fetch("/api/cash/balance");

        if (res.status === 401) {
            window.location.href = "login.html";
            return;
        }

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(
                data.error || "Unable to load cash balance."
            );
        }

        updateBalance(data.balance);

        if (cashPageMessage) {
            cashPageMessage.textContent = "";
        }

    } catch (error) {
        showMessage(
            cashPageMessage,
            error.message || "Unable to load cash balance."
        );
    }
}


// ------------------------------
// Deposit
// ------------------------------

if (depositForm) {
    depositForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        clearMessage(depositMessage);

        const amount = depositAmount.value.trim();
        const numericAmount = Number(amount);

        if (
            !amount ||
            !Number.isFinite(numericAmount) ||
            numericAmount < 0.01 ||
            numericAmount > 1000000
        ) {
            showMessage(
                depositMessage,
                "Enter a deposit amount between $0.01 and $1,000,000."
            );
            return;
        }

        depositButton.disabled = true;
        depositButton.textContent = "Depositing...";

        try {
            const res = await fetch("/api/cash/deposit", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    amount: amount,
                }),
            });

            if (res.status === 401) {
                window.location.href = "login.html";
                return;
            }

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(
                    data.error || "Deposit failed."
                );
            }

            updateBalance(data.balance);

            showMessage(
                depositMessage,
                `Deposit successful! ${formatMoney(data.amount)} was added to your account.`,
                true
            );

            depositForm.reset();

        } catch (error) {
            showMessage(
                depositMessage,
                error.message || "Deposit failed."
            );

        } finally {
            depositButton.disabled = false;
            depositButton.textContent = "Deposit Cash";
        }
    });
}


// ------------------------------
// Withdraw
// ------------------------------

if (withdrawForm) {
    withdrawForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        clearMessage(withdrawMessage);

        const amount = withdrawAmount.value.trim();
        const numericAmount = Number(amount);

        if (
            !amount ||
            !Number.isFinite(numericAmount) ||
            numericAmount < 0.01 ||
            numericAmount > 1000000
        ) {
            showMessage(
                withdrawMessage,
                "Enter a withdrawal amount between $0.01 and $1,000,000."
            );
            return;
        }

        withdrawButton.disabled = true;
        withdrawButton.textContent = "Withdrawing...";

        try {
            const res = await fetch("/api/cash/withdraw", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    amount: amount,
                }),
            });

            if (res.status === 401) {
                window.location.href = "login.html";
                return;
            }

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(
                    data.error || "Withdrawal failed."
                );
            }

            updateBalance(data.balance);

            showMessage(
                withdrawMessage,
                `Withdrawal successful! ${formatMoney(data.amount)} was removed from your account.`,
                true
            );

            withdrawForm.reset();

        } catch (error) {
            showMessage(
                withdrawMessage,
                error.message || "Withdrawal failed."
            );

        } finally {
            withdrawButton.disabled = false;
            withdrawButton.textContent = "Withdraw Cash";
        }
    });
}


// Load real account balance when page opens.
loadBalance();