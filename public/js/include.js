function loadHTML(id, url) {
  const container = document.getElementById(id);
  
  // 💡 Se o placeholder não existir nesta página específica, não faz nada
  if (!container) return; 

  fetch(url)
    .then(response => {
      if (!response.ok) throw new Error("Erro ao carregar " + url);
      return response.text();
    })
    .then(data => {
      container.innerHTML = data;
    })
    .catch(error => console.error(error));
}

document.addEventListener("DOMContentLoaded", () => {
  // O script tenta carregar todos, mas a validação interna garante 
  // que o fetch só aconteça se o elemento existir no HTML da página atual.
  loadHTML("header-placeholder", "header.html");
  loadHTML("nav-placeholder", "nav.html");
  loadHTML("footer-placeholder", "footer.html");
});

