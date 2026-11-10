/* Zubair Hasan — portfolio
   Plain JavaScript, no build step. Content comes from:
     content/site.json      (profile, bio, socials, tools, skills)
     content/projects.json  (projects, managed at /admin)
*/
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  var state = { site: null, projects: [], visible: [], filter: 'all', current: -1, lastFocus: null, list: [] };

  /* ---------------- helpers ---------------- */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v === true ? '' : v);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }
  function str(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
  function isHttp(u) { return /^https?:\/\//i.test(str(u)); }
  function safeUrl(u) { u = str(u); return isHttp(u) ? u : ''; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function slugify(s) {
    return str(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'project';
  }
  // CMS stores uploads as "/uploads/file.jpg". Make it relative so it also works on GitHub Pages sub-paths.
  function asset(p) {
    p = str(p);
    if (!p) return '';
    if (/^(https?:)?\/\//i.test(p) || /^data:image\//i.test(p)) return p;
    return p.replace(/^\/+/, '');
  }
  function loadJSON(path) {
    return fetch(path, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(path + ' ' + r.status); return r.json(); })
      .catch(function (err) { if (window.console) console.warn('[portfolio] Could not load', path, err.message); return null; });
  }

  // Fraunces has a very decorative "&", so ampersands in serif text use the sans font.
  function ampify() {
    $$('.about__bio, .process h3, .hero__title').forEach(function (node) {
      if (node.querySelector('.amp')) return;
      var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), list = [], t;
      while ((t = walker.nextNode())) if (t.nodeValue.indexOf('&') > -1) list.push(t);
      list.forEach(function (textNode) {
        var frag = document.createDocumentFragment();
        textNode.nodeValue.split('&').forEach(function (part, i) {
          if (i) frag.appendChild(el('span', { class: 'amp', text: '&' }));
          frag.appendChild(document.createTextNode(part));
        });
        textNode.parentNode.replaceChild(frag, textNode);
      });
    });
  }

  /* ---------------- video link parsing ---------------- */
  function parseVideo(raw) {
    var url = str(raw);
    var out = { type: 'link', id: '', embed: '', thumb: '', vertical: false, link: safeUrl(url) };
    if (!url) { out.type = 'none'; return out; }
    if (!/^https?:\/\//i.test(url) && /^(www\.|youtu|vimeo|drive\.google|m\.youtube)/i.test(url)) url = 'https://' + url;
    out.link = safeUrl(url);
    var u;
    try { u = new URL(url); } catch (e) {
      if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) { out.type = 'file'; out.embed = asset(url); out.link = asset(url); }
      return out;
    }
    var host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase();
    var path = u.pathname;
    var m;

    // YouTube
    if (host === 'youtu.be' || /(^|\.)youtube(-nocookie)?\.com$/.test(host)) {
      var id = '';
      if (host === 'youtu.be') id = path.split('/')[1] || '';
      else if (u.searchParams.get('v')) id = u.searchParams.get('v');
      else if ((m = path.match(/^\/(embed|shorts|live|v|e)\/([^/?#]+)/))) { id = m[2]; if (m[1] === 'shorts') out.vertical = true; }
      id = (id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20);
      if (id) {
        var start = parseInt(String(u.searchParams.get('t') || u.searchParams.get('start') || '').replace(/s$/, ''), 10);
        out.type = 'youtube'; out.id = id;
        out.embed = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1&playsinline=1' + (start > 0 ? '&start=' + start : '');
        out.thumb = 'https://i.ytimg.com/vi/' + id + '/maxresdefault.jpg';
        out.link = 'https://www.youtube.com/' + (out.vertical ? 'shorts/' + id : 'watch?v=' + id);
      }
      return out;
    }
    // Vimeo
    if (/(^|\.)vimeo\.com$/.test(host)) {
      var parts = path.split('/').filter(Boolean);
      var vid = '', hash = u.searchParams.get('h') || '';
      for (var i = 0; i < parts.length; i++) {
        if (/^\d{5,}$/.test(parts[i])) { vid = parts[i]; if (!hash && parts[i + 1] && /^[a-f0-9]{6,}$/i.test(parts[i + 1])) hash = parts[i + 1]; break; }
      }
      if (vid) {
        out.type = 'vimeo'; out.id = vid;
        out.embed = 'https://player.vimeo.com/video/' + vid + '?autoplay=1&dnt=1&title=0&byline=0&portrait=0' + (hash ? '&h=' + encodeURIComponent(hash) : '');
        out.oembed = 'https://vimeo.com/api/oembed.json?width=1280&url=' + encodeURIComponent('https://vimeo.com/' + vid + (hash ? '/' + hash : ''));
      }
      return out;
    }
    // Google Drive
    if (host === 'drive.google.com' || host === 'docs.google.com') {
      var did = '';
      if ((m = path.match(/\/file\/d\/([^/]+)/))) did = m[1];
      else if (u.searchParams.get('id')) did = u.searchParams.get('id');
      did = (did || '').replace(/[^A-Za-z0-9_-]/g, '');
      if (did) {
        out.type = 'drive'; out.id = did;
        out.embed = 'https://drive.google.com/file/d/' + did + '/preview';
        out.thumb = 'https://drive.google.com/thumbnail?id=' + did + '&sz=w1280';
        out.link = 'https://drive.google.com/file/d/' + did + '/view';
      }
      return out;
    }
    // Instagram
    if (host === 'instagram.com') {
      if ((m = path.match(/^\/(?:[^/]+\/)?(reel|reels|p|tv)\/([A-Za-z0-9_-]+)/))) {
        out.type = 'instagram'; out.id = m[2]; out.vertical = true;
        out.embed = 'https://www.instagram.com/' + (m[1] === 'p' ? 'p' : 'reel') + '/' + m[2] + '/embed';
      }
      return out;
    }
    // TikTok
    if (host === 'tiktok.com') {
      if ((m = path.match(/\/video\/(\d+)/))) {
        out.type = 'tiktok'; out.id = m[1]; out.vertical = true;
        out.embed = 'https://www.tiktok.com/embed/v2/' + m[1];
      }
      return out;
    }
    // Direct video file
    if (/\.(mp4|webm|mov|m4v)$/i.test(path)) { out.type = 'file'; out.embed = url; }
    return out;
  }

  function shapeOf(project, video) {
    var f = str(project.format).toLowerCase();
    if (f === 'vertical' || f === 'square' || f === 'landscape') return f;
    return video.vertical ? 'vertical' : 'landscape';
  }

  /* ---------------- site profile ---------------- */
  var ICONS = {
    youtube: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.8 15.1V8.9L15.2 12l-5.4 3.1Z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.8L17.8 3Zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5Z"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9.75h4v11H3v-11Zm6.5 0h3.8v1.5h.06c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.77 2.65 4.77 6.1v5.45h-4v-4.83c0-1.15-.02-2.63-1.6-2.63-1.6 0-1.85 1.25-1.85 2.55v4.91h-4v-11Z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.7.3-.2.3-.9.9-.9 2.2s1 2.6 1.1 2.7c.1.2 1.9 2.9 4.6 4.1 1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.5-.3Z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg>'
  };

  function socialHandle(key, url) {
    try {
      var p = new URL(url).pathname.replace(/\/+$/, '').split('/').filter(Boolean);
      var last = p[p.length - 1] || '';
      if (key === 'linkedin') return 'in/' + last;
      if (key === 'whatsapp') return 'Message me';
      return last.charAt(0) === '@' ? last : '@' + last;
    } catch (e) { return ''; }
  }

  function applySite(site) {
    if (!site) return;
    state.site = site;
    $$('[data-bind]').forEach(function (node) {
      var key = node.getAttribute('data-bind');
      var v = str(site[key]);
      if (v) node.textContent = v;
    });
    ampify();
    var email = str(site.email);
    if (email) $$('[data-bind-href="mailto"]').forEach(function (a) { a.href = 'mailto:' + email; });
    var yt = safeUrl(site.youtube);
    $$('[data-bind-href="youtube"]').forEach(function (a) { if (yt) a.href = yt; else a.hidden = true; });

    var status = $('.status');
    if (status) {
      status.setAttribute('data-available', site.available === false ? 'false' : 'true');
      if (site.available === false && !str(site.availability_text)) $('span', status).textContent = 'Currently booked';
    }

    // Tools
    if (Array.isArray(site.tools) && site.tools.length) {
      var toolsUl = $('[data-tools]');
      toolsUl.textContent = '';
      site.tools.map(str).filter(Boolean).forEach(function (t) {
        toolsUl.appendChild(el('li', null, [el('b', { 'aria-hidden': 'true', text: t.charAt(0).toUpperCase() }), t]));
      });
      var track = $('[data-tools-marquee]');
      track.textContent = '';
      var names = site.tools.map(str).filter(Boolean);
      var reps = reduceMotion ? 1 : Math.max(2, Math.ceil(16 / names.length)) * 2; // even number => seamless loop
      for (var r = 0; r < reps; r++) names.forEach(function (n) {
        track.appendChild(el('span', r > 0 ? { 'aria-hidden': 'true', text: n } : { text: n }));
      });
    }
    // Skills
    if (Array.isArray(site.skills) && site.skills.length) {
      var sk = $('[data-skills]');
      sk.textContent = '';
      site.skills.map(str).filter(Boolean).forEach(function (s) { sk.appendChild(el('li', { text: s })); });
    }
    // Socials
    var socials = $('[data-socials]');
    socials.textContent = '';
    var items = [
      ['youtube', 'YouTube'], ['instagram', 'Instagram'], ['x', 'X / Twitter'], ['linkedin', 'LinkedIn'], ['whatsapp', 'WhatsApp']
    ];
    items.forEach(function (it) {
      var key = it[0], url = str(site[key]);
      if (key === 'whatsapp' && url && !isHttp(url)) {
        var digits = url.replace(/[^\d]/g, '').replace(/^0/, '92');
        url = digits ? 'https://wa.me/' + digits : '';
      }
      url = safeUrl(url);
      if (!url) return;
      var a = el('a', { href: url, target: '_blank', rel: 'noopener me' });
      a.innerHTML = ICONS[key];
      a.appendChild(el('span', null, [it[1], el('small', { text: socialHandle(key, url) })]));
      a.appendChild(el('span', { class: 'arrow', 'aria-hidden': 'true', text: '↗' }));
      socials.appendChild(el('li', null, [a]));
    });
    // Showreel
    var reel = $('.js-reel');
    var reelUrl = str(site.showreel);
    if (reel && reelUrl && parseVideo(reelUrl).type !== 'none') {
      reel.hidden = false;
      reel.addEventListener('click', function () {
        openLightbox([{ title: 'Showreel', category: str(site.role) || 'Showreel', video: reelUrl, _video: parseVideo(reelUrl) }], 0, reel);
      });
    }
  }

  /* ---------------- projects ---------------- */
  function normalizeProjects(data) {
    var list = Array.isArray(data) ? data : (data && Array.isArray(data.projects) ? data.projects : []);
    var used = {};
    return list.filter(function (p) { return p && typeof p === 'object' && str(p.title) && !p.hidden; })
      .map(function (p) {
        var video = parseVideo(p.video);
        var slug = slugify(p.title), base = slug, n = 2;
        while (used[slug]) slug = base + '-' + (n++);
        used[slug] = true;
        var tags = Array.isArray(p.tags) ? p.tags.map(str).filter(Boolean) : (str(p.tags) ? str(p.tags).split(',').map(str).filter(Boolean) : []);
        return {
          title: str(p.title), client: str(p.client), category: str(p.category), year: str(p.year),
          description: str(p.description), tags: tags, thumbnail: asset(p.thumbnail), featured: !!p.featured,
          format: str(p.format), video: str(p.video), _video: video, slug: slug
        };
      });
  }

  function posterNode(p) {
    return el('div', { class: 'poster', 'aria-hidden': 'true' }, [
      el('span', { text: p.category || 'Project' }), el('b', { text: p.title }), el('span', { text: '▶ Play' })
    ]);
  }

  // Picks the best thumbnail: uploaded image > YouTube > Vimeo > Drive > designed poster.
  function setThumb(media, p) {
    var v = p._video;
    var img = el('img', { alt: '', loading: 'lazy', decoding: 'async' });
    var fallbacks = [];
    if (p.thumbnail) fallbacks.push(p.thumbnail);
    if (v.type === 'youtube') { fallbacks.push(v.thumb); fallbacks.push('https://i.ytimg.com/vi/' + v.id + '/hqdefault.jpg'); }
    if (v.type === 'drive') fallbacks.push(v.thumb);
    var poster = posterNode(p);

    function next() {
      var src = fallbacks.shift();
      if (!src) { if (img.parentNode) img.parentNode.removeChild(img); if (!poster.parentNode) media.insertBefore(poster, media.firstChild); return; }
      img.src = src;
    }
    img.addEventListener('load', function () {
      // YouTube returns a 120px grey placeholder when there is no HD thumbnail.
      if (/ytimg\.com/.test(img.src) && img.naturalWidth <= 120) { next(); return; }
      if (poster.parentNode) poster.parentNode.removeChild(poster);
    });
    img.addEventListener('error', next);
    media.insertBefore(poster, media.firstChild); // shown until an image loads
    media.insertBefore(img, poster.nextSibling);

    if (!fallbacks.length && v.type === 'vimeo' && v.oembed) {
      fetch(v.oembed).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        if (j && j.thumbnail_url) { fallbacks.push(String(j.thumbnail_url).replace(/_\d+x\d+/, '_1280x720')); fallbacks.push(j.thumbnail_url); next(); }
        else next();
      }).catch(next);
    } else next();
  }

  function renderFilters() {
    var bar = $('.filters');
    var counts = {}, order = [];
    state.projects.forEach(function (p) {
      var c = p.category; if (!c) return;
      var k = c.toLowerCase();
      if (!counts[k]) { counts[k] = { label: c, n: 0 }; order.push(k); }
      counts[k].n++;
    });
    bar.textContent = '';
    if (order.length < 2) { bar.hidden = true; state.filter = 'all'; return; }
    bar.hidden = false;
    function make(key, label, n) {
      var b = el('button', { type: 'button', class: 'filter', 'aria-pressed': String(state.filter === key), 'data-filter': key }, [label, el('small', { text: String(n) })]);
      b.addEventListener('click', function () {
        state.filter = key;
        $$('.filter', bar).forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-filter') === key)); });
        renderGrid();
      });
      return b;
    }
    bar.appendChild(make('all', 'All work', state.projects.length));
    order.forEach(function (k) { bar.appendChild(make(k, counts[k].label, counts[k].n)); });
  }

  function renderGrid() {
    var grid = $('[data-grid]');
    var empty = $('[data-empty]');
    grid.textContent = '';
    var f = state.filter;
    state.visible = state.projects.filter(function (p) { return f === 'all' || p.category.toLowerCase() === f; });
    $('[data-count]').textContent = pad(state.projects.length);
    if (!state.projects.length) { empty.hidden = false; grid.hidden = true; return; }
    empty.hidden = true; grid.hidden = false;

    state.visible.forEach(function (p, i) {
      var media = el('div', { class: 'card-project__media' }, [
        p.category ? el('span', { class: 'card-project__badge', text: p.category }) : null,
        el('span', { class: 'card-project__play', 'aria-hidden': 'true' })
      ]);
      setThumb(media, p);
      var sub = [p.client, p.tags.slice(0, 2).join(' · ')].filter(Boolean).join(' — ');
      var card = el('a', {
        href: '#p/' + p.slug, class: 'card-project' + (p.featured ? ' is-featured' : ''),
        'aria-label': 'Play ' + p.title + (p.client ? ' for ' + p.client : ''), 'data-index': String(i)
      }, [
        media,
        el('div', { class: 'card-project__meta' }, [
          el('span', { class: 'card-project__num', text: pad(state.projects.indexOf(p) + 1) }),
          el('div', { class: 'card-project__text' }, [
            el('h3', { class: 'card-project__title', text: p.title }),
            sub ? el('p', { class: 'card-project__sub', text: sub }) : null
          ]),
          p.year ? el('span', { class: 'card-project__year', text: p.year }) : null
        ])
      ]);
      card.style.animationDelay = Math.min(i, 8) * 60 + 'ms';
      card.addEventListener('click', function (e) { e.preventDefault(); openLightbox(state.visible, i, card); });
      grid.appendChild(card);
    });
  }

  /* ---------------- lightbox ---------------- */
  var lb = $('[data-lightbox]');
  var player = $('[data-player]');

  function fillLightbox() {
    var p = state.list[state.current];
    if (!p) return;
    var v = p._video || parseVideo(p.video);
    player.textContent = '';
    player.className = 'player';
    var shape = shapeOf(p, v);
    if (shape === 'vertical') player.classList.add('is-vertical');
    if (shape === 'square') player.classList.add('is-square');

    if (v.type === 'file') {
      var video = el('video', { src: v.embed, controls: true, autoplay: true, playsinline: true, preload: 'metadata' });
      if (p.thumbnail) video.setAttribute('poster', p.thumbnail);
      player.appendChild(video);
    } else if (v.embed) {
      player.appendChild(el('iframe', {
        src: v.embed, title: p.title + ' — video', loading: 'eager',
        allow: 'autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write',
        referrerpolicy: 'strict-origin-when-cross-origin'
      }));
    } else {
      var fb = el('div', { class: 'player__fallback' }, [
        el('div', null, [
          el('p', { text: v.link ? 'This video opens on its own website.' : 'No video link added yet.' }),
          v.link ? el('a', { class: 'btn btn--coral', href: v.link, target: '_blank', rel: 'noopener', text: 'Watch video ↗' }) : null
        ])
      ]);
      player.appendChild(fb);
    }

    $('[data-lb-cat]').textContent = p.category || '';
    $('[data-lb-cat]').hidden = !p.category;
    $('[data-lb-title]').textContent = p.title;
    var client = [p.client ? 'Client: ' + p.client : '', p.year].filter(Boolean).join(' · ');
    $('[data-lb-client]').textContent = client;
    $('[data-lb-client]').hidden = !client;
    $('[data-lb-desc]').textContent = p.description || '';
    $('[data-lb-desc]').hidden = !p.description;
    var tags = $('[data-lb-tags]');
    tags.textContent = '';
    (p.tags || []).forEach(function (t) { tags.appendChild(el('li', { text: t })); });
    tags.hidden = !(p.tags && p.tags.length);
    var open = $('[data-lb-open]');
    if (v.link) { open.href = v.link; open.hidden = false; } else { open.removeAttribute('href'); open.hidden = true; }

    var total = state.list.length;
    $('[data-lb-index]').textContent = total > 1 ? pad(state.current + 1) + ' / ' + pad(total) : '';
    $('[data-prev]').disabled = total < 2;
    $('[data-next]').disabled = total < 2;
    $('[data-prev]').hidden = total < 2;
    $('[data-next]').hidden = total < 2;

    if (p.slug && history.replaceState) {
      try { history.replaceState(null, '', '#p/' + p.slug); } catch (e) { /* ignore */ }
    }
  }

  function openLightbox(list, index, trigger) {
    state.list = list;
    state.current = index;
    state.lastFocus = trigger || document.activeElement;
    fillLightbox();
    lb.hidden = false;
    document.body.classList.add('is-locked');
    hideCursor();
    setTimeout(function () { var c = $('[data-close].icon-btn', lb); if (c) c.focus({ preventScroll: true }); }, 30);
  }
  function closeLightbox() {
    if (lb.hidden) return;
    lb.hidden = true;
    player.textContent = ''; // stops the video
    document.body.classList.remove('is-locked');
    if (location.hash.indexOf('#p/') === 0 && history.replaceState) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
    }
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus({ preventScroll: true });
  }
  function step(d) {
    if (state.list.length < 2) return;
    state.current = (state.current + d + state.list.length) % state.list.length;
    fillLightbox();
  }
  $$('[data-close]', lb).forEach(function (b) { b.addEventListener('click', closeLightbox); });
  $('[data-prev]').addEventListener('click', function () { step(-1); });
  $('[data-next]').addEventListener('click', function () { step(1); });
  document.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeLightbox(); }
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'Tab') {
      var f = $$('button:not([disabled]):not([hidden]), a[href]:not([hidden]), iframe, video', lb).filter(function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------------- custom cursor ---------------- */
  var cursor = $('.cursor');
  var cx = -200, cy = -200, raf = 0, cursorOn = false;
  function moveCursor() { raf = 0; cursor.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0) scale(' + (cursorOn ? 1 : 0) + ')'; }
  function hideCursor() { cursorOn = false; cursor.classList.remove('is-on'); moveCursor(); }
  if (finePointer && !reduceMotion && cursor) {
    document.documentElement.classList.add('has-cursor');
    document.addEventListener('pointermove', function (e) {
      cx = e.clientX; cy = e.clientY;
      var over = !!(e.target.closest && e.target.closest('.card-project')) && lb.hidden;
      if (over !== cursorOn) { cursorOn = over; cursor.classList.toggle('is-on', over); }
      if (!raf) raf = requestAnimationFrame(moveCursor);
    }, { passive: true });
    document.addEventListener('pointerleave', hideCursor);
  }

  /* ---------------- nav, menu, clock, misc ---------------- */
  var nav = $('.nav');
  function onScroll() { nav.classList.toggle('is-scrolled', window.scrollY > 20); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var toggle = $('.nav__toggle');
  var menu = $('#mobile-menu');
  function setMenu(open) {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.classList.toggle('is-locked', open);
    nav.classList.toggle('menu-open', open);
  }
  toggle.addEventListener('click', function () { setMenu(menu.hidden); });
  $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); toggle.focus(); } });
  window.addEventListener('resize', function () { if (window.innerWidth > 900 && !menu.hidden) setMenu(false); });

  // Active nav link
  if ('IntersectionObserver' in window) {
    var links = $$('.nav__links a');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) links.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#' + en.target.id); });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['work', 'about', 'skills', 'contact'].forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  }

  // Karachi clock
  var clock = $('.clock');
  function tick() {
    try {
      clock.textContent = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Karachi' }).format(new Date());
    } catch (e) { clock.textContent = ''; }
  }
  tick(); setInterval(tick, 15000);

  // REC timecode (25fps)
  var tc = $('.timecode'), t0 = Date.now();
  if (tc && !reduceMotion) setInterval(function () {
    var ms = Date.now() - t0, s = Math.floor(ms / 1000);
    tc.textContent = pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60) + ':' + pad(Math.floor((ms % 1000) / 40));
  }, 40);

  // Copy email
  var toast = $('[data-toast]'), toastTimer;
  function showToast(msg) { toast.textContent = msg; toast.classList.add('is-on'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { toast.classList.remove('is-on'); }, 2200); }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (res, rej) {
      var ta = el('textarea', { readonly: true, style: 'position:fixed;top:-100px;opacity:0' }); ta.value = text;
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? res() : rej(); } catch (e) { rej(e); } finally { document.body.removeChild(ta); }
    });
  }
  $$('[data-copy-email]').forEach(function (b) {
    b.addEventListener('click', function () {
      var email = (state.site && str(state.site.email)) || 'zubairhasan040@gmail.com';
      copyText(email).then(function () { showToast('Email copied ✓  ' + email); }, function () { showToast(email); });
    });
  });

  $$('[data-year]').forEach(function (n) { n.textContent = String(new Date().getFullYear()); });

  // Reveal on scroll
  function startReveals() {
    var hero = $('.hero');
    hero.classList.add('is-in');
    var items = $$('.reveal');
    if (!('IntersectionObserver' in window) || reduceMotion) { items.forEach(function (n) { n.classList.add('is-in'); }); return; }
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); ro.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    items.forEach(function (n) { ro.observe(n); });
  }
  var leaderShown = !document.documentElement.classList.contains('seen') && !reduceMotion;
  try { sessionStorage.setItem('zh-seen', '1'); } catch (e) { /* ignore */ }
  setTimeout(startReveals, leaderShown ? 1250 : 50);

  /* ---------------- boot ---------------- */
  ampify();
  Promise.all([loadJSON('content/site.json'), loadJSON('content/projects.json')]).then(function (res) {
    try { applySite(res[0]); } catch (e) { console.error('[portfolio] site.json', e); }
    state.projects = normalizeProjects(res[1]);
    renderFilters();
    renderGrid();
    // Deep link: #p/project-slug opens that project
    var h = decodeURIComponent(location.hash || '');
    if (h.indexOf('#p/') === 0) {
      var slug = h.slice(3);
      for (var i = 0; i < state.visible.length; i++) if (state.visible[i].slug === slug) { openLightbox(state.visible, i, null); break; }
    }
  });

  // Exposed for tests only
  window.__portfolio = { parseVideo: parseVideo, slugify: slugify };
})();
