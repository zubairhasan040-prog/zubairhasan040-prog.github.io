/* Zubair Hasan — portfolio v2 (dark cinematic)
   Plain JavaScript, no build step. Optional motion libraries (loaded from /assets/vendor):
     GSAP + ScrollTrigger (animation), Lenis (smooth scroll).
   If they fail to load, or the visitor prefers reduced motion, everything stays visible and works.
   Content comes from:
     content/site.json      (profile, bio, socials, tools, skills, photo)
     content/projects.json  (projects, managed at /admin)
*/
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var root = document.documentElement;
  var mq = function (q) { return !!(window.matchMedia && window.matchMedia(q).matches); };
  var reduceMotion = mq('(prefers-reduced-motion: reduce)');
  var finePointer = mq('(hover: hover) and (pointer: fine)');
  var gsap = window.gsap, ST = window.ScrollTrigger;
  var motion = !!(gsap && ST) && !reduceMotion;
  if (motion) { gsap.registerPlugin(ST); root.classList.add('motion'); }

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
  function wait(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  // Fraunces has a very decorative "&", so ampersands in serif text use the sans font.
  function ampify() {
    $$('.about__bio, .process h3, .service__name').forEach(function (node) {
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

  /* Split text into words (and optionally characters) while keeping inline elements like <em>.
     Screen readers get the plain text from aria-label on the container. */
  function splitText(node, chars) {
    if (!node || node.getAttribute('data-split-done')) return [];
    var text = node.textContent.replace(/\s+/g, ' ').trim();
    var out = [];
    var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), list = [], t;
    while ((t = walker.nextNode())) list.push(t);
    list.forEach(function (textNode) {
      if (textNode.parentNode.closest && textNode.parentNode.closest('sup')) return;
      var frag = document.createDocumentFragment();
      textNode.nodeValue.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
        var w = el('span', { class: 'word' });
        if (chars) {
          Array.prototype.forEach.call(part, function (ch) {
            var c = el('span', { class: 'char' + (ch === '&' ? ' amp' : ''), text: ch });
            w.appendChild(c); out.push(c);
          });
        } else { w.textContent = part; out.push(w); }
        frag.appendChild(w);
      });
      textNode.parentNode.replaceChild(frag, textNode);
    });
    node.setAttribute('data-split-done', '1');
    if (chars) { node.setAttribute('aria-label', text); $$('.word', node).forEach(function (w) { w.setAttribute('aria-hidden', 'true'); }); }
    return out;
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

    // Photo (optional field). Falls back to the built-in cut-out.
    var photo = asset(site.photo);
    if (photo && !/zubair-cut\.(webp|png)$/.test(photo)) {
      $$('img[data-photo]').forEach(function (img) {
        var pic = img.parentNode;
        $$('source', pic).forEach(function (s) { s.parentNode.removeChild(s); });
        img.src = photo;
        var frame = img.closest('.portrait, .about__frame');
        if (frame && !/\.(png|webp)$/i.test(photo)) frame.classList.add('is-card'); // a non-transparent photo is shown as a card
      });
    }

    var status = $('.status');
    if (status) {
      status.setAttribute('data-available', site.available === false ? 'false' : 'true');
      if (site.available === false && !str(site.availability_text)) $('span', status).textContent = 'Currently booked';
    }

    var tools = Array.isArray(site.tools) ? site.tools.map(str).filter(Boolean) : [];
    var skills = Array.isArray(site.skills) ? site.skills.map(str).filter(Boolean) : [];
    // Tools
    if (tools.length) {
      var toolsUl = $('[data-tools]');
      toolsUl.textContent = '';
      tools.forEach(function (t) { toolsUl.appendChild(el('li', null, [el('b', { 'aria-hidden': 'true', text: t.charAt(0).toUpperCase() }), t])); });
      fillMarquee($('[data-tools-marquee]'), tools, true);
    }
    // Skills
    if (skills.length) {
      var sk = $('[data-skills]');
      sk.textContent = '';
      skills.forEach(function (s) { sk.appendChild(el('li', { text: s })); });
      fillMarquee($('[data-skills-marquee]'), skills, false);
    }
    var st = $('[data-stat="tools"]'); if (st && tools.length) st.textContent = pad(tools.length);
    var ss = $('[data-stat="skills"]'); if (ss && skills.length) ss.textContent = pad(skills.length);

    // Socials
    var socials = $('[data-socials]');
    socials.textContent = '';
    var items = [['youtube', 'YouTube'], ['instagram', 'Instagram'], ['x', 'X / Twitter'], ['linkedin', 'LinkedIn'], ['whatsapp', 'WhatsApp']];
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

  function fillMarquee(track, names, firstReadable) {
    if (!track || !names.length) return;
    track.textContent = '';
    var reps = reduceMotion ? 1 : Math.max(2, Math.ceil(16 / names.length)) * 2; // even number => seamless loop
    for (var r = 0; r < reps; r++) names.forEach(function (n) {
      track.appendChild(el('span', (r > 0 || !firstReadable) ? { 'aria-hidden': 'true', text: n } : { text: n }));
    });
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

  var refreshSoon = debounce(function () { if (motion) ST.refresh(); }, 250);

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
      refreshSoon();
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
        if (state.filter === key) return;
        state.filter = key;
        $$('.filter', bar).forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-filter') === key)); });
        renderGrid(true);
      });
      return b;
    }
    bar.appendChild(make('all', 'All work', state.projects.length));
    order.forEach(function (k) { bar.appendChild(make(k, counts[k].label, counts[k].n)); });
  }

  function renderGrid(fromFilter) {
    var grid = $('[data-grid]');
    var empty = $('[data-empty]');
    grid.textContent = '';
    var f = state.filter;
    state.visible = state.projects.filter(function (p) { return f === 'all' || p.category.toLowerCase() === f; });
    $('[data-count]').textContent = pad(state.projects.length);
    if (!state.projects.length) { empty.hidden = false; grid.hidden = true; setupReel(); return; }
    empty.hidden = true; grid.hidden = false;

    state.visible.forEach(function (p, i) {
      var shape = shapeOf(p, p._video);
      var media = el('div', { class: 'card-project__media' }, [
        p.category ? el('span', { class: 'card-project__badge', text: p.category }) : null,
        el('span', { class: 'card-project__play', 'aria-hidden': 'true' })
      ]);
      setThumb(media, p);
      var sub = [p.client, p.tags.slice(0, 2).join(' · ')].filter(Boolean).join(' — ');
      var card = el('a', {
        href: '#p/' + p.slug, class: 'card-project' + (p.featured ? ' is-featured' : ''), 'data-shape': shape,
        'aria-label': 'Play ' + p.title + (p.client ? ' for ' + p.client : ''), 'data-index': String(i), 'data-cursor': 'play', 'data-cursor-label': 'Play'
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
      card.addEventListener('click', function (e) {
        e.preventDefault();
        if (dragState.moved) return; // a drag on the reel is not a click
        openLightbox(state.visible, i, card);
      });
      bindTilt(card);
      grid.appendChild(card);
    });
    setupReel(fromFilter);
  }

  /* ---------------- lightbox ---------------- */
  var lb = $('[data-lightbox]');
  var player = $('[data-player]');

  function shareUrl(p) { return location.origin + location.pathname + '#p/' + p.slug; }

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
      player.appendChild(el('div', { class: 'player__fallback' }, [
        el('div', null, [
          el('p', { text: v.link ? 'This video opens on its own website.' : 'No video link added yet.' }),
          v.link ? el('a', { class: 'btn btn--coral', href: v.link, target: '_blank', rel: 'noopener' }, [el('span', { text: 'Watch video ↗' })]) : null
        ])
      ]));
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

    var share = $('[data-lb-share]');
    if (p.slug) {
      var url = shareUrl(p), text = p.title + ' — ' + ((state.site && str(state.site.name)) || 'Zubair Hasan');
      share.hidden = false;
      $('[data-share="whatsapp"]', share).href = 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + url);
      $('[data-share="x"]', share).href = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url);
    } else share.hidden = true;

    var total = state.list.length;
    $('[data-lb-index]').textContent = total > 1 ? pad(state.current + 1) + ' / ' + pad(total) : '';
    ['[data-prev]', '[data-next]'].forEach(function (s) { $(s).disabled = total < 2; $(s).hidden = total < 2; });

    if (p.slug && history.replaceState) {
      try { history.replaceState(null, '', '#p/' + p.slug); } catch (e) { /* ignore */ }
    }
  }

  function lockScroll(on) {
    document.body.classList.toggle('is-locked', on);
    if (lenis) { if (on) lenis.stop(); else lenis.start(); }
  }
  function openLightbox(list, index, trigger) {
    state.list = list;
    state.current = index;
    state.lastFocus = trigger || document.activeElement;
    fillLightbox();
    lb.hidden = false;
    lockScroll(true);
    cursorHide(true);
    setTimeout(function () { var c = $('[data-close].icon-btn', lb); if (c) c.focus({ preventScroll: true }); }, 30);
  }
  function closeLightbox() {
    if (lb.hidden) return;
    lb.hidden = true;
    player.textContent = ''; // stops the video
    lockScroll(false);
    cursorHide(false);
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
  $('[data-share="copy"]').addEventListener('click', function () {
    var p = state.list[state.current]; if (!p || !p.slug) return;
    var url = shareUrl(p);
    copyText(url).then(function () { showToast('Link copied ✓'); }, function () { showToast(url); });
  });
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

  /* ---------------- smooth scroll (Lenis) ---------------- */
  var lenis = null;
  if (motion && window.Lenis) {
    try {
      lenis = new window.Lenis({ lerp: 0.095, smoothWheel: true, wheelMultiplier: 1, anchors: false });
      lenis.on('scroll', ST.update);
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
    } catch (e) { lenis = null; }
  }
  function scrollToTarget(target) {
    var y = 0;
    if (target && target.id !== 'top') y = target.getBoundingClientRect().top + window.scrollY - (target.id === 'work' ? 40 : 10);
    if (lenis) lenis.scrollTo(Math.max(0, y), { duration: 1.4 });
    else window.scrollTo({ top: Math.max(0, y), behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var href = a.getAttribute('href');
    if (href.indexOf('#p/') === 0 || href === '#') return;
    var target = href === '#top' ? null : document.getElementById(href.slice(1));
    if (href !== '#top' && !target) return;
    e.preventDefault();
    if (!menu.hidden) setMenu(false);
    scrollToTarget(target);
    if (target && history.replaceState) { try { history.replaceState(null, '', href); } catch (er) { /* ignore */ } }
  });

  /* ---------------- custom cursor ---------------- */
  var cursor = $('.cursor');
  var cursorOn = finePointer && !reduceMotion && !!cursor;
  var cursorLabel = cursor ? $('.cursor__label', cursor) : null;
  var cur = { x: -200, y: -200, rx: -200, ry: -200 }, curMode = '';
  function cursorHide(hide) { if (cursor) cursor.classList.toggle('is-hidden', !!hide); }
  if (cursorOn) {
    root.classList.add('has-cursor');
    var dot = $('.cursor__dot', cursor), ring = $('.cursor__ring', cursor);
    var setMode = function (mode, label) {
      var key = mode + '|' + (label || '');
      if (key === curMode) return; curMode = key;
      cursor.classList.remove('is-link', 'is-label', 'is-view', 'is-play', 'is-drag');
      if (mode === 'link') cursor.classList.add('is-link');
      else if (mode) { cursor.classList.add('is-label', 'is-' + mode); cursorLabel.textContent = label || mode; }
    };
    document.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      cur.x = e.clientX; cur.y = e.clientY;
      var t = e.target;
      var c = t.closest && t.closest('[data-cursor]');
      if (c) setMode(c.getAttribute('data-cursor'), c.getAttribute('data-cursor-label'));
      else if (t.closest && t.closest('[data-reel-drag]')) setMode('drag', 'Drag');
      else if (t.closest && t.closest('a, button, [role="button"], .service, label, .filter')) setMode('link');
      else setMode('');
    }, { passive: true });
    document.addEventListener('pointerleave', function () { cur.x = cur.y = -200; });
    document.documentElement.addEventListener('mouseleave', function () { cursorHide(true); });
    document.documentElement.addEventListener('mouseenter', function () { if (lb.hidden) cursorHide(false); });
    var loopCursor = function () {
      cur.rx += (cur.x - cur.rx) * 0.18; cur.ry += (cur.y - cur.ry) * 0.18;
      dot.style.transform = 'translate3d(' + cur.x + 'px,' + cur.y + 'px,0)';
      ring.style.transform = 'translate3d(' + cur.rx + 'px,' + cur.ry + 'px,0)';
      requestAnimationFrame(loopCursor);
    };
    requestAnimationFrame(loopCursor);
  }

  /* ---------------- magnetic buttons + card tilt ---------------- */
  function bindMagnetic(node) {
    if (!motion || !finePointer || node.__mag) return;
    node.__mag = true;
    var inner = node.querySelector('span');
    node.addEventListener('pointermove', function (e) {
      var r = node.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      gsap.to(node, { x: dx * 0.28, y: dy * 0.38, duration: 0.6, ease: 'power3.out' });
      if (inner) gsap.to(inner, { x: dx * 0.12, y: dy * 0.16, duration: 0.6, ease: 'power3.out' });
    });
    node.addEventListener('pointerleave', function () {
      gsap.to(node, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.4)' });
      if (inner) gsap.to(inner, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.4)' });
    });
  }
  function bindTilt(card) {
    if (!motion || !finePointer) return;
    var media = card.querySelector('.card-project__media');
    card.addEventListener('pointermove', function (e) {
      var r = media.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      gsap.to(media, { rotateY: px * 7, rotateX: -py * 7, duration: 0.6, ease: 'power3.out', transformPerspective: 900 });
    });
    card.addEventListener('pointerleave', function () { gsap.to(media, { rotateY: 0, rotateX: 0, duration: 0.8, ease: 'power3.out' }); });
  }
  $$('.magnetic').forEach(bindMagnetic);

  /* ---------------- horizontal reel (desktop) ---------------- */
  var reelEl = $('[data-reel]'), gridEl = $('[data-grid]');
  var reelST = null, reelTween = null;
  var dragState = { down: false, moved: false, x: 0, y: 0 };
  function wantsHorizontal() { return motion && window.innerWidth >= 1024 && window.innerHeight >= 560 && state.visible.length >= 3; }
  function setupReel(fromFilter) {
    if (!motion) return;
    if (reelTween) { reelTween.scrollTrigger && reelTween.scrollTrigger.kill(); reelTween.kill(); reelTween = null; reelST = null; }
    gsap.set(gridEl, { clearProps: 'transform' });
    var horiz = wantsHorizontal();
    reelEl.classList.toggle('is-horizontal', horiz);
    if (horiz) reelEl.setAttribute('data-reel-drag', ''); else reelEl.removeAttribute('data-reel-drag');
    var cards = $$('.card-project', gridEl);
    if (horiz) {
      var dist = function () { return Math.max(0, gridEl.scrollWidth - window.innerWidth); };
      reelTween = gsap.to(gridEl, {
        x: function () { return -dist(); }, ease: 'none',
        scrollTrigger: {
          trigger: reelEl, start: 'center 52%', end: function () { return '+=' + dist(); },
          pin: true, scrub: 0.8, invalidateOnRefresh: true, anticipatePin: 1
        }
      });
      reelST = reelTween.scrollTrigger;
      gsap.fromTo(cards, { opacity: 0, x: 120 }, { opacity: 1, x: 0, duration: 1.1, ease: 'expo.out', stagger: 0.07, overwrite: true,
        scrollTrigger: fromFilter ? null : { trigger: reelEl, start: 'top 85%', once: true } });
    } else if (cards.length) {
      ST.batch(cards, {
        start: 'top 92%', once: true,
        onEnter: function (els) { gsap.fromTo(els, { opacity: 0, y: 70, clipPath: 'inset(12% 0 0 0)' }, { opacity: 1, y: 0, clipPath: 'inset(0% 0 0 0)', duration: 1.1, ease: 'expo.out', stagger: 0.08, overwrite: true, clearProps: 'clipPath' }); }
      });
      if (fromFilter) gsap.fromTo(cards, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.05, overwrite: true });
    }
    ST.refresh();
  }
  // Drag the reel with the mouse (scrolls the page, which moves the pinned reel).
  reelEl.addEventListener('pointerdown', function (e) {
    if (!reelST || e.pointerType !== 'mouse' || e.button !== 0) return;
    dragState.down = true; dragState.moved = false; dragState.x = e.clientX; dragState.start = window.scrollY;
  });
  window.addEventListener('pointermove', function (e) {
    if (!dragState.down) return;
    var dx = e.clientX - dragState.x;
    if (Math.abs(dx) > 6) dragState.moved = true;
    if (dragState.moved) {
      var y = dragState.start - dx * 1.4;
      if (lenis) lenis.scrollTo(y, { immediate: true }); else window.scrollTo(0, y);
    }
  });
  window.addEventListener('pointerup', function () {
    if (!dragState.down) return;
    dragState.down = false;
    setTimeout(function () { dragState.moved = false; }, 0);
  });
  reelEl.addEventListener('dragstart', function (e) { e.preventDefault(); });
  var lastMode = null;
  window.addEventListener('resize', debounce(function () {
    var m = wantsHorizontal();
    if (m !== lastMode) { lastMode = m; if (state.projects.length) setupReel(true); }
  }, 200));

  /* ---------------- nav, menu, clock, misc ---------------- */
  var nav = $('.nav');
  var progressBar = $('.progress i');
  function onScroll() {
    nav.classList.toggle('is-scrolled', window.scrollY > 20);
    var max = document.documentElement.scrollHeight - window.innerHeight;
    if (progressBar) progressBar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var toggle = $('.nav__toggle');
  var menu = $('#mobile-menu');
  function setMenu(open) {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    lockScroll(open);
    nav.classList.toggle('menu-open', open);
    if (open && motion) gsap.fromTo($$('nav a', menu), { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.8, ease: 'expo.out', stagger: 0.06, delay: 0.1 });
  }
  toggle.addEventListener('click', function () { setMenu(menu.hidden); });
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
    ['work', 'services', 'about', 'contact'].forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  }

  // Karachi clock
  function tick() {
    var txt = '';
    try { txt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Karachi' }).format(new Date()); } catch (e) { /* ignore */ }
    $$('.clock').forEach(function (c) { c.textContent = txt; });
  }
  tick(); setInterval(tick, 15000);

  // REC timecodes (25fps)
  var tcs = $$('.timecode, .empty__tc'), t0 = Date.now();
  if (tcs.length && !reduceMotion) setInterval(function () {
    var ms = Date.now() - t0, s = Math.floor(ms / 1000);
    var t = pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60) + ':' + pad(Math.floor((ms % 1000) / 40));
    tcs.forEach(function (n) { if (n.offsetParent !== null) n.textContent = t; });
  }, 40);

  // Copy email
  var toast = $('[data-toast]'), toastTimer;
  function showToast(msg) { toast.textContent = msg; toast.classList.add('is-on'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { toast.classList.remove('is-on'); }, 2200); }
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (res, rej) {
      var ta = el('textarea', { readonly: true, style: 'position:fixed;top:-100px;opacity:0' }); ta.value = text;
      document.body.appendChild(ta); ta.select();
      try { if (document.execCommand('copy')) res(); else rej(); } catch (e) { rej(e); } finally { document.body.removeChild(ta); }
    });
  }
  $$('[data-copy-email]').forEach(function (b) {
    b.addEventListener('click', function () {
      var email = (state.site && str(state.site.email)) || 'zubairhasan040@gmail.com';
      copyText(email).then(function () { showToast('Email copied ✓  ' + email); }, function () { showToast(email); });
    });
  });

  $$('[data-year]').forEach(function (n) { n.textContent = String(new Date().getFullYear()); });

  /* ---------------- WebGL hero ---------------- */
  function startHeroGL() {
    var canvas = $('.hero__gl');
    if (!canvas) return;
    var gl = null;
    try { gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: false }); } catch (e) { gl = null; }
    if (!gl) return; // CSS gradient on the canvas stays as the fallback
    var vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    var fs = [
      'precision mediump float;',
      'uniform vec2 r;uniform float t;uniform vec2 m;uniform float s;',
      'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
      'float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);',
      ' return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}',
      'float fbm(vec2 p){float v=0.,a=.5;mat2 R=mat2(.8,.6,-.6,.8);for(int i=0;i<5;i++){v+=a*n(p);p=R*p*2.02;a*=.5;}return v;}',
      'void main(){',
      ' vec2 uv=gl_FragCoord.xy/r; float asp=r.x/r.y; vec2 p=vec2((uv.x-.5)*asp,uv.y-.5);',
      ' vec2 mp=vec2((m.x-.5)*asp,m.y-.5);',
      ' float T=t*.06;',
      ' vec2 q=vec2(fbm(p*1.4+vec2(T,-T*.6)),fbm(p*1.4+vec2(-T*.8,T)+3.1));',
      ' vec2 w=p+ (q-.5)*.9 + (mp-p)*.08;',
      ' float f=fbm(w*1.8+vec2(T*1.4,T*.5));',
      ' float dm=length(p-mp);',
      ' float lamp=exp(-dm*dm*3.5);',
      ' vec2 c1=vec2(.32*asp,.12); float blob=exp(-pow(length(p-c1+ (q-.5)*.4),2.)*2.6);',
      ' vec3 base=vec3(.043,.039,.031);',
      ' vec3 coral=vec3(.184,.42,1.); vec3 cream=vec3(.969,.929,.722);',
      ' vec3 col=base;',
      ' float k=mix(.62,1.,clamp(asp-.4,0.,1.));',
      ' col+=coral*pow(f,2.6)*(.3+.85*blob+.6*lamp)*.62*k;',
      ' col+=cream*pow(f,6.)*(.25+.6*lamp)*.5;',
      ' col+=coral*lamp*.06;',
      ' float flare=exp(-abs(p.y-mp.y)*55.)*exp(-abs(p.x-mp.x)*1.8)*.10; col+=cream*flare*s;',
      ' vec2 g=uv*vec2(asp,1.)*26.+vec2(0.,t*.12); vec2 gi=floor(g); vec2 gf=fract(g);',
      ' vec2 pt=vec2(h(gi+3.1),h(gi+8.7))*.8+.1; float tw=fract(t*.12+h(gi+5.3));',
      ' float sp=step(.86,h(gi))*smoothstep(.09,.0,length(gf-pt))*sin(tw*3.14159);',
      ' col+=mix(cream,coral,h(gi+1.7))*sp*.55;',
      ' float vg=smoothstep(1.25,.25,length(vec2(p.x/asp*1.2,p.y)));',
      ' col*=mix(.55,1.,vg);',
      ' col+=(h(gl_FragCoord.xy+fract(t))-.5)*.025;',
      ' gl_FragColor=vec4(col,1.);',
      '}'
    ].join('\n');
    function sh(type, src) { var o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) { console.warn('[portfolio] shader', gl.getShaderInfoLog(o)); return null; } return o; }
    var v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return;
    var prog = gl.createProgram(); gl.attachShader(prog, v); gl.attachShader(prog, f); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var uR = gl.getUniformLocation(prog, 'r'), uT = gl.getUniformLocation(prog, 't'), uM = gl.getUniformLocation(prog, 'm'), uS = gl.getUniformLocation(prog, 's');
    var scale = 1, mouse = { x: 0.72, y: 0.6, tx: 0.72, ty: 0.6 };
    function resize() {
      var small = window.innerWidth < 700;
      scale = Math.min(window.devicePixelRatio || 1, small ? 1 : 1.25) * (small ? 0.6 : 0.55);
      var w = Math.max(2, Math.round(canvas.clientWidth * scale)), hgt = Math.max(2, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== hgt) { canvas.width = w; canvas.height = hgt; }
      gl.viewport(0, 0, w, hgt);
    }
    resize();
    window.addEventListener('resize', debounce(function () { resize(); if (reduceMotion) draw(18); }, 120));
    window.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect();
      if (e.clientY > r.bottom) return;
      mouse.tx = (e.clientX - r.left) / r.width; mouse.ty = 1 - (e.clientY - r.top) / r.height;
    }, { passive: true });
    function draw(time) {
      mouse.x += (mouse.tx - mouse.x) * 0.05; mouse.y += (mouse.ty - mouse.y) * 0.05;
      gl.uniform2f(uR, canvas.width, canvas.height); gl.uniform1f(uT, time); gl.uniform2f(uM, mouse.x, mouse.y); gl.uniform1f(uS, scale);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    if (reduceMotion) { draw(18); return; }
    var visible = true, running = false, start = performance.now();
    function frame(now) { if (!visible || document.hidden) { running = false; return; } draw(10 + (now - start) / 1000); requestAnimationFrame(frame); }
    function kick() { if (!running && visible && !document.hidden) { running = true; requestAnimationFrame(frame); } }
    if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; kick(); }).observe(canvas);
    document.addEventListener('visibilitychange', kick);
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); visible = false; });
    kick();
  }

  /* ---------------- motion: loader, intro, scroll animations ---------------- */
  var heroChars = [], introPlayed = false;
  function prepareHero() {
    if (!motion || introPlayed) return; // never hide the hero after the intro already ran
    heroChars = [];
    $$('.hero__title [data-split]').forEach(function (n) { heroChars = heroChars.concat(splitText(n, true)); });
    gsap.set(heroChars, { yPercent: 115, rotate: 6, opacity: 0 });
    gsap.set('[data-hero-fade]', { y: 30, opacity: 0 });
    gsap.set('[data-hero-photo]', { opacity: 0 });
    gsap.set('.portrait__arch', { clipPath: 'inset(100% 0% 0% 0% round 999px 999px 28px 28px)' });
    gsap.set('.portrait__img', { yPercent: 18, opacity: 0, scale: 1.06 });
    gsap.set(['.badge', '.badge__core', '.rec', '.portrait__vt'], { opacity: 0, scale: 0.6 });
  }
  function playIntro() {
    if (!motion || introPlayed) return;
    introPlayed = true;
    var tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.to(heroChars, { yPercent: 0, rotate: 0, opacity: 1, duration: 1.3, stagger: 0.028 }, 0)
      .to('[data-hero-fade]', { y: 0, opacity: 1, duration: 1.1, stagger: 0.08 }, 0.25)
      .to('[data-hero-photo]', { opacity: 1, duration: 0.01 }, 0.1)
      .to('.portrait__arch', { clipPath: 'inset(0% 0% 0% 0% round 999px 999px 28px 28px)', duration: 1.4, ease: 'expo.inOut' }, 0.1)
      .to('.portrait__img', { yPercent: 0, opacity: 1, scale: 1, duration: 1.5 }, 0.55)
      .to(['.portrait__vt', '.rec', '.badge', '.badge__core'], { opacity: 1, scale: 1, duration: 1, stagger: 0.08, ease: 'back.out(1.6)' }, 0.9);
    return tl;
  }

  function runLoader(ready) {
    var loader = $('.loader');
    if (!loader) return Promise.resolve();
    if (!motion) { loader.classList.add('is-done'); return Promise.resolve(); }
    var seen = root.classList.contains('seen');
    var countEl = $('[data-loader-count]', loader), bar = $('[data-loader-bar]', loader);
    var o = { v: 0 };
    var render = function () { var v = Math.round(o.v); countEl.textContent = pad(v); bar.style.transform = 'scaleX(' + (v / 100) + ')'; };
    loader.style.animation = 'none'; // JS owns it now; it always finishes below.
    gsap.from('.loader__inner > *', { y: 20, opacity: 0, duration: 0.6, stagger: 0.06, ease: 'power3.out' });
    var first = new Promise(function (res) { gsap.to(o, { v: 86, duration: seen ? 0.5 : 1.6, ease: 'power2.inOut', onUpdate: render, onComplete: res }); });
    var capped = Promise.race([ready, wait(4500)]);
    return Promise.all([first, capped]).then(function () {
      return new Promise(function (res) {
        var tl = gsap.timeline({ onComplete: function () { loader.classList.add('is-done'); res(); } });
        tl.to(o, { v: 100, duration: 0.45, ease: 'power2.out', onUpdate: render })
          .to('.loader__inner', { yPercent: -30, opacity: 0, duration: 0.6, ease: 'power3.in' }, '+=0.05')
          .to('.loader__curtain--top', { yPercent: -100, duration: 1.05, ease: 'expo.inOut' }, '-=0.15')
          .to('.loader__curtain--bottom', { yPercent: 100, duration: 1.05, ease: 'expo.inOut' }, '<')
          .add(function () { playIntro(); }, '-=0.75');
      });
    });
  }

  function scrollAnimations() {
    if (!motion) return;
    // Generic reveals
    var reveals = $$('[data-reveal]');
    gsap.set(reveals, { y: 50, opacity: 0 });
    ST.batch(reveals, {
      start: 'top 92%', once: true,
      onEnter: function (els) { gsap.to(els, { y: 0, opacity: 1, duration: 1.1, ease: 'expo.out', stagger: 0.09, overwrite: true }); }
    });
    // Titles: word-by-word rise
    $$('[data-reveal-title]').forEach(function (title) {
      var words = splitText(title, false);
      gsap.set(words, { yPercent: 60, opacity: 0, rotateX: -50, transformOrigin: '50% 100%' });
      ST.create({ trigger: title, start: 'top 90%', once: true, onEnter: function () {
        gsap.to(words, { yPercent: 0, opacity: 1, rotateX: 0, duration: 1.2, ease: 'expo.out', stagger: 0.06 });
      } });
    });
    // Contact title (chars)
    var cchars = [];
    $$('.contact__title [data-split]').forEach(function (n) { cchars = cchars.concat(splitText(n, true)); });
    gsap.set(cchars, { yPercent: 115, opacity: 0 });
    ST.create({ trigger: '.contact__title', start: 'top 88%', once: true, onEnter: function () {
      gsap.to(cchars, { yPercent: 0, opacity: 1, duration: 1.2, ease: 'expo.out', stagger: 0.02 });
    } });
    // Manifesto: words light up while scrolling
    var mWords = splitText($('[data-scrub-words]'), false);
    gsap.fromTo(mWords, { opacity: 0.14 }, { opacity: 1, ease: 'none', stagger: 0.1,
      scrollTrigger: { trigger: '.manifesto__text', start: 'top 80%', end: 'bottom 50%', scrub: 0.6 } });
    // Stats count up
    $$('[data-countup]').forEach(function (b) {
      var end = parseInt(b.textContent, 10) || 0, o = { v: 0 };
      ST.create({ trigger: b, start: 'top 92%', once: true, onEnter: function () {
        gsap.to(o, { v: end, duration: 1.8, ease: 'power3.out', onUpdate: function () { b.textContent = pad(Math.round(o.v)); } });
      } });
    });
    // Hero parallax on the way out
    gsap.to('.hero__copy', { yPercent: -12, opacity: 0.25, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.hero__photo .portrait', { yPercent: 14, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    // About photo: clip reveal + parallax
    gsap.fromTo('[data-clip-reveal] .about__frame', { clipPath: 'inset(16% 12% 16% 12% round 22px)' }, { clipPath: 'inset(0% 0% 0% 0% round 22px)', ease: 'none',
      scrollTrigger: { trigger: '.about', start: 'top 85%', end: 'top 25%', scrub: 0.6 } });
    gsap.fromTo('.about__img', { yPercent: 10, scale: 1.08 }, { yPercent: -4, scale: 1, ease: 'none', scrollTrigger: { trigger: '.about', start: 'top bottom', end: 'bottom top', scrub: true } });
    // Process meter
    gsap.to('[data-process-meter]', { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '.process', start: 'top 70%', end: 'bottom 60%', scrub: true } });
    // Footer giant name
    gsap.fromTo('.footer__giant span', { yPercent: 40, opacity: 0.2 }, { yPercent: 0, opacity: 1, ease: 'none', scrollTrigger: { trigger: '.footer', start: 'top bottom', end: 'bottom bottom', scrub: true } });
    // Empty-state screen
    gsap.fromTo('.empty__screen', { scale: 0.9, clipPath: 'inset(10% 10% 10% 10% round 22px)' }, { scale: 1, clipPath: 'inset(0% 0% 0% 0% round 22px)', ease: 'none',
      scrollTrigger: { trigger: '.empty', start: 'top 95%', end: 'top 40%', scrub: 0.6 } });
    marquees();
  }

  // Marquees: constant drift that speeds up and skews with scroll velocity, and flips with scroll direction.
  function marquees() {
    var tracks = [
      { el: $('[data-tools-marquee]'), speed: 0.022, dir: -1, x: 0 },
      { el: $('[data-skills-marquee]'), speed: 0.016, dir: 1, x: -50 }
    ].filter(function (t) { return t.el; });
    var vel = 0, skew = 0, scrollDir = 1;
    ST.create({ start: 0, end: 'max', onUpdate: function (self) { vel = self.getVelocity(); if (self.direction) scrollDir = self.direction; } });
    gsap.ticker.add(function (time, delta) {
      vel *= 0.92;
      var boost = 1 + Math.min(Math.abs(vel) / 220, 9);
      skew += ((Math.max(-12, Math.min(12, vel / -160))) - skew) * 0.12;
      tracks.forEach(function (t) {
        t.x += t.dir * scrollDir * t.speed * boost * (delta / 16.67);
        if (t.x <= -50) t.x += 50; if (t.x > 0) t.x -= 50;
        t.el.style.transform = 'translate3d(' + t.x + '%,0,0) skewX(' + skew.toFixed(2) + 'deg)';
      });
    });
  }

  /* ---------------- boot ---------------- */
  ampify();
  startHeroGL();
  var photoReady = new Promise(function (res) {
    var img = $('.portrait__img');
    if (!img || img.complete) return res();
    img.addEventListener('load', res); img.addEventListener('error', res);
  });
  var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready.catch(function () {}) : Promise.resolve();
  var dataReady = Promise.all([loadJSON('content/site.json'), loadJSON('content/projects.json')]).then(function (res) {
    try { applySite(res[0]); } catch (e) { console.error('[portfolio] site.json', e); }
    state.projects = normalizeProjects(res[1]);
    renderFilters();
    return true;
  });
  var ready = Promise.all([dataReady, Promise.race([Promise.all([fontsReady, photoReady]), wait(3000)])]).then(function () {
    prepareHero();
    scrollAnimations();
    renderGrid();
    lastMode = wantsHorizontal();
  });
  try { sessionStorage.setItem('zh-seen', '1'); } catch (e) { /* ignore */ }
  ready.catch(function (e) { console.error('[portfolio]', e); });
  runLoader(ready.catch(function () {})).then(function () {
    if (!motion) return;
    ST.refresh();
  });
  ready.then(function () {
    var h = decodeURIComponent(location.hash || '');
    if (h.indexOf('#p/') === 0) {
      var slug = h.slice(3);
      for (var i = 0; i < state.visible.length; i++) if (state.visible[i].slug === slug) { openLightbox(state.visible, i, null); break; }
    }
  });
  window.addEventListener('load', function () { if (motion) ST.refresh(); });

  // Exposed for tests only
  window.__portfolio = { parseVideo: parseVideo, slugify: slugify };
})();
