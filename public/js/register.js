// Create an account, then send the user to the login page.
const form = document.getElementById("registerForm");
const message = document.getElementById("registerMessage");
const button = form.querySelector('button[type="submit"]');

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (button.disabled) return;
  message.textContent = "";

  if (!form.reportValidity()) return;

  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  if (password !== confirmPassword) {
    message.textContent = "Passwords do not match.";
    return;
  }

  button.disabled = true;
  button.textContent = "Creating Account...";
  let created = false;

  try {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: document.getElementById("fullName").value.trim(),
        username: document.getElementById("username").value.trim(),
        email: document.getElementById("email").value.trim(),
        password,
        confirmPassword,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      message.textContent = data.details
        ? data.details.map((detail) => detail.message).join(", ")
        : data.error || "Unable to create account.";
      return;
    }

    created = true;
    form.reset();
    message.textContent = "Account created! Redirecting to login...";
    setTimeout(() => {
      window.location.href = "login.html";
    }, 1500);
  } catch {
    message.textContent =
      "Unable to confirm registration. Try logging in before submitting again.";
  } finally {
    button.disabled = created;
    button.textContent = created ? "Account Created" : "Create Account";
  }
});
