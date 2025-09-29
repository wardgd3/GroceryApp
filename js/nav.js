(function(){
    const btn = document.getElementById('mobile-menu-btn');
    const menu = document.getElementById('mobile-menu');
    if(!btn || !menu) return;

    function closeMenu(){ menu.classList.remove('show'); btn.setAttribute('aria-expanded','false'); }
    function toggleMenu(){
      const open = menu.classList.toggle('show');
      btn.setAttribute('aria-expanded', String(open));
    }

    btn.addEventListener('click', (e)=>{ e.stopPropagation(); toggleMenu(); });
    document.addEventListener('click', (e)=>{
      if(!menu.classList.contains('show')) return;
      if(e.target === menu || menu.contains(e.target) || e.target === btn) return;
      closeMenu();
    });
    document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeMenu(); });
  })();