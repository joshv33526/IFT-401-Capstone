// Easy Stock Solutions - Cash Page
// Front-end logic for viewing the current cash balance and depositing cash.

const depositForm = document.getElementById("depositForm");
const depositAmount = document.getElementById("depositAmount");
const depositMessage = document.getElementById("depositMessage");
const depositButton = depositForm?.querySelector("button");

const topCashBalance = document.getElementById("topCashBalance");
const summaryCashBalance = document.getElementById("summaryCashBalance");
const buyingPower = document.getElementById("buyingPower");


// Format numbers as U.S. currency
function formatMoney(value) {
    return Number(value).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
    });
}


// Update all of the cash balance displays on the page
function updateBalance(balance) {

    const formattedBalance = formatMoney(balance);

    if (topCashBalance) {
        topCashBalance.textContent = formattedBalance;
    }

    if (summaryCashBalance) {
        summaryCashBalance.textContent = formattedBalance;
    }

    if (buyingPower) {
        buyingPower.textContent = formattedBalance;
    }
}


// Load the current user's cash balance
async function loadBalance() {

    try {

        const res = await fetch("/api/cash/balance");


        // If user is not logged in, return to login page
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


        // Update the page with the real balance
        updateBalance(data.balance);


    } catch (error) {

        if (depositMessage) {

            depositMessage.textContent = error.message;

            depositMessage.className =
                "cash-message error-message";
        }
    }
}


// Deposit Cash
if (depositForm) {

    depositForm.addEventListener("submit", async (event) => {

        // Prevent normal page reload
        event.preventDefault();


        // Clear old messages
        if (depositMessage) {

            depositMessage.textContent = "";

            depositMessage.className = "cash-message";
        }


        const amount = depositAmount.value.trim();


        // Make sure amount is valid
        if (!amount || Number(amount) < 0.01) {

            if (depositMessage) {

                depositMessage.textContent =
                    "Enter a deposit amount of at least $0.01.";

                depositMessage.className =
                    "cash-message error-message";
            }

            return;
        }


        // Temporarily disable button
        if (depositButton) {

            depositButton.disabled = true;

            depositButton.textContent = "Depositing...";
        }


        try {

            // Send deposit request to backend
            const res = await fetch("/api/cash/deposit", {

                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                },

                body: JSON.stringify({
                    amount: amount,
                }),
            });


            // User session expired
            if (res.status === 401) {

                window.location.href = "login.html";

                return;
            }


            const data = await res.json().catch(() => ({}));


            // Deposit failed
            if (!res.ok) {

                throw new Error(
                    data.error || "Deposit failed."
                );
            }


            // Update balance shown on page
            updateBalance(data.balance);


            // Show successful deposit message
            if (depositMessage) {

                depositMessage.textContent =
                    `Deposit successful! ${formatMoney(data.amount)} was added to your account.`;

                depositMessage.className =
                    "cash-message success-message";
            }


            // Clear deposit input
            depositForm.reset();


        } catch (error) {

            if (depositMessage) {

                depositMessage.textContent =
                    error.message;

                depositMessage.className =
                    "cash-message error-message";
            }


        } finally {

            // Turn button back on
            if (depositButton) {

                depositButton.disabled = false;

                depositButton.textContent =
                    "Deposit Cash";
            }
        }
    });
}


// Load the real balance when the Cash page opens
loadBalance();