function syncEditorialScrollRegions() {
  document.querySelectorAll("pre, table, .output-box").forEach((element) => {
    const isScrollable = element.scrollWidth > element.clientWidth + 1;
    if (isScrollable) {
      element.setAttribute("tabindex", "0");
      element.dataset.editorialScrollable = "true";
    } else if (element.dataset.editorialScrollable === "true") {
      element.removeAttribute("tabindex");
      delete element.dataset.editorialScrollable;
    }
  });
}

window.addEventListener("DOMContentLoaded", syncEditorialScrollRegions);
window.addEventListener("resize", syncEditorialScrollRegions);
