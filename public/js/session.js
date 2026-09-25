// This is shared by each page that has the user profile name display
// It will display the user's name, and wires the Log out button to work

(async () => {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) {
      window.location.href = "login.html";
      return;
    }
    const user = await res.json();
    const welcome = document.querySelector(".welcome-message");
    if (welcome) welcome.textContent = `Welcome, ${user.fullName}`;
  } catch {
    window.location.href = "login.html";
  }
})();

const logoutButton = document.querySelector(".logout-button");
if (logoutButton) {
  logoutButton.addEventListener("click", async (e) => {
    e.preventDefault();
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "login.html";
  });
}
