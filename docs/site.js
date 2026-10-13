"use strict";
(async () => {
  const content = document.querySelector('#content');
  try {
    const response = await fetch('content.json', {cache: 'no-cache'});
    if (!response.ok) throw new Error('Documentation could not be loaded.');
    const data = await response.json();
    const chapters = Array.isArray(data.chapters) ? data.chapters : [];
    const css = document.documentElement.style;
    const appearance = data.appearance || {};
    const width = Number(appearance.width);
    if (width >= 500 && width <= 2200) css.setProperty('--content-width', `${width}px`);
    for (const [name, variable] of Object.entries({background:'--page-bg', text:'--text', sidebar:'--sidebar-bg', accent:'--accent'})) {
      const colour = String(appearance[name] || '');
      if (CSS.supports('color', colour)) css.setProperty(variable, colour);
    }
    document.title = `${data.title || 'Documentation'} — Documentation`;
    document.querySelector('#title').textContent = data.title || 'Documentation';
    document.querySelector('.brand').textContent = data.title || 'Documentation';
    document.querySelector('#subtitle').textContent = data.subtitle || '';
    content.replaceChildren();
    const usedIds = new Set(['top', 'document']);
    const uniqueId = text => {
      const base = String(text).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
      let id = base, n = 2;
      while (usedIds.has(id)) id = `${base}-${n++}`;
      usedIds.add(id);
      return id;
    };
    const mediaUrl = source => {
      const value = String(source || '').trim();
      if (/^https?:\/\//i.test(value)) return value;
      if (!value || /^(?:[a-z]+:|\/\/)/i.test(value)) return '';
      // CMS paths are relative to this website, including under /repository/ on GitHub Pages.
      return new URL(value.replace(/^\/+/, '').replace(/^docs\//, ''), document.baseURI).href;
    };
    const cleanHtml = value => {
      const template = document.createElement('template');
      template.innerHTML = String(value || '');
      template.content.querySelectorAll('script,style,iframe,object,embed,form,input,button,link,meta,base').forEach(el => el.remove());
      for (const el of template.content.querySelectorAll('*')) {
        for (const attr of [...el.attributes]) {
          if (/^on/i.test(attr.name) || ['srcdoc','id','name'].includes(attr.name)) el.removeAttribute(attr.name);
          else if (['href','src','poster','xlink:href'].includes(attr.name) && /^\s*(?:javascript|data|vbscript):/i.test(attr.value)) {
            const rasterImage = el.matches('img') && attr.name === 'src' && /^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(attr.value);
            if (!rasterImage) el.removeAttribute(attr.name);
          }
        }
        if (el.matches('img,video,source')) { const url = mediaUrl(el.getAttribute('src')); if (url) el.src = url; }
        if (el.matches('video[poster]')) { const url = mediaUrl(el.getAttribute('poster')); if (url) el.poster = url; }
        if (el.matches('a[target="_blank"]')) el.rel = 'noopener noreferrer';
      }
      return template.content;
    };
    const nav = document.querySelector('#chapters');
    const entries = [];
    const addLink = (title, id, className, chapterIndex, searchText) => {
      const a = document.createElement('a');
      a.textContent = title; a.href = `#${id}`; a.className = className;
      nav.append(a); entries.push({a, id, chapterIndex, searchText});
    };
    const sections = chapters.map((chapter, index) => {
      const section = document.createElement('section'); section.className = 'doc-chapter';
      const title = String(chapter.title || 'Untitled chapter');
      section.id = uniqueId(title);
      const heading = document.createElement('h2'); heading.textContent = title; section.append(heading);
      const linkIndex = entries.length;
      addLink(title, section.id, 'chapter', index, title);
      for (const block of chapter.blocks || []) {
        if (block.type === 'text') {
          const body = document.createElement('div'); body.className = 'rich-text'; body.append(cleanHtml(block.body));
          for (const h of body.querySelectorAll('h1,h2,h3,h4')) {
            h.id = uniqueId(`${section.id}-${h.textContent}`);
            addLink(h.textContent, h.id, h.matches('h3,h4') ? 'section subsection' : 'section', index, h.textContent);
          }
          section.append(body);
        } else if (['image','video'].includes(block.type)) {
          const url = mediaUrl(block.source); if (!url) continue;
          const figure = document.createElement('figure');
          const media = document.createElement(block.type === 'image' ? 'img' : 'video');
          media.src = url;
          const size = Number(block.width); if (size >= 100 && size <= 2200) media.width = size;
          else media.width = block.type === 'image' ? 520 : 720;
          if (block.type === 'image') { media.alt = block.caption || ''; media.loading = 'lazy'; }
          else { media.controls = true; media.preload = 'metadata'; media.playsInline = true; }
          figure.append(media);
          if (block.caption) { const caption = document.createElement('figcaption'); caption.textContent = block.caption; figure.append(caption); }
          section.append(figure);
        }
      }
      entries[linkIndex].searchText = section.textContent;
      content.append(section); return section;
    });
    const menu = document.querySelector('#menu-toggle');
    const outline = document.querySelector('#outline');
    menu.addEventListener('click', () => { const open = outline.classList.toggle('open'); menu.setAttribute('aria-expanded', String(open)); });
    const pager = document.querySelector('#chapter-pager');
    let currentIndex = 0, activeEntry = null, scrollFrame = 0, navigating = false;
    let trackingEntries = [];
    function highlight(entry) {
      if (!entry || entry === activeEntry) return;
      activeEntry = entry;
      for (const item of entries) {
        const active = item === entry;
        item.a.classList.toggle('active', active);
        item.a.classList.toggle('current-chapter', item.a.classList.contains('chapter') && item.chapterIndex === entry.chapterIndex);
        if (active) item.a.setAttribute('aria-current', 'location');
        else item.a.removeAttribute('aria-current');
      }
    }
    function trackSection() {
      if (!trackingEntries.length) return;
      const line = innerHeight / 2;
      let low = 0, high = trackingEntries.length - 1, index = 0;
      // Headings stay in document order; only a few position reads are needed per frame.
      while (low <= high) {
        const middle = (low + high) >> 1;
        if (trackingEntries[middle].element.getBoundingClientRect().top <= line) { index = middle; low = middle + 1; }
        else high = middle - 1;
      }
      highlight(trackingEntries[index].entry);
    }
    function scheduleTracking() {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; if (!navigating) trackSection(); });
    }
    function navigate() {
      let id; try { id = decodeURIComponent(location.hash.slice(1)); } catch { id = ''; }
      const target = document.getElementById(id);
      currentIndex = sections.findIndex(s => s === target || s.contains(target));
      if (currentIndex < 0) currentIndex = 0;
      const separate = data.layout === 'chapters';
      sections.forEach((s, i) => { s.hidden = separate && i !== currentIndex; });
      pager.replaceChildren();
      if (separate) for (const [index, prefix] of [[currentIndex - 1, '← '], [currentIndex + 1, 'Next: ']]) {
        if (index < 0 || index >= sections.length) continue;
        const a = document.createElement('a'); a.href = `#${sections[index].id}`; a.textContent = prefix + chapters[index].title; a.rel = index < currentIndex ? 'prev' : 'next'; pager.append(a);
      }
      trackingEntries = entries.filter(entry => !separate || entry.chapterIndex === currentIndex).map(entry => ({entry, element:document.getElementById(entry.id)}));
      const selected = entries.find(entry => entry.id === id);
      if (selected) highlight(selected); else trackSection();
      outline.classList.remove('open'); menu.setAttribute('aria-expanded', 'false');
      if (target) {
        navigating = true;
        requestAnimationFrame(() => {
          target.scrollIntoView({block:'start', behavior:'instant'});
          requestAnimationFrame(() => { navigating = false; });
        });
      }
    }
    nav.addEventListener('click', event => {
      const link = event.target.closest('a');
      if (link && link.hash === location.hash) navigate();
    });
    window.addEventListener('hashchange', navigate);
    window.addEventListener('scroll', scheduleTracking, {passive:true});
    window.addEventListener('resize', scheduleTracking);
    content.addEventListener('load', scheduleTracking, true);
    new ResizeObserver(scheduleTracking).observe(content);
    document.querySelector('#search').addEventListener('input', event => {
      const term = event.target.value.trim().toLowerCase();
      entries.forEach(e => { e.a.hidden = !e.searchText.toLowerCase().includes(term); });
    });
    const dialog = document.querySelector('#image-zoom');
    const fullImage = document.querySelector('#full-image');
    const close = () => dialog.close();
    document.querySelector('#close-image').addEventListener('click', close);
    dialog.addEventListener('click', event => { if (event.target === dialog || event.target === fullImage) close(); });
    content.addEventListener('click', event => {
      const img = event.target.closest('img'); if (!img || !img.naturalWidth) return;
      event.preventDefault(); fullImage.src = img.currentSrc || img.src; fullImage.alt = img.alt;
      dialog.showModal();
    });
    for (const img of content.querySelectorAll('img')) {
      img.tabIndex = 0; img.setAttribute('role','button'); img.setAttribute('aria-label', `Enlarge picture${img.alt ? ': ' + img.alt : ''}`);
      img.addEventListener('keydown', event => { if (['Enter',' '].includes(event.key)) { event.preventDefault(); img.click(); } });
    }
    content.setAttribute('aria-busy', 'false');
    navigate();
  } catch (error) {
    content.textContent = error.message;
    content.setAttribute('aria-busy', 'false');
    console.error(error);
  }
})();
