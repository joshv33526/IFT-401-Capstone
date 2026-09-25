// Login page: Will send username and password to /api/auth/login
const form = document.getElementById("loginForm");
const msg = document.getElementById("loginMessage");
const button = form.querySelector("button");

// If currently logged in = straight to the dashboard
fetch("/api/auth/me").then((res) => {
  if (res.ok) window.location.href = "dashboard.html";
});

form.addEventListener("submit", async (e) => {
  e.preventDefault(); // prevents the default page reload
  msg.textContent = "";
  button.disabled = true; //prevents accidental double clicks

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: document.getElementById("username").value.trim(),
        password: document.getElementById("password").value,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      window.location.href = "dashboard.html";
    } else if (data.details) {
      msg.textContent = data.details.map((d) => d.message).join(", ");
    } else {
      msg.textContent = data.error || "Login failed";
    }
  } catch {
    msg.textContent = "Cannot reach the server. Please try again.";
  } finally {
    button.disabled = false;
  }
});
