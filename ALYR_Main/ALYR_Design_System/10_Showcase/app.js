const root = document.documentElement;
const themeToggle = document.querySelector('#themeToggle');
const themeLabel = document.querySelector('.theme-label');
const densityToggle = document.querySelector('#densityToggle');
const navToggle = document.querySelector('#navToggle');
const rail = document.querySelector('#rail');
const toast = document.querySelector('#toast');

const storedTheme = localStorage.getItem('alyr-theme');
const initialTheme = storedTheme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
setTheme(initialTheme);

function setTheme(theme) {
  root.dataset.theme = theme;
  const dark = theme === 'dark';
  themeToggle?.setAttribute('aria-pressed', String(dark));
  if (themeLabel) themeLabel.textContent = dark ? 'Light theme' : 'Dark theme';
  localStorage.setItem('alyr-theme', theme);
}

themeToggle?.addEventListener('click', () => {
  setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
});

densityToggle?.addEventListener('click', () => {
  document.body.classList.toggle('is-compact');
  const compact = document.body.classList.contains('is-compact');
  densityToggle.textContent = compact ? 'Comfortable density' : 'Compact density';
});

navToggle?.addEventListener('click', () => {
  const open = rail.classList.toggle('is-open');
  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
});

rail?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    rail.classList.remove('is-open');
    navToggle?.setAttribute('aria-expanded', 'false');
  });
});

const tabs = [...document.querySelectorAll('[role="tab"]')];
tabs.forEach((tab) => {
  tab.addEventListener('click', () => activateTab(tab));
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let index = tabs.indexOf(tab);
    if (event.key === 'ArrowRight') index = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') index = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') index = 0;
    if (event.key === 'End') index = tabs.length - 1;
    tabs[index].focus();
    activateTab(tabs[index]);
  });
});

function activateTab(activeTab) {
  tabs.forEach((tab) => {
    const active = tab === activeTab;
    tab.setAttribute('aria-selected', String(active));
    document.querySelector(`#${tab.getAttribute('aria-controls')}`).hidden = !active;
  });
}

document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const value = button.dataset.copy;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const field = document.createElement('textarea');
      field.value = value;
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      document.execCommand('copy');
      field.remove();
    }
    showToast(`${value} copied`);
  });
});

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 1800);
}

const sections = [...document.querySelectorAll('main section[id]')];
const navLinks = [...document.querySelectorAll('.rail__nav a')];
const observer = new IntersectionObserver((entries) => {
  const visible = entries
    .filter((entry) => entry.isIntersecting)
    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  navLinks.forEach((link) => link.classList.toggle('is-active', link.hash === `#${visible.target.id}`));
}, { rootMargin: '-25% 0px -60% 0px', threshold: [0.05, 0.2, 0.5] });

sections.forEach((section) => observer.observe(section));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && rail.classList.contains('is-open')) {
    rail.classList.remove('is-open');
    navToggle?.setAttribute('aria-expanded', 'false');
    navToggle?.focus();
  }
});
