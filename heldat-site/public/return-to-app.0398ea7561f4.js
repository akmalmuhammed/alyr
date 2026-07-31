(() => {
  const link = document.querySelector("[data-heldat-deep-link]");
  if (!(link instanceof HTMLAnchorElement)) return;

  const base = link.dataset.heldatDeepLink;
  if (
    !base ||
    ![
      "heldat://callback",
      "heldat://join",
      "heldat://reset-password"
    ].includes(base)
  ) {
    return;
  }

  const continuation = `${window.location.search}${window.location.hash}`;
  if (continuation.length > 8192) return;

  link.href = `${base}${continuation}`;
})();
