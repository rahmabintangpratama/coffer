// Sets data-theme before first paint so there is no flash of the wrong theme.
// Blocking on purpose; the CSP allows no inline script. Reads one localStorage
// key (coffer:theme), no network, no dynamic code.
(function () {
  var setting;
  try {
    setting = window.localStorage.getItem("coffer:theme");
  } catch {
    setting = undefined;
  }
  if (setting !== "light" && setting !== "dark") setting = "system";
  var dark =
    setting === "dark" ||
    (setting === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
})();
