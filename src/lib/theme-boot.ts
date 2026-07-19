/** Blocking inline script: apply Gravity body theme classes before React hydrates. */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('cf-theme');if(t!=='dark'&&t!=='light')t='light';var b=document.body;b.classList.add('g-root','g-root_theme_'+t);b.dataset.cfTheme=t;}catch(e){}})();`;
