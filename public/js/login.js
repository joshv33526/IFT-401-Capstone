// Login page: Will send username and password to /api/auth/login
const form = document.getElementById("loginForm");
const msg = document.getElementById("loginMessage");
const button = form.querySelector("button");

// Admins go to the admin console, everyone else to the dashboard.
function homePage(role) {
  return role === "admin" ? "admin.html" : "dashboard.html";
}

// If currently logged in = straight to their home page
fetch("/api/auth/me").then(async (res) => {
  if (res.ok) window.location.href = homePage((await res.json()).role);
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
      window.location.href = homePage(data.role);
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
