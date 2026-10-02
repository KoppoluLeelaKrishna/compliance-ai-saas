/**
 * App appearance: dark, light, or follow the OS.
 *
 * The choice is stored per browser in localStorage and applied as
 * `html[data-theme]`, which swaps the --vc-* variables in globals.css.
 * Bare routes (landing, sign-in, sign-up) are designed dark-only, so they
 * never receive the attribute.
 */

export type ThemePref = "dark" | "light" | "system";

export const THEME_STORAGE_KEY = "vc-theme";

/** Routes that render full-bleed, with no app chrome, and stay dark. */
export const BARE_ROUTES = ["/", "/signin", "/signup", "/auth/callback"];

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage blocked — fall through to the default */
  }
  return "dark";
}

export function resolveTheme(pref: ThemePref): "dark" | "light" {
  if (pref !== "system") return pref;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme(pref: ThemePref, pathname: string) {
  const root = document.documentElement;
  if (BARE_ROUTES.includes(pathname)) {
    root.removeAttribute("data-theme");
    return;
  }
  root.setAttribute("data-theme", resolveTheme(pref));
}

export function setThemePref(pref: ThemePref) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* storage blocked — still apply for this page view */
  }
  applyTheme(pref, window.location.pathname);
  window.dispatchEvent(new CustomEvent("vc-theme-change", { detail: pref }));
}

/**
 * Inline <head> script: applies the saved theme before first paint so a
 * light-mode user never sees a dark flash. Mirrors applyTheme().
 */
export const THEME_BOOT_SCRIPT = `(function(){try{
var b=${JSON.stringify(BARE_ROUTES)};
if(b.indexOf(location.pathname)>=0)return;
var p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})||"dark";
if(p==="system")p=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";
if(p==="light"||p==="dark")document.documentElement.setAttribute("data-theme",p);
}catch(e){}})();`;
